#include "EspadaEngineHybridObject.hpp"

#include <cmath>
#include <cstdint>
#include <stdexcept>

namespace margelo::nitro::espada::engine {

using namespace margelo::nitro;

namespace {

// both C ABI callbacks (`handleProgress`/`handleSettle` below) receive this
// as `user_data`. it is heap-allocated in `start()` and owned entirely by
// that raw pointer from then on — nothing here reaches back into `this`
// (the `EspadaEngineHybridObject`), which is what lets `release()` and the
// destructor free `_job` (and, with it, this HybridObject) while a worker
// thread is still mid-run: the callbacks it eventually fires only touch
// this struct, not the HybridObject that started them.
//
// `handleSettle` deletes it, exactly once, matching the C ABI's own
// "settles exactly once" contract for `settle_cb`.
struct RunningJob {
  std::function<void(double)> onProgress;
  std::function<void(EspadaJobStatus, double, const std::optional<std::string>&)> onSettled;
};

// same role as `RunningJob` above, for an equity job's callbacks instead —
// heap-allocated in `startEquity()`, owned entirely by the raw pointer
// handed to the C ABI as `user_data` from then on, and deleted, exactly
// once, by `handleEquitySettle` below.
struct RunningEquityJob {
  std::function<void(double, const std::optional<std::vector<EspadaEquityPlayerResult>>&)> onProgress;
  std::function<void(EspadaEquityJobStatus, const std::optional<std::vector<EspadaEquityPlayerResult>>&,
                      const std::optional<std::string>&)>
      onSettled;
};

// converts a C ABI `::EspadaEquityPlayerResult` array into the Nitrogen-generated
// `std::optional<std::vector<EspadaEquityPlayerResult>>` shape both `onProgress` and
// `onSettled` carry: `std::nullopt` for a null `players` pointer (the C ABI's own
// "not available" contract, per tick for progress and per status for settle), otherwise a
// copy of every element — the C ABI's own array is valid only for the duration of the call
// that hands it here, so this copy is what lets it outlive that call. shared by
// `handleEquityProgress` and `handleEquitySettle` below, rather than each converting inline,
// since the two now do the exact same conversion at two different call sites.
std::optional<std::vector<EspadaEquityPlayerResult>> toOptionalResults(const ::EspadaEquityPlayerResult* players,
                                                                        uint32_t playerCount) {
  if (players == nullptr) {
    return std::nullopt;
  }
  std::vector<EspadaEquityPlayerResult> results;
  results.reserve(playerCount);
  for (uint32_t i = 0; i < playerCount; i++) {
    results.emplace_back(players[i].win, players[i].tie, players[i].equity);
  }
  return results;
}

// clamps a JS `double` (JS numbers are always `double`; see
// `JSIConverter<double>`) meant to carry a non-negative `uint64_t` into that
// range, rather than trusting a value nothing upstream of this call
// validates. NaN — not otherwise caught by either comparison below, both of
// which are false for NaN — is folded into the same "treat as 0" case a
// negative value gets; casting a NaN `double` straight to an unsigned
// integer type is undefined behavior, so it must never reach the final
// `static_cast`.
std::uint64_t toU64(double value) {
  if (std::isnan(value) || value <= 0.0) {
    return 0;
  }
  if (value >= static_cast<double>(UINT64_MAX)) {
    return UINT64_MAX;
  }
  return static_cast<std::uint64_t>(value);
}

// same as `toU64`, clamped to `uint32_t` instead.
std::uint32_t toU32(double value) {
  if (std::isnan(value) || value <= 0.0) {
    return 0;
  }
  if (value >= static_cast<double>(UINT32_MAX)) {
    return UINT32_MAX;
  }
  return static_cast<std::uint32_t>(value);
}

// handed to the C ABI as `progress_cb`. runs on a Rust worker thread and
// touches nothing but the `RunningJob` it was given — the hop onto the JS
// thread is entirely Nitro's doing once `onProgress` (itself already
// dispatcher-wrapped by `JSIConverter<std::function<void(double)>>`) is
// invoked; see this file's header comment.
extern "C" void handleProgress(double progress, void* userData) {
  auto* running = static_cast<RunningJob*>(userData);
  running->onProgress(progress);
}

// handed to the C ABI as `settle_cb`. runs on whichever worker thread
// finishes last, exactly once per job (the C ABI's own contract), and then
// deletes `userData` — mirroring `espada_engine_free`'s "call exactly once"
// contract for the Rust side of a job's lifetime, but for this struct's own
// heap allocation instead.
//
// `status` crosses as the C ABI's own `EspadaStatus` (`espada_engine.h`);
// it is converted here, by numeric value, into the Nitrogen-generated
// `EspadaJobStatus` (`src/specs/espada-engine.nitro.ts`) that `onSettled`
// expects — the two are declared to agree value for value.
extern "C" void handleSettle(EspadaStatus status, double result, const char* message, void* userData) {
  auto* running = static_cast<RunningJob*>(userData);
  std::optional<std::string> messageOpt;
  if (message != nullptr) {
    messageOpt = std::string(message);
  }
  running->onSettled(static_cast<EspadaJobStatus>(static_cast<std::int32_t>(status)), result, messageOpt);
  delete running;
}

// handed to the C ABI as `progress_cb` for an equity job. runs on a Rust worker thread and
// touches nothing but the `RunningEquityJob` it was given, same as `handleProgress` above —
// except `players`/`playerCount` are meaningful only once every player has accumulated
// nonzero weight as of this tick (null/0 otherwise, per `espada_engine.h`'s own
// `EspadaEquityProgressCallback` contract), so `toOptionalResults` above is what turns that
// nullness into the `std::optional` `onProgress` expects, copying every element before this
// call returns since the C ABI's array is valid only for the duration of the call.
extern "C" void handleEquityProgress(double progress, const ::EspadaEquityPlayerResult* players,
                                      uint32_t playerCount, void* userData) {
  auto* running = static_cast<RunningEquityJob*>(userData);
  running->onProgress(progress, toOptionalResults(players, playerCount));
}

// handed to the C ABI as `settle_cb` for an equity job. same contract as
// `handleSettle` above: runs on whichever worker thread finishes last,
// exactly once per job, and then deletes `userData`.
//
// `players`/`playerCount` are meaningful only when `status` is
// `EspadaEquityStatus::Success` (null/0 otherwise, per the C ABI's own
// contract) — `resultsOpt` below is built from that same nullness, exactly
// like `messageOpt` is. each `::EspadaEquityPlayerResult` element is copied,
// field by field, into the Nitrogen-generated `EspadaEquityPlayerResult`
// (this file's enclosing namespace, so it needs no `::` qualifier) before
// this call returns, since the C ABI's array is valid only for the
// duration of this call.
extern "C" void handleEquitySettle(::EspadaEquityStatus status, const ::EspadaEquityPlayerResult* players,
                                    uint32_t playerCount, const char* message, void* userData) {
  auto* running = static_cast<RunningEquityJob*>(userData);

  std::optional<std::vector<EspadaEquityPlayerResult>> resultsOpt = toOptionalResults(players, playerCount);

  std::optional<std::string> messageOpt;
  if (message != nullptr) {
    messageOpt = std::string(message);
  }

  running->onSettled(static_cast<EspadaEquityJobStatus>(static_cast<std::int32_t>(status)), resultsOpt,
                      messageOpt);
  delete running;
}

} // namespace

// `HybridEspadaEngineSpec` (and, through it, `HybridObject`) is a virtual
// base, so the most-derived class — this one — must initialize it directly
// rather than relying on `HybridEspadaEngineSpec`'s own default member
// initializer, per the generated header's own example.
EspadaEngineHybridObject::EspadaEngineHybridObject() : HybridObject(TAG) {}

EspadaEngineHybridObject::~EspadaEngineHybridObject() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();
  releaseEquityLocked();
}

