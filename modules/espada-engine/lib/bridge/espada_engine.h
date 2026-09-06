// espada_engine.h — the C ABI contract this module calls into.
//
// this is the only C-side statement of `lib/espada-engine/src/ffi.rs`'s and
// `lib/espada-engine/src/equity_ffi.rs`'s exported surfaces: there is no
// cbindgen step in this project, so this file is hand-maintained and must be
// kept symbol-for-symbol and type-for-type in sync with both (and, for the
// `#[repr(i32)]` enums, with `error.rs`). a mismatch here is a link-time or
// runtime fault nothing else catches.
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

// mirrors `crate::equity_job::EquityJob` (`lib/espada-engine/src/equity_job.rs`,
// re-exported from `equity_ffi.rs`): opaque on this side of the boundary,
// same as `EspadaJob` above. a distinct C type on purpose — the two job
// kinds have entirely separate handles, and nothing here lets one be passed
// to the other kind's `cancel`/`free`.
typedef struct EquityJob EquityJob;

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

// mirrors `crate::equity_ffi::EspadaEquityStatus` (`#[repr(i32)]`) value for
// value: Success = 0, Cancelled = 1, Error = 2, NoValidRunout = 3,
// UnsupportedPlayerCount = 4. same fixed-underlying-type rationale as
// `EspadaStatus` above; a distinct C++ type from `EspadaStatus` so the demo
// job's three-way status can never be mistaken for this job's five-way one.
//
// distinct from the Nitrogen-generated `EspadaEquityJobStatus`
// (`nitrogen/generated/shared/c++/EspadaEquityJobStatus.hpp`), the JS-facing
// enum the spec (`src/specs/espada-engine.nitro.ts`) declares —
// `EspadaEngineHybridObject.cpp` converts one to the other at the boundary,
// by numeric value, exactly like `EspadaStatus`/`EspadaJobStatus` above.
enum class EspadaEquityStatus : int32_t {
  Success = 0,
  Cancelled = 1,
  Error = 2,
  NoValidRunout = 3,
  UnsupportedPlayerCount = 4,
};

// mirrors `crate::equity_ffi::EQUITY_DISTRIBUTION_BIN_COUNT`. the number of
// equal-width slices `EspadaEquityPlayerResult::distribution` below bins a
// player's own card pairs into, spanning the same `0..=100` equity axis the
// app's own Equity Breakdown histogram already draws.
static const uint32_t kEspadaEquityDistributionBinCount = 20;

// mirrors `crate::equity_ffi::EQUITY_CARD_PAIR_COUNT`: the number of distinct
// two-card combinations out of a 52-card deck (`52 choose 2`) — the fixed
// slot count of `EspadaEquityPlayerResult::equities` and `::strengths` below,
// one slot per **card pair number** as `docs/specs/equity-breakdown.md`'s
// Blocker Score section defines it.
static const uint32_t kEspadaEquityCardPairCount = 1326;

// mirrors `crate::equity_ffi::EspadaEquityCardPairResult` (`#[repr(C)]`)
// field for field: one of a hand-range player's own live card pairs — a card
// pair overlapping the board, or with no live opponent combo ever consistent
// with it, carries no entry at all (see `EspadaEquityPlayerResult::pairs`
// below) — with that pair's own equity accumulated so far and its current
// strength (the product of every opponent's own pairwise lead, computed
// lazily, on first read, by whichever worker thread reaches it first — never
// before at least one shard has completed, not eagerly at job start — and
// held constant across every tick).
//
// `card_a`/`card_b` are each a card index in `0..52`: `rank * 4 + suit`,
// `Rank` ordered `Ace..Deuce` and `Suit` ordered `Spade, Heart, Diamond,
// Club` — the same encoding `lib/espada-internal/src/evaluator/equity.rs`'s
// own (private) `card_index` uses. `card_a <= card_b`, matching `CardPair`'s
// own construction invariant.
//
// `equity_q16` and `strength_q16` each quantize a `[0.0, 1.0]` fraction into
// a 16-bit fixed-point count out of `UINT16_MAX` (`round(value * 65535.0)`)
// rather than crossing at full precision — see the Rust type's own doc
// comment for the ≤12KB-per-progress-tick budget this keeps within. preflop,
// `strength_q16` is `0` for every pair, a sentinel rather than a
// measurement — see the Rust type's own doc comment.
struct EspadaEquityCardPairResult {
  uint8_t card_a;
  uint8_t card_b;
  uint16_t equity_q16;
  uint16_t strength_q16;
};

