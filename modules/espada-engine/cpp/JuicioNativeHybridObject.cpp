#include "JuicioNativeHybridObject.hpp"

#include <cmath>
#include <cstdint>
#include <stdexcept>

namespace juicio {

namespace {

// Both C ABI callbacks (`handleProgress`/`handleSettle` below) receive this
// as `user_data`. It is heap-allocated in `start()` and owned entirely by
// that raw pointer from then on — nothing here reaches back into `this`
// (the `JuicioNativeHybridObject`), which is what lets `release()` and the
// destructor free `_job` (and, with it, this HybridObject) while a worker
// thread is still mid-run: the callbacks it eventually fires only touch
// this struct, not the HybridObject that started them.
//
// `handleSettle` deletes it, exactly once, matching the C ABI's own
// "settles exactly once" contract for `settle_cb`.
struct RunningJob {
  std::function<void(double)> onProgress;
  std::function<void(double, double, std::optional<std::string>)> onSettled;
};

// Clamps a JS `double` (JS numbers are always `double`; see
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

// Same as `toU64`, clamped to `uint32_t` instead.
std::uint32_t toU32(double value) {
  if (std::isnan(value) || value <= 0.0) {
    return 0;
  }
  if (value >= static_cast<double>(UINT32_MAX)) {
    return UINT32_MAX;
  }
  return static_cast<std::uint32_t>(value);
}

// Handed to the C ABI as `progress_cb`. Runs on a Rust worker thread and
// touches nothing but the `RunningJob` it was given — the hop onto the JS
// thread is entirely Nitro's doing once `onProgress` (itself already
// dispatcher-wrapped by `JSIConverter<std::function<void(double)>>`) is
// invoked; see this file's header comment.
extern "C" void handleProgress(double progress, void* userData) {
  auto* running = static_cast<RunningJob*>(userData);
  running->onProgress(progress);
}

// Handed to the C ABI as `settle_cb`. Runs on whichever worker thread
// finishes last, exactly once per job (the C ABI's own contract), and then
// deletes `userData` — mirroring `juicio_native_free`'s "call exactly once"
// contract for the Rust side of a job's lifetime, but for this struct's own
// heap allocation instead.
extern "C" void handleSettle(JuicioStatus status, double result, const char* message, void* userData) {
  auto* running = static_cast<RunningJob*>(userData);
  std::optional<std::string> messageOpt;
  if (message != nullptr) {
    messageOpt = std::string(message);
  }
  running->onSettled(static_cast<double>(static_cast<std::int32_t>(status)), result, messageOpt);
  delete running;
}

} // namespace

JuicioNativeHybridObject::JuicioNativeHybridObject() : HybridObject(kJuicioNativeHybridObjectName) {}

JuicioNativeHybridObject::~JuicioNativeHybridObject() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();
}

void JuicioNativeHybridObject::loadHybridMethods() {
  HybridObject::loadHybridMethods();
  registerHybrids(this, [](Prototype& prototype) {
    prototype.registerHybridMethod("start", &JuicioNativeHybridObject::start);
    prototype.registerHybridMethod("cancel", &JuicioNativeHybridObject::cancel);
    prototype.registerHybridMethod("release", &JuicioNativeHybridObject::release);
  });
}

void JuicioNativeHybridObject::start(double limit, double threadCount, const std::function<void(double)>& onProgress,
                                      const std::function<void(double, double, std::optional<std::string>)>& onSettled) {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();

  auto* running = new RunningJob{onProgress, onSettled};

  JuicioJob* job = juicio_native_start(toU64(limit), toU32(threadCount), &handleProgress, &handleSettle, running);
  if (job == nullptr) {
    delete running;
    int32_t code = 0;
    const char* message = juicio_native_last_error(&code);
    throw std::runtime_error(message != nullptr ? std::string(message) : "juicio_native_start failed");
  }

  _job = job;
}

void JuicioNativeHybridObject::cancel() {
  std::lock_guard<std::mutex> lock(_mutex);
  if (_job != nullptr) {
    juicio_native_cancel(_job);
  }
}

void JuicioNativeHybridObject::release() {
  std::lock_guard<std::mutex> lock(_mutex);
  releaseLocked();
}

void JuicioNativeHybridObject::releaseLocked() {
  if (_job != nullptr) {
    juicio_native_free(_job);
    _job = nullptr;
  }
}

} // namespace juicio
