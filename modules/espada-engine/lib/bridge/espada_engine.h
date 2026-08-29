// espada_engine.h — the C ABI contract this module calls into.
//
// this is the only C-side statement of `lib/espada-engine/src/ffi.rs`'s
// exported surface: there is no cbindgen step in this project, so this file
// is hand-maintained and must be kept symbol-for-symbol and type-for-type in
// sync with `ffi.rs` (and, for the two `#[repr(i32)]` enums, with
// `error.rs`). a mismatch here is a link-time or runtime fault nothing else
// catches.
//
// included only from this module's own `lib/bridge/` sources (and,
// indirectly, the Android- and iOS-specific translation units that include
// them), so this header is free to use C++ where that is the more precise
// choice — see the enum note below.
#pragma once

#include <cstdint>

extern "C" {

// mirrors `crate::job::EspadaJob` (`lib/espada-engine/src/job.rs`): opaque
// on this side of the boundary. never dereferenced from C++ — only ever
// passed back to `espada_engine_cancel`/`espada_engine_free` unchanged.
typedef struct EspadaJob EspadaJob;

// mirrors `crate::ffi::EspadaStatus` (`#[repr(i32)]`) value for value:
// Success = 0, Cancelled = 1, Error = 2.
//
// declared as a C++ `enum class` with a fixed `int32_t` underlying type,
// rather than a plain C `enum` (whose underlying type C leaves
// implementation-defined), so its size and representation are pinned to
// exactly match Rust's `#[repr(i32)]` rather than merely happening to on
// today's targets. this is safe because this header's only consumers are
// this module's own C++ translation units — nothing here is ever included
// from a plain C file.
//
// distinct from the Nitrogen-generated `EspadaJobStatus`
// (`nitrogen/generated/shared/c++/EspadaJobStatus.hpp`), which is the
// JS-facing enum the spec (`src/specs/espada-engine.nitro.ts`) declares —
// `EspadaEngineHybridObject.cpp` converts one to the other at the boundary,
// by numeric value, since the two are kept in agreement deliberately.
enum class EspadaStatus : int32_t {
  Success = 0,
  Cancelled = 1,
  Error = 2,
};

// mirrors `crate::error::EspadaErrorCode` (`#[repr(i32)]`) value for value:
// None = 0, InvalidArgument = 1, Internal = 2. same fixed-underlying-type
// rationale as `EspadaStatus` above.
enum class EspadaErrorCode : int32_t {
  None = 0,
  InvalidArgument = 1,
  Internal = 2,
};

// mirrors `crate::ffi::EspadaProgressCallback`. called from a job's worker
// thread, at most roughly ten times per second, with the job's completion
// fraction in `[0.0, 1.0]`.
typedef void (*EspadaProgressCallback)(double progress, void* user_data);

// mirrors `crate::ffi::EspadaSettleCallback`. called exactly once per job,
// from whichever worker thread finishes last. `result` is meaningful only
// when `status` is `EspadaStatus::Success` (and, informationally,
// `EspadaStatus::Cancelled`). `message` is non-null only when `status` is
// `EspadaStatus::Error`, and is valid only for the duration of the call —
// copy it before returning if it needs to outlive this call.
typedef void (*EspadaSettleCallback)(EspadaStatus status, double result, const char* message, void* user_data);

// mirrors `crate::ffi::espada_engine_start`. starts a job counting primes
// below `limit` by trial division, split into a fixed number of shards
// pulled off one atomic cursor by `thread_count` Rust-owned worker threads
// (0 = every available core; a count above the host's core count is
// clamped, not rejected). spawns its worker threads and returns
// immediately. returns null only on immediate failure (`progress_cb` or
// `settle_cb` is null) — call `espada_engine_last_error` on this same
// thread for why.
EspadaJob* espada_engine_start(uint64_t limit, uint32_t thread_count, EspadaProgressCallback progress_cb,
                                EspadaSettleCallback settle_cb, void* user_data);

// mirrors `crate::ffi::espada_engine_cancel`. requests cancellation of a
// running job; does not block and does not join its worker threads. the job
// still settles exactly once, as `EspadaStatus::Cancelled`, through its own
// settle callback — this call has no separate completion signal.
//
// `job` must be null or a handle returned by `espada_engine_start` that has
// not yet been passed to `espada_engine_free`. returns 0 on success, or a
// nonzero `EspadaErrorCode` if `job` is null.
int32_t espada_engine_cancel(EspadaJob* job);

// mirrors `crate::ffi::espada_engine_free`. releases a job handle. safe to
// call after the job has settled, and safe to call while it is still
// running — a worker thread that is still going keeps its own reference to
// the job's shared state and winds down on its own. `job` must be null or a
// handle returned by `espada_engine_start`, and must be passed to this
// function exactly once — the same one-shot contract as C's own `free`. a
// null `job` is a no-op.
void espada_engine_free(EspadaJob* job);

// mirrors `crate::ffi::espada_engine_last_error`. returns the calling
// thread's last recorded error message, or null if no `espada_engine_*`
// call on this thread has failed since the last one that did. the returned
// pointer is valid only until the next `espada_engine_*` call on the same
// thread. if `out_code` is non-null, writes the error's `EspadaErrorCode`
// through it (`EspadaErrorCode::None` when there is no error).
const char* espada_engine_last_error(int32_t* out_code);

} // extern "C"
