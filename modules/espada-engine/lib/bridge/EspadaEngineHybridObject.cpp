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

} // namespace

// `HybridEspadaEngineSpec` (and, through it, `HybridObject`) is a virtual
// base, so the most-derived class — this one — must initialize it directly
// rather than relying on `HybridEspadaEngineSpec`'s own default member
// initializer, per the generated header's own example.
EspadaEngineHybridObject::EspadaEngineHybridObject() : HybridObject(TAG) {}

EspadaEngineHybridObject::~EspadaEngineHybridObject() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();
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

} // namespace margelo::nitro::espada::engine