// mirrors `crate::equity_ffi::EspadaEquityPlayerResult` (`#[repr(C)]`) field
// for field: `win`, `tie`, and `equity` are each a fraction in `[0.0, 1.0]`;
// `distribution` is a count of this player's own card pairs per equal-width
// slice of that same equity axis (see `kEspadaEquityDistributionBinCount`
// above). settlement only: a progress tick carries this array zeroed, since
// `equities` below already crosses the same per-pair equity on every tick at
// constant cost; once settled, it sums to this player's own total live
// card-pair count — see the Rust type's own doc comment for the full
// derivation. `pairs`/`pair_count` carry this same player's own live card
// pairs individually rather than folded into either accounting above —
// settlement only, like `distribution`: a progress tick carries a null
// `pairs` and a `pair_count` of `0`, with every settled element's own
// `strength_q16` fixed for the life of one calculation while `equity_q16`
// moves as the walk accumulates — see the Rust type's own doc comment. valid
// only for the duration of a settle or progress callback that names it (see
// `EspadaEquitySettleCallback`/`EspadaEquityProgressCallback` below); copy
// the fields out (dereferencing `pairs` up to `pair_count` elements) if they
// need to outlive that call.
//
// `equities` and `strengths` carry this same per-pair accounting a third
// way, fixed-slot: two arrays of `kEspadaEquityCardPairCount` 32-bit floats,
// one slot per **card pair number**, present and filled on *every* progress
// tick as well as at settlement — unlike `distribution` and `pairs` above. a
// card pair not currently live holds `NaN` in both slots; a live pair holds
// its equity so far in `equities` and its current strength in `strengths`,
// except preflop, where every slot of `strengths` is `NaN` regardless of
// liveness, while `equities` is still filled normally — see the Rust type's
// own doc comment for the full derivation. crossing these two buffers costs
// one constant-time copy each, independent of how many card pairs are
// actually live — this is what let `distribution`/`pairs` move to
// settlement-only above, replacing the per-element conversion they used to
// need on every tick.
//
// `blocker_scores`/`blocker_score_count` carry this player's own **blocker
// score** against every opponent (`docs/specs/equity-breakdown.md`'s Blocker
// Score section) — settlement only, like `pairs` above: a progress tick
// carries a null `blocker_scores` and a `blocker_score_count` of `0`. unlike
// every other field, this one's length depends on the table's own player
// count rather than being fixed at `kEspadaEquityCardPairCount`, so it
// crosses as a pointer and a count rather than a fixed-size array, the same
// shape `pairs`/`pair_count` use. sized `kEspadaEquityCardPairCount *
// (player_count - 1)`, indexed by **card pair number** major and a
// skip-self opponent ordinal minor — the opponent's own seat index, minus
// one once the opponent sits past this player's own seat, so a three-seat
// table's seat 1 reads seats 0 and 2 as ordinals 0 and 1. a card pair that
// is not live carries `NaN` in every one of its score slots; a live pair
// carries a finite value in all of them. valid only for the duration of a
// settle or progress callback that names it — copy the elements out
// (dereferencing `blocker_scores` up to `blocker_score_count` elements) if
// they need to outlive that call.
//
// this name collides, deliberately, with the Nitrogen-generated
// `EspadaEquityPlayerResult` (`nitrogen/generated/shared/c++/
// EspadaEquityPlayerResult.hpp`) — the JS-facing struct the spec declares,
// with the same fields — since both mirror the same Rust type one layer
// apart. they are still two distinct C++ types in two different
// namespaces (this one at global scope, the generated one in
// `margelo::nitro::espada::engine`); `EspadaEngineHybridObject.cpp` is
// written inside that namespace, so it must write `::EspadaEquityPlayerResult`
// whenever it means this one rather than the generated one.
struct EspadaEquityPlayerResult {
  double win;
  double tie;
  double equity;
  uint32_t distribution[kEspadaEquityDistributionBinCount];
  const EspadaEquityCardPairResult* pairs;
  uint32_t pair_count;
  float equities[kEspadaEquityCardPairCount];
  float strengths[kEspadaEquityCardPairCount];
  const double* blocker_scores;
  uint32_t blocker_score_count;
};

// mirrors `crate::ffi::EspadaProgressCallback`. called from a job's worker
// thread, at most roughly ten times per second, with the job's completion
// fraction in `[0.0, 1.0]`.
typedef void (*EspadaProgressCallback)(double progress, void* user_data);

// mirrors `crate::equity_ffi::EspadaEquityProgressCallback`. called from a
// job's worker thread, at most roughly ten times per second, with the job's
// completion fraction in `[0.0, 1.0]` and each player's own
// currently-accumulated result: `players`/`player_count` are meaningful
// only once every player has accumulated nonzero weight as of this tick
// (null/0 otherwise — the same "not available yet" contract
// `EspadaEquitySettleCallback`'s own `players` uses for a non-`Success`
// status, applied here per tick rather than only at settlement); `players`
// is valid only for the duration of the call — copy the fields out of each
// element before returning if they need to outlive this call.
typedef void (*EspadaEquityProgressCallback)(double progress, const EspadaEquityPlayerResult* players,
                                              uint32_t player_count, void* user_data);

