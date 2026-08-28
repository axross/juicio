#pragma once

#include "HybridEspadaEngineSpec.hpp"

#include <functional>
#include <mutex>
#include <optional>
#include <string>

#include "espada_engine.h"

namespace margelo::nitro::espada::engine {

using namespace margelo::nitro;

// The single Nitro `HybridObject` shared by both platforms (Android's
// CMake target and iOS's podspec both compile this same `cpp/` directory
// unchanged). It subclasses the Nitrogen-generated `HybridEspadaEngineSpec`
// (`nitrogen/generated/shared/c++/HybridEspadaEngineSpec.hpp`, generated from
// `src/specs/espada-engine.nitro.ts`) rather than declaring the JS-facing
// methods itself, and calls the crate's C ABI (`espada_engine.h`) directly —
// no JNI, no second ABI.
//
// Progress and completion reach JS through `std::function`s captured via
// Nitro's own `JSIConverter<std::function<R(Args...)>>`
// (`JSIConverter+Function.hpp`): both callback parameters below are
// `void`-returning, which that converter treats as *async* — it wraps them
// through `AsyncJSCallback`, dispatched via
// `Dispatcher::getRuntimeGlobalDispatcher(runtime)`. That dispatcher (which
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
  // Starts a job counting primes below `limit` (clamped to
  // `[0, UINT64_MAX]`), sharded across `threadCount` Rust-owned worker
  // threads (`0` = every available core; clamped rather than rejected —
  // see `espada_engine.h`). Both numbers cross from JS as `double`, per
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
  // Starting a second job while one is already running releases the
  // previous handle first (see `release()`) rather than rejecting — the
  // previous job's worker threads keep running to their own completion
  // regardless, per the C ABI's own free-while-running contract.
  void start(double limit, double threadCount, const std::function<void(double)>& onProgress,
             const std::function<void(EspadaJobStatus, double, const std::optional<std::string>&)>& onSettled)
      override;

  // Requests cancellation of the running job, if any. A no-op if no job is
  // running. Does not block; the job still settles through `onSettled`.
  void cancel() override;

  // Releases the current job handle, if any. Safe to call more than once,
  // safe to call whether or not the job has settled, and called from the
  // destructor so a Fast Refresh (which destroys and recreates this
  // HybridObject) never leaks the handle.
  void release() override;

private:
  std::mutex _mutex;
  EspadaJob* _job = nullptr; // guarded by _mutex

  // Releases `_job` without taking `_mutex` — for callers (the destructor,
  // `start()`) that already hold it.
  void releaseLocked();
};

} // namespace margelo::nitro::espada::engine
