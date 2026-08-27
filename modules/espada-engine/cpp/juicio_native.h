// juicio_native.h — the C ABI contract this module calls into.
//
// This is the ONLY C-side statement of `rust/juicio-native/src/ffi.rs`'s
// exported surface: there is no cbindgen step in this project, so this file
// is hand-maintained and must be kept symbol-for-symbol and type-for-type in
// sync with `ffi.rs` (and, for the two `#[repr(i32)]` enums, with
// `error.rs`). A mismatch here is a link-time or runtime fault nothing else
// catches.
//
// Included only from this module's own `cpp/` sources (and, indirectly, the
// Android- and iOS-specific translation units that include them), so this
// header is free to use C++ where that is the more precise choice — see the
// enum note below.
#pragma once

#include <cstdint>

extern "C" {

// Mirrors `crate::job::JuicioJob` (`rust/juicio-native/src/job.rs`): opaque
// on this side of the boundary. Never dereferenced from C++ — only ever
// passed back to `juicio_native_cancel`/`juicio_native_free` unchanged.
typedef struct JuicioJob JuicioJob;

// Mirrors `crate::ffi::JuicioStatus` (`#[repr(i32)]`) value for value:
// Success = 0, Cancelled = 1, Error = 2.
//
// Declared as a C++ `enum class` with a fixed `int32_t` underlying type,
// rather than a plain C `enum` (whose underlying type C leaves
// implementation-defined), so its size and representation are pinned to
// exactly match Rust's `#[repr(i32)]` rather than merely happening to on
// today's targets. This is safe because this header's only consumers are
// this module's own C++ translation units — nothing here is ever included
// from a plain C file.
enum class JuicioStatus : int32_t {
  Success = 0,
  Cancelled = 1,
  Error = 2,
};

// Mirrors `crate::error::JuicioErrorCode` (`#[repr(i32)]`) value for value:
// None = 0, InvalidArgument = 1, Internal = 2. Same fixed-underlying-type
// rationale as `JuicioStatus` above.
enum class JuicioErrorCode : int32_t {
  None = 0,
  InvalidArgument = 1,
  Internal = 2,
};

// Mirrors `crate::ffi::JuicioProgressCallback`. Called from a job's worker
// thread, at most roughly ten times per second, with the job's completion
// fraction in `[0.0, 1.0]`.
typedef void (*JuicioProgressCallback)(double progress, void* user_data);

// Mirrors `crate::ffi::JuicioSettleCallback`. Called exactly once per job,
// from whichever worker thread finishes last. `result` is meaningful only
// when `status` is `JuicioStatus::Success` (and, informationally,
// `JuicioStatus::Cancelled`). `message` is non-null only when `status` is
// `JuicioStatus::Error`, and is valid only for the duration of the call —
// copy it before returning if it needs to outlive this call.
typedef void (*JuicioSettleCallback)(JuicioStatus status, double result, const char* message, void* user_data);

// Mirrors `crate::ffi::juicio_native_start`. Starts a job counting primes
// below `limit` by trial division, split into a fixed number of shards
// pulled off one atomic cursor by `thread_count` Rust-owned worker threads
// (0 = every available core; a count above the host's core count is
// clamped, not rejected). Spawns its worker threads and returns
// immediately. Returns null only on immediate failure (`progress_cb` or
// `settle_cb` is null) — call `juicio_native_last_error` on this same
// thread for why.
JuicioJob* juicio_native_start(uint64_t limit, uint32_t thread_count, JuicioProgressCallback progress_cb,
                                JuicioSettleCallback settle_cb, void* user_data);

// Mirrors `crate::ffi::juicio_native_cancel`. Requests cancellation of a
// running job; does not block and does not join its worker threads. The job
// still settles exactly once, as `JuicioStatus::Cancelled`, through its own
// settle callback — this call has no separate completion signal.
//
// `job` must be null or a handle returned by `juicio_native_start` that has
// not yet been passed to `juicio_native_free`. Returns 0 on success, or a
// nonzero `JuicioErrorCode` if `job` is null.
int32_t juicio_native_cancel(JuicioJob* job);

// Mirrors `crate::ffi::juicio_native_free`. Releases a job handle. Safe to
// call after the job has settled, and safe to call while it is still
// running — a worker thread that is still going keeps its own reference to
// the job's shared state and winds down on its own. `job` must be null or a
// handle returned by `juicio_native_start`, and must be passed to this
// function exactly once — the same one-shot contract as C's own `free`. A
// null `job` is a no-op.
void juicio_native_free(JuicioJob* job);

// Mirrors `crate::ffi::juicio_native_last_error`. Returns the calling
// thread's last recorded error message, or null if no `juicio_native_*`
// call on this thread has failed since the last one that did. The returned
// pointer is valid only until the next `juicio_native_*` call on the same
// thread. If `out_code` is non-null, writes the error's `JuicioErrorCode`
// through it (`JuicioErrorCode::None` when there is no error).
const char* juicio_native_last_error(int32_t* out_code);

} // extern "C"