// mirrors `crate::ffi::EspadaSettleCallback`. called exactly once per job,
// from whichever worker thread finishes last. `result` is meaningful only
// when `status` is `EspadaStatus::Success` (and, informationally,
// `EspadaStatus::Cancelled`). `message` is non-null only when `status` is
// `EspadaStatus::Error`, and is valid only for the duration of the call —
// copy it before returning if it needs to outlive this call.
typedef void (*EspadaSettleCallback)(EspadaStatus status, double result, const char* message, void* user_data);

// mirrors `crate::equity_ffi::EspadaEquitySettleCallback`. called exactly
// once per job, from whichever worker thread finishes last. `players` and
// `player_count` are meaningful only when `status` is
// `EspadaEquityStatus::Success` (null/0 for every other status); `players`
// is valid only for the duration of the call — copy the fields out of each
// element before returning if they need to outlive this call. `message` is
// non-null only when `status` is `EspadaEquityStatus::Error`, and is
// likewise valid only for the duration of the call.
typedef void (*EspadaEquitySettleCallback)(EspadaEquityStatus status, const EspadaEquityPlayerResult* players,
                                            uint32_t player_count, const char* message, void* user_data);

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

// mirrors `crate::equity_ffi::espada_engine_equity_start`. starts a job
// computing real equity for a table of players, sharded across
// `thread_count` Rust-owned worker threads (0 = every available core;
// clamped, not rejected — same convention as `espada_engine_start` above).
//
// `board` is a space-separated list of card codes (e.g. `"Ah Kd 2c"`) naming
// 0 (preflop), or 3, 4, or 5 (postflop) known board cards; an empty string
// means preflop — this must never be a null pointer, empty or not.
//
// `player_ranges` points to `player_count` hand-range C strings (e.g.
// `"AA"`, `"22+,A2s+,AJo+"`); must be null only when `player_count` is 0,
// and otherwise must point to at least `player_count` valid, non-null,
// null-terminated C strings, all readable for the duration of this call —
// nothing here retains any of those pointers past the call returning.
//
// spawns its worker threads and returns immediately. returns null only on a
// *synchronous* parse failure of `board` or one of `player_ranges` (or on
// the same `progress_cb`/`settle_cb`-is-null failure `espada_engine_start`
// reports) — call `espada_engine_last_error` on this same thread for why.
// every other rejection (an unsupported player count, or a board/range
// combination with no valid runout) still returns a valid job handle,
// reported instead through the settle callback as
// `EspadaEquityStatus::UnsupportedPlayerCount` or
// `EspadaEquityStatus::NoValidRunout` — see `equity_ffi.rs`'s own doc
// comment for why that split matters.
EquityJob* espada_engine_equity_start(const char* board, const char* const* player_ranges, uint32_t player_count,
                                       uint32_t thread_count, EspadaEquityProgressCallback progress_cb,
                                       EspadaEquitySettleCallback settle_cb, void* user_data);

// mirrors `crate::equity_ffi::espada_engine_equity_cancel`. same contract as
// `espada_engine_cancel` above, for an equity job instead: requests
// cancellation without blocking or joining worker threads; the job still
// settles exactly once, as `EspadaEquityStatus::Cancelled`, through its own
// settle callback.
//
// `job` must be null or a handle returned by `espada_engine_equity_start`
// that has not yet been passed to `espada_engine_equity_free`. returns 0 on
// success, or a nonzero `EspadaErrorCode` if `job` is null.
int32_t espada_engine_equity_cancel(EquityJob* job);

// mirrors `crate::equity_ffi::espada_engine_equity_free`. same contract as
// `espada_engine_free` above, for an equity job instead: safe to call after
// the job has settled, safe to call while it is still running, must be
// passed to this function exactly once, and a null `job` is a no-op.
void espada_engine_equity_free(EquityJob* job);

// mirrors `crate::ffi::espada_engine_last_error`. returns the calling
// thread's last recorded error message, or null if no `espada_engine_*`
// call on this thread has failed since the last one that did. the returned
// pointer is valid only until the next `espada_engine_*` call on the same
// thread. if `out_code` is non-null, writes the error's `EspadaErrorCode`
// through it (`EspadaErrorCode::None` when there is no error).
//
// shared by both job kinds — `equity_ffi.rs` records its own synchronous
// failures through this same per-thread last-error state (`crate::error`)
// rather than a separate `espada_engine_equity_last_error` function, so
// `startEquity`'s failure path in `EspadaEngineHybridObject.cpp` calls this
// function exactly like `start()`'s does.
const char* espada_engine_last_error(int32_t* out_code);

} // extern "C"
