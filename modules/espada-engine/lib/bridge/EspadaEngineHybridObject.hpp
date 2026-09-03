#pragma once

#include "HybridEspadaEngineSpec.hpp"

#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#include "espada_engine.h"

namespace margelo::nitro::espada::engine {

using namespace margelo::nitro;

// the single Nitro `HybridObject` shared by both platforms (Android's
// CMake target and iOS's podspec both compile this same `lib/bridge/`
// directory unchanged). it subclasses the Nitrogen-generated
// `HybridEspadaEngineSpec`
// (`nitrogen/generated/shared/c++/HybridEspadaEngineSpec.hpp`, generated from
// `src/specs/espada-engine.nitro.ts`) rather than declaring the JS-facing
// methods itself, and calls the crate's C ABI (`espada_engine.h`) directly —
// no JNI, no second ABI.
//
// progress and completion reach JS through `std::function`s captured via
// Nitro's own `JSIConverter<std::function<R(Args...)>>`
// (`JSIConverter+Function.hpp`): both callback parameters below are
// `void`-returning, which that converter treats as *async* — it wraps them
// through `AsyncJSCallback`, dispatched via
// `Dispatcher::getRuntimeGlobalDispatcher(runtime)`. that dispatcher (which
// Nitro installs over React Native's own `CallInvoker` identically on both
// platforms) is what performs the hop off the Rust worker thread and onto
// the JS thread — this class hands it plain `std::function`s and never
// touches a `jsi::Runtime` itself, on any thread.
class EspadaEngineHybridObject : public HybridEspadaEngineSpec {
public:
  EspadaEngineHybridObject();
  ~EspadaEngineHybridObject() override;

  EspadaEngineHybridObject(const EspadaEngineHybridObject&) = delete;
  EspadaEngineHybridObject(EspadaEngineHybridObject&&) = delete;

public:
  // starts a job counting primes below `limit` (clamped to
  // `[0, UINT64_MAX]`), sharded across `threadCount` Rust-owned worker
  // threads (`0` = every available core; clamped rather than rejected —
  // see `espada_engine.h`). both numbers cross from JS as `double`, per
  // this project's own "numbers cross as f64" rule (a `u64`/`u32` is not
  // otherwise representable in JS): they are converted to the C ABI's
  // unsigned integer types here, at the boundary, rather than upstream.
  //
  // `onProgress` fires at a bounded rate with a `[0, 1]` completion
  // fraction. `onSettled` fires exactly once with the job's outcome, as the
  // Nitrogen-generated `EspadaJobStatus` (`src/specs/espada-engine.nitro.ts`)
  // rather than a bare number — the spec is what declares that numeric
  // contract now, not this class. `result` is meaningful only when `status`
  // is `EspadaJobStatus::SUCCESS`; `message` is present only when `status`
  // is `EspadaJobStatus::ERROR`.
  //
  // starting a second job while one is already running releases the
  // previous handle first (see `release()`) rather than rejecting — the
  // previous job's worker threads keep running to their own completion
  // regardless, per the C ABI's own free-while-running contract.
  void start(double limit, double threadCount, const std::function<void(double)>& onProgress,
             const std::function<void(EspadaJobStatus, double, const std::optional<std::string>&)>& onSettled)
      override;

  // requests cancellation of the running job, if any. a no-op if no job is
  // running. does not block; the job still settles through `onSettled`.
  void cancel() override;

  // releases the current job handle, if any. safe to call more than once,
  // safe to call whether or not the job has settled, and called from the
  // destructor so a Fast Refresh (which destroys and recreates this
  // HybridObject) never leaks the handle.
  void release() override;

  // starts a job computing real equity for a table of players, sharded
  // across `threadCount` (clamped exactly like `start()`'s `threadCount`
  // above) Rust-owned worker threads. `board` and `players` cross from JS as
  // `std::string`/`std::vector<std::string>` and are converted to C strings
  // here, at the boundary — see the `.cpp` for how their pointers are kept
  // valid across the call.
  //
  // a distinct job from the one `start`/`cancel`/`release` above manage
  // (`_equityJob`, not `_job`) — per this method's own doc comment in
  // `src/specs/espada-engine.nitro.ts`, starting an equity job never affects
  // a running demo job, and vice versa.
  //
  // `onProgress` fires at a bounded rate with a `[0, 1]` completion
  // fraction, alongside each player's own currently-accumulated result:
  // its `std::optional<std::vector<EspadaEquityPlayerResult>>` is set only
  // once the native layer has accumulated at least some data for every
  // player as of that tick (unset otherwise — see
  // `handleEquityProgress`'s own comment in the `.cpp`), the same
  // "unset means not available yet" shape `onSettled`'s own `results`
  // already carries. `onSettled` fires exactly once with the job's
  // outcome, as the Nitrogen-generated `EspadaEquityJobStatus`; `results`
  // is present only when `status` is `EspadaEquityJobStatus::SUCCESS`,
  // `message` only when `status` is `EspadaEquityJobStatus::ERROR`.
  //
  // a malformed `board` or `players` entry is a *synchronous* parse failure
  // — this throws `std::runtime_error` instead of ever reaching `onSettled`,
  // exactly like `start()` does for a null `progress_cb`/`settle_cb`; every
  // other rejection (an unsupported player count, or no valid runout) still
  // starts a job and is reported through `onSettled` instead.
  //
  // starting a second equity job while one is already running releases the
  // previous handle first (see `releaseEquity()`) rather than rejecting,
  // same as `start()` above.
  void startEquity(
      const std::string& board, const std::vector<std::string>& players, double threadCount,
      const std::function<void(double, const std::optional<std::vector<EspadaEquityPlayerResult>>&)>& onProgress,
      const std::function<void(EspadaEquityJobStatus, const std::optional<std::vector<EspadaEquityPlayerResult>>&,
                                const std::optional<std::string>&)>& onSettled) override;

  // requests cancellation of the running equity job, if any. a no-op if no
  // equity job is running. does not block; the job still settles through
  // `startEquity`'s own `onSettled`.
  void cancelEquity() override;

  // releases the current equity job handle, if any. safe to call more than
  // once, safe to call whether or not the job has settled, and called from
  // the destructor for the same Fast-Refresh-safety reason `release()` is.
  void releaseEquity() override;

private:
  std::mutex _mutex;
  EspadaJob* _job = nullptr; // guarded by _mutex
  EquityJob* _equityJob = nullptr; // guarded by _mutex; independent of _job

  // releases `_job` without taking `_mutex` — for callers (the destructor,
  // `start()`) that already hold it.
  void releaseLocked();

  // same as `releaseLocked()`, for `_equityJob` instead.
  void releaseEquityLocked();
};

} // namespace margelo::nitro::espada::engine
