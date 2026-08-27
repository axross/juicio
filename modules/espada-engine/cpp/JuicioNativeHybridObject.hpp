#pragma once

#include <NitroModules/HybridObject.hpp>

#include <functional>
#include <mutex>
#include <optional>
#include <string>

#include "juicio_native.h"

namespace juicio {

using namespace margelo::nitro;

// The name this HybridObject is registered under in
// `HybridObjectRegistry::registerHybridObjectConstructor` (see
// `JuicioNativeRegistration.cpp`), and the name JS passes to
// `NitroModules.createHybridObject<JuicioNative>(...)`. Also the string
// handed to the `HybridObject` base constructor: the two must match
// exactly, or `HybridObjectRegistry::createHybridObject` rejects the
// instance in debug builds (see `HybridObjectRegistry.cpp`'s own check).
inline constexpr const char* kJuicioNativeHybridObjectName = "JuicioNative";

// The single Nitro `HybridObject` shared by both platforms (Android's
// CMake target and iOS's podspec both compile this same `cpp/` directory
// unchanged). It calls the crate's C ABI (`juicio_native.h`) directly — no
// JNI, no second ABI.
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
class JuicioNativeHybridObject : public HybridObject {
public:
  JuicioNativeHybridObject();
  ~JuicioNativeHybridObject() override;

  JuicioNativeHybridObject(const JuicioNativeHybridObject&) = delete;
  JuicioNativeHybridObject(JuicioNativeHybridObject&&) = delete;

public:
  // Starts a job counting primes below `limit` (clamped to
  // `[0, UINT64_MAX]`), sharded across `threadCount` Rust-owned worker
  // threads (`0` = every available core; clamped rather than rejected —
  // see `juicio_native.h`). Both numbers cross from JS as `double`, per
  // this project's own "numbers cross as f64" rule (a `u64`/`u32` is not
  // otherwise representable in JS): they are converted to the C ABI's
  // unsigned integer types here, at the boundary, rather than upstream.
  //
  // `onProgress` fires at a bounded rate with a `[0, 1]` completion
  // fraction. `onSettled` fires exactly once with the job's outcome:
  // `status` carries `JuicioStatus`'s own numeric value (0 = success,
  // 1 = cancelled, 2 = error) rather than a JS-side enum of its own, since
  // no JS-side representation exists yet at this layer — the TypeScript
  // wrapper that consumes this HybridObject owns translating it into
  // whatever shape it presents to its own callers. `result` is meaningful
  // only when `status` is 0; `message` is present only when `status` is 2.
  //
  // Starting a second job while one is already running releases the
  // previous handle first (see `release()`) rather than rejecting — the
  // previous job's worker threads keep running to their own completion
  // regardless, per the C ABI's own free-while-running contract.
  void start(double limit, double threadCount, const std::function<void(double)>& onProgress,
             const std::function<void(double, double, std::optional<std::string>)>& onSettled);

  // Requests cancellation of the running job, if any. A no-op if no job is
  // running. Does not block; the job still settles through `onSettled`.
  void cancel();

  // Releases the current job handle, if any. Safe to call more than once,
  // safe to call whether or not the job has settled, and called from the
  // destructor so a Fast Refresh (which destroys and recreates this
  // HybridObject) never leaks the handle.
  void release();

protected:
  void loadHybridMethods() override;

private:
  std::mutex _mutex;
  JuicioJob* _job = nullptr; // guarded by _mutex

  // Releases `_job` without taking `_mutex` — for callers (the destructor,
  // `start()`) that already hold it.
  void releaseLocked();
};

} // namespace juicio