void EspadaEngineHybridObject::start(
    double limit, double threadCount, const std::function<void(double)>& onProgress,
    const std::function<void(EspadaJobStatus, double, const std::optional<std::string>&)>& onSettled) {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();

  auto* running = new RunningJob{onProgress, onSettled};

  EspadaJob* job = espada_engine_start(toU64(limit), toU32(threadCount), &handleProgress, &handleSettle, running);
  if (job == nullptr) {
    delete running;
    int32_t code = 0;
    const char* message = espada_engine_last_error(&code);
    throw std::runtime_error(message != nullptr ? std::string(message) : "espada_engine_start failed");
  }

  _job = job;
}

void EspadaEngineHybridObject::cancel() {
  std::lock_guard<std::mutex> lock(_mutex);
  if (_job != nullptr) {
    espada_engine_cancel(_job);
  }
}

void EspadaEngineHybridObject::release() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();
}

void EspadaEngineHybridObject::releaseLocked() {
  if (_job != nullptr) {
    espada_engine_free(_job);
    _job = nullptr;
  }
}

void EspadaEngineHybridObject::startEquity(
    const std::string& board, const std::vector<std::string>& players, double threadCount,
    const std::function<void(double, const std::optional<std::vector<EspadaEquityPlayerResult>>&)>& onProgress,
    const std::function<void(EspadaEquityJobStatus, const std::optional<std::vector<EspadaEquityPlayerResult>>&,
                              const std::optional<std::string>&)>& onSettled) {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseEquityLocked();

  auto* running = new RunningEquityJob{onProgress, onSettled};

  // `players[i].c_str()` is valid for as long as `players` itself is, which
  // is at least the lifetime of this call (it is a `const&` parameter) —
  // that is all `espada_engine_equity_start` needs, per its own "readable
  // for the duration of this call" safety contract. building this array
  // right before the call, rather than earlier, is what keeps every pointer
  // in it valid across the call.
  std::vector<const char*> playerRanges;
  playerRanges.reserve(players.size());
  for (const auto& range : players) {
    playerRanges.push_back(range.c_str());
  }

  // `player_ranges` must be null only when `player_count` is 0 (see
  // `espada_engine.h`'s own doc comment) — an empty, non-null
  // `playerRanges.data()` would otherwise violate that.
  const char* const* playerRangesPtr = playerRanges.empty() ? nullptr : playerRanges.data();

  EquityJob* job = espada_engine_equity_start(board.c_str(), playerRangesPtr,
                                               static_cast<std::uint32_t>(playerRanges.size()), toU32(threadCount),
                                               &handleEquityProgress, &handleEquitySettle, running);
  if (job == nullptr) {
    delete running;
    int32_t code = 0;
    const char* message = espada_engine_last_error(&code);
    throw std::runtime_error(message != nullptr ? std::string(message) : "espada_engine_equity_start failed");
  }

  _equityJob = job;
}

void EspadaEngineHybridObject::cancelEquity() {
  std::lock_guard<std::mutex> lock(_mutex);
  if (_equityJob != nullptr) {
    espada_engine_equity_cancel(_equityJob);
  }
}

void EspadaEngineHybridObject::releaseEquity() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseEquityLocked();
}

void EspadaEngineHybridObject::releaseEquityLocked() {
  if (_equityJob != nullptr) {
    espada_engine_equity_free(_equityJob);
    _equityJob = nullptr;
  }
}

} // namespace margelo::nitro::espada::engine
