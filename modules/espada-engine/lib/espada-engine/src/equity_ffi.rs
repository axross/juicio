//! the equity job's own C ABI surface: a distinct opaque handle, status enum, and callback
//! shape from [`crate::ffi`]'s prime-count job, so a caller can never pass an equity job
//! handle to the demo job's `cancel`/`free` (or vice versa) and have it silently do the
//! wrong thing.
//!
//! every exported function funnels through [`crate::error::ffi_guard`], for the same reason
//! [`crate::ffi`] does: a panic raised synchronously inside the call becomes an error return
//! rather than unwinding across the `extern "C"` frame. a panic raised on a job's *worker*
//! thread is a separate path, caught in [`crate::equity_job`] and reported through the
//! settle callback as [`EspadaEquityStatus::Error`].

use std::ffi::{c_char, c_void, CStr};
use std::str::FromStr;

use espada::card::Card;
use espada::hand_range::HandRange;

use crate::equity_job;
pub use crate::equity_job::EquityJob;

use crate::error::{clear_last_error, ffi_guard, set_last_error, EspadaErrorCode};

/// the number of equal-width slices [`EspadaEquityPlayerResult::distribution`] bins a
/// player's own card pairs into, spanning the same `0..=100` equity axis the app's own
/// Equity Breakdown histogram already draws — matching that histogram's own 20-bin
/// placeholder shape, so the app-side folding logic that already reduces 20 bins down to
/// however many bars fit the sheet's measured width needs no change to accept a real
/// distribution in place of one.
pub const EQUITY_DISTRIBUTION_BIN_COUNT: usize = 20;

/// the number of distinct two-card combinations out of a 52-card deck (`52 choose 2`) —
/// the fixed slot count of [`EspadaEquityPlayerResult::equities`] and
/// [`strengths`](EspadaEquityPlayerResult::strengths), one slot per **card pair number** as
/// `docs/specs/equity-analysis.md`'s Blocker Score section defines it (see
/// [`crate::equity_job::card_pair_number`]).
pub const EQUITY_CARD_PAIR_COUNT: usize = 1326;

/// one of a hand-range player's own live card pairs, individually — settlement only (see
/// [`EspadaEquityPlayerResult::pairs`]'s own doc comment for why a progress tick carries this
/// list empty): a card pair overlapping the board, or with no live opponent combo ever
/// consistent with it, carries no entry at all — with that pair's own settled equity and its
/// current strength, the product of [`crate::equity_job`]'s own per-opponent pairwise lead
/// (see `lib/espada-internal/src/evaluator/pairwise_lead.rs`) computed lazily, on first read,
/// by whichever worker thread reaches it first (via [`OnceLock::get_or_init`]) — never before
/// at least one shard has completed, not eagerly at job start — and held constant across
/// every tick after that (see [`EspadaEquityPlayerResult::pairs`] again).
///
/// `card_a`/`card_b` are each a card index in `0..52`: `rank * 4 + suit`, `Rank` ordered
/// `Ace..Deuce` and `Suit` ordered `Spade, Heart, Diamond, Club` — the same encoding
/// `lib/espada-internal/src/evaluator/equity.rs`'s own (private) `card_index` uses, restated
/// here since nothing in `espada` exports it. `card_a <= card_b`, matching `CardPair`'s own
/// construction invariant.
///
/// `equity_q16` and `strength_q16` each quantize a `[0.0, 1.0]` fraction into a 16-bit
/// fixed-point count out of `u16::MAX` (`round(value * 65535.0)`) rather than crossing at
/// full `f64`/`f32` precision: a hand-range player can hold up to 1,326 live card pairs, and
/// three full-precision numbers per pair at that count alone would have carried this one field
/// past the ≤12KB-per-progress-tick budget the per-player payload as a whole is held to (see
/// `docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`);
/// six bytes per pair (two card-index bytes plus these two `u16`s) keeps the worst case
/// under 8KB with room to spare — moot now that this list is settlement-only rather than
/// carried on every tick, but kept rather than widened, since nothing about the settled list's
/// own size needs to change. the quantization error this introduces (at most `1 / 65535`) is
/// far below anything a strength-band threshold (`docs/decisions/`, above) could be sensitive
/// to.
///
/// preflop (an empty `board`), current strength has no board to be ahead on and is left
/// undefined by design (see the decision record above) — `strength_q16` is `0` for every
/// pair of a preflop result, a sentinel rather than a measurement; a preflop consumer must
/// classify by equity alone and never read this field, exactly as it never would postflop
/// either without checking `equity` first.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EspadaEquityCardPairResult {
    pub card_a: u8,
    pub card_b: u8,
    pub equity_q16: u16,
    pub strength_q16: u16,
}

/// one player's aggregate equity over the whole runout walk, valid only when the settle
/// callback's `status` is [`EspadaEquityStatus::Success`] — every other status carries a
/// null `players` pointer and a `player_count` of 0.
///
/// [`win`](Self::win), [`tie`](Self::tie), and [`equity`](Self::equity) are each a fraction
/// in `[0.0, 1.0]`: `win` and `tie` are the share of opponent-combination weight this
/// player's range wins outright or splits, `equity` is the pot-share equity a split
/// correctly fractions (so `equity` is not simply `win + tie` — a three-way split
/// contributes a third of `tie` to `equity`, not half). every one of those three is summed
/// across the walk weighted by both the opponent-consistent weight *and* this player's own
/// holding weight, matching `EquityEvaluator`'s own documented aggregate: `sum(weight *
/// share) / sum(weight * total)` (`lib/espada-internal/src/evaluator/equity.rs`).
///
/// [`equities`](Self::equities) and [`strengths`](Self::strengths) carry this same
/// accounting a third way, fixed-slot and per pair: two arrays of
/// [`EQUITY_CARD_PAIR_COUNT`] 32-bit floats, one slot per **card pair number**
/// (`docs/specs/equity-analysis.md`'s Blocker Score section;
/// [`crate::equity_job::card_pair_number`] implements it fresh on this side of the boundary,
/// since [`crate::equity_job`]'s own internal card index runs the opposite rank direction).
/// present, and filled, on *every* progress tick as well as at settlement — unlike
/// [`distribution`](Self::distribution) and [`pairs`](Self::pairs) below, which a progress
/// tick now carries empty. a card pair not currently live (its own accumulated total weight
/// is not yet positive) holds `NaN` in both slots; a live pair holds its equity so far in
/// `equities` and its current strength in `strengths`, except preflop, where every slot of
/// `strengths` is `NaN` regardless of live-ness — current strength has no board to be ahead
/// on there (see [`crate::equity_job::current_strengths`]) — while `equities` is still filled
/// normally. a live pair's `equities` slot equals, within `f32` rounding, the same pair's
/// `equity_q16` in the settled [`pairs`](Self::pairs) list, dequantized; its `strengths` slot
/// likewise matches `strength_q16`, except at the preflop `NaN`/`0` sentinel difference just
/// described. crossing these two buffers costs one constant-time copy each, independent of
/// how many card pairs are actually live — see this field's own bridge-side conversion
/// (`lib/bridge/EspadaEngineHybridObject.cpp`) for why that mattered enough to add them.
///
/// [`distribution`](Self::distribution) is that same walk's second, coarser accounting,
/// settlement only (see [`pairs`](Self::pairs) below): a count of this player's own card
/// pairs per equal-width slice of the same `0..=100` equity axis, one slice's own equity
/// being that one card pair's own `share() / total()` ratio (the same ratio the three fields
/// above compute in aggregate, but held per holding rather than folded together) — see
/// `crate::equity_job`'s own doc comment for exactly how each count is built. sums to this
/// player's own total live card-pair count at settlement; a progress tick carries this array
/// zeroed instead of computing it, since nothing reads it before settlement any more.
///
/// [`pairs`](Self::pairs)/[`pair_count`](Self::pair_count) carry the same live card pairs a
/// fourth way: individually, rather than folded into either accounting above — settlement
/// only, like `distribution`: a progress tick carries a null `pairs` and a `pair_count` of
/// `0`, since [`equities`]/[`strengths`] above already cross this same per-pair data on every
/// tick at constant cost, and the per-element conversion this list used to need on every tick
/// is exactly what those two buffers replace. at settlement, every element's own
/// [`strength_q16`](EspadaEquityCardPairResult::strength_q16) is fixed for the life of one
/// calculation: it depends only on the board and every player's range, never on runout
/// progress, so it is computed lazily, on whichever worker thread's tick or settlement first
/// reads it (see [`crate::equity_job::SharedState::strengths`]), and simply reused after that
/// — only each pair's own `equity_q16` moved as the walk accumulated before settlement.
/// valid only for the duration of the call that hands this result here — copy the fields out
/// (dereferencing `pairs` up to `pair_count` elements) if they need to outlive that call.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EspadaEquityPlayerResult {
    pub win: f64,
    pub tie: f64,
    pub equity: f64,
    pub distribution: [u32; EQUITY_DISTRIBUTION_BIN_COUNT],
    pub pairs: *const EspadaEquityCardPairResult,
    pub pair_count: u32,
    pub equities: [f32; EQUITY_CARD_PAIR_COUNT],
    pub strengths: [f32; EQUITY_CARD_PAIR_COUNT],
}

/// an equity job's outcome, passed to its settle callback. distinct from
/// [`crate::ffi::EspadaStatus`] — same first three discriminants for `Success`/
/// `Cancelled`/`Error`, plus two outcomes this job type alone can reach.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EspadaEquityStatus {
    Success = 0,
    Cancelled = 1,
    Error = 2,
    /// every player's range looked individually valid against the board, but no single
    /// deal of the whole deck can give every player a live holding at once — three
    /// players each pinned to `AA` is the standing example, since only four aces exist.
    /// this is a genuine result of the evaluator's own enumeration, not an input the
    /// caller could have rejected up front (see `lib/espada-internal/src/evaluator/equity.rs`'s
    /// `EquityEvaluator::build`), so it is reported here rather than folded into `Error`.
    NoValidRunout = 3,
    /// `player_count` named a count outside the two- or three-player algebra
    /// `EquityEvaluator` implements (its own `MAX_PLAYERS`). reported distinctly rather
    /// than as `Error` so a caller can recognize it without parsing `message` — see this
    /// function's own doc comment for why that check happens here, in the settle
    /// callback, rather than being rejected synchronously like a malformed range string.
    UnsupportedPlayerCount = 4,
}

/// called from a job's worker thread, at most roughly ten times per second, with the job's
/// completion fraction in `[0.0, 1.0]`. `players`/`player_count` carry each player's own
/// currently-accumulated `win`/`tie`/`equity` and its two [`EspadaEquityPlayerResult::equities`]/
/// [`strengths`](EspadaEquityPlayerResult::strengths) buffers — the settle callback's own
/// `players` carries the same fields, plus `distribution` and `pairs`, which a progress tick
/// leaves empty (see [`EspadaEquityPlayerResult::pairs`]'s own doc comment) — computed from
/// whatever weight has accumulated so far rather than the walk's own final total — present
/// only once every player has accumulated nonzero weight by this tick (null/0 otherwise, the
/// same "not available yet" contract the settle callback's own `players` uses for a
/// non-[`Success`](EspadaEquityStatus::Success) status): a tick where even one player's own
/// accumulated weight is still exactly zero carries a null pointer for every player, not a
/// partial array or a `NaN`/zero-filled one. `players` is valid only for the duration of the
/// call — copy it before returning if it needs to outlive this call.
pub type EspadaEquityProgressCallback = extern "C" fn(
    progress: f64,
    players: *const EspadaEquityPlayerResult,
    player_count: u32,
    user_data: *mut c_void,
);

/// called exactly once per job, from whichever worker thread finishes last, with the job's
/// outcome. `players`/`player_count` are meaningful only when `status` is
/// [`EspadaEquityStatus::Success`] (null/0 otherwise); `players` is valid only for the
/// duration of the call — copy it before returning if it needs to outlive this call.
/// `message` is non-null only when `status` is [`EspadaEquityStatus::Error`], and is
/// likewise valid only for the duration of the call.
pub type EspadaEquitySettleCallback = extern "C" fn(
    status: EspadaEquityStatus,
    players: *const EspadaEquityPlayerResult,
    player_count: u32,
    message: *const c_char,
    user_data: *mut c_void,
);

/// starts a job computing real equity for a table of players, sharded across
/// `thread_count` Rust-owned worker threads (0 = every available core, clamped rather than
/// rejected — reusing [`crate::job::clamp_thread_count`]).
///
/// `board` is a space-separated list of card codes (e.g. `"Ah Kd 2c"`) naming 0 (preflop),
/// or 3, 4, or 5 (postflop) known board cards; an empty string means preflop, never a null
/// pointer — the C++ bridge always has *some* board string to pass, even if it is empty.
///
/// `player_ranges` points to `player_count` hand-range C strings (e.g. `"AA"`,
/// `"22+,A2s+,AJo+"`, the same grammar `HandRange::from_str` accepts) — `player_count` is a
/// real argument here, unlike a fixed 2-or-3 pair of slots, deliberately: whether a table of
/// this size is supported is for `EquityEvaluator::build` to decide, not this function, so
/// this layer accepts whatever count it is given and lets construction reject it (see
/// [`EspadaEquityStatus::UnsupportedPlayerCount`]'s own doc comment for why that check
/// belongs there rather than here).
///
/// a range or board string that fails to *parse* is different from an *unsupported count*:
/// it is rejected synchronously, before any job exists — this function returns null and
/// records the reason for `espada_engine_last_error` on this same thread, exactly like a
/// null `progress_cb`/`settle_cb` does. every other rejection `EquityEvaluator::build` can
/// raise — an unsupported player count, or (rarely) a range the board leaves nothing of —
/// still returns a valid job handle, reported through the settle callback instead (as
/// [`EspadaEquityStatus::UnsupportedPlayerCount`] or, for every other such case,
/// [`EspadaEquityStatus::Error`]). that split matters for safety, not just consistency: the
/// settle callback must never fire before this function returns its handle to the caller,
/// since the C++ bridge stores that handle under a lock this call already holds — settling
/// synchronously here would let a settle-triggered `release()` deadlock on it. spawning a
/// worker thread even for a job with no computation to do is what keeps that ordering
/// intact.
///
/// returns without blocking for any part of the computation — including every hand-range
/// player's own current strength, which this function leaves uncomputed rather than paying
/// up front: it is populated lazily, on first read, by whichever worker thread reaches it
/// first once spawned, running alongside the ongoing walk on every other worker thread (see
/// `crate::equity_job::SharedState::strengths`'s own doc comment).
///
/// # Safety
///
/// `player_ranges` must be null (only when `player_count` is 0) or point to at least
/// `player_count` valid, non-null, null-terminated C strings, all readable for the duration
/// of this call.
#[no_mangle]
pub unsafe extern "C" fn espada_engine_equity_start(
    board: *const c_char,
    player_ranges: *const *const c_char,
    player_count: u32,
    thread_count: u32,
    progress_cb: Option<EspadaEquityProgressCallback>,
    settle_cb: Option<EspadaEquitySettleCallback>,
    user_data: *mut c_void,
) -> *mut EquityJob {
    ffi_guard(std::ptr::null_mut(), || {
        clear_last_error();

        let (progress_cb, settle_cb) = match (progress_cb, settle_cb) {
            (Some(progress_cb), Some(settle_cb)) => (progress_cb, settle_cb),
            _ => {
                set_last_error(
                    EspadaErrorCode::InvalidArgument,
                    "progress_cb and settle_cb must both be non-null",
                );
                return std::ptr::null_mut();
            }
        };

        let board = match parse_board(board) {
            Ok(board) => board,
            Err(message) => {
                set_last_error(EspadaErrorCode::InvalidArgument, message);
                return std::ptr::null_mut();
            }
        };

        let players = match unsafe { parse_players(player_ranges, player_count) } {
            Ok(players) => players,
            Err(message) => {
                set_last_error(EspadaErrorCode::InvalidArgument, message);
                return std::ptr::null_mut();
            }
        };

        equity_job::start(
            board,
            players,
            thread_count,
            progress_cb,
            settle_cb,
            user_data,
        )
    })
}

/// requests cancellation of a running equity job. same contract as
/// [`crate::ffi::espada_engine_cancel`]: sets a flag workers observe between shards, never
/// joins them, and never itself blocks — the job still settles exactly once, as
/// [`EspadaEquityStatus::Cancelled`], through its settle callback.
///
/// returns 0 on success, or a nonzero [`EspadaErrorCode`] if `job` is null.
///
/// # Safety
///
/// `job` must be null or a handle returned by [`espada_engine_equity_start`] that has not
/// yet been passed to [`espada_engine_equity_free`].
#[no_mangle]
pub unsafe extern "C" fn espada_engine_equity_cancel(job: *mut EquityJob) -> i32 {
    ffi_guard(EspadaErrorCode::Internal as i32, || {
        clear_last_error();
        if job.is_null() {
            set_last_error(EspadaErrorCode::InvalidArgument, "job must not be null");
            return EspadaErrorCode::InvalidArgument as i32;
        }
        equity_job::cancel(unsafe { &*job });
        0
    })
}

/// releases an equity job handle. same contract as [`crate::ffi::espada_engine_free`]: safe
/// after the job has settled, safe while it is still running (a worker thread still going
/// keeps its own reference and winds down on its own), and a null `job` is a no-op.
///
/// # Safety
///
/// `job` must be null or a handle returned by [`espada_engine_equity_start`], and must be
/// passed to this function exactly once.
#[no_mangle]
pub unsafe extern "C" fn espada_engine_equity_free(job: *mut EquityJob) {
    ffi_guard((), || {
        if job.is_null() {
            return;
        }
        drop(unsafe { Box::from_raw(job) });
    })
}

/// parses the `board` argument: an empty string for preflop, or space-separated card codes
/// for a postflop table. card-syntax errors are reported by naming the offending token, so
/// a caller does not have to guess which one of several space-separated cards was
/// malformed.
fn parse_board(board: *const c_char) -> Result<Vec<Card>, String> {
    let text = read_c_str(board, "board")?;

    text.split_whitespace()
        .map(|token| {
            Card::from_str(token).map_err(|_| format!("board: \"{token}\" is not a valid card."))
        })
        .collect()
}

/// parses `player_ranges`/`player_count` into the `Vec<HandRange>` [`equity_job::start`]
/// takes. deliberately does not itself judge whether `player_count` is a supported number
/// of players — see [`espada_engine_equity_start`]'s own doc comment for why that check
/// belongs to `EquityEvaluator::build` instead. a null string anywhere in the array, or one
/// that fails `HandRange::from_str`, is reported by naming which player index it was.
///
/// # Safety
///
/// same as [`espada_engine_equity_start`]'s own safety section for `player_ranges`.
unsafe fn parse_players(
    player_ranges: *const *const c_char,
    player_count: u32,
) -> Result<Vec<HandRange>, String> {
    if player_count == 0 {
        return Ok(Vec::new());
    }
    if player_ranges.is_null() {
        return Err("player_ranges must not be null when player_count > 0".to_string());
    }

    let entries = unsafe { std::slice::from_raw_parts(player_ranges, player_count as usize) };

    entries
        .iter()
        .enumerate()
        .map(|(index, range)| parse_range(*range, index))
        .collect()
}

fn parse_range(range: *const c_char, player_index: usize) -> Result<HandRange, String> {
    let arg_name = format!("player_ranges[{player_index}]");
    let text = read_c_str(range, &arg_name)?;

    HandRange::from_str(&text).map_err(|error| format!("{arg_name}: {error}"))
}

fn read_c_str(ptr: *const c_char, arg_name: &str) -> Result<String, String> {
    if ptr.is_null() {
        return Err(format!("{arg_name} must not be null"));
    }

    Ok(unsafe { CStr::from_ptr(ptr) }
        .to_string_lossy()
        .into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::espada_engine_last_error;
    use std::ffi::CString;
    use std::sync::{Condvar, Mutex};
    use std::time::Duration;

    /// `(status, per-player results, error message)`, exactly what
    /// `record_settlement` copies out of a settle callback's raw pointers before they
    /// stop being valid.
    type Settlement = (
        EspadaEquityStatus,
        Vec<EspadaEquityPlayerResult>,
        Option<String>,
    );

    /// one progress callback invocation: the completion fraction, and each player's own
    /// currently-accumulated result, `None` for a tick with nothing available yet — exactly
    /// what `record_progress` copies out of the callback's raw `players`/`player_count`
    /// before they stop being valid.
    type ProgressTick = (f64, Option<Vec<EspadaEquityPlayerResult>>);

    struct Outcome {
        settled: Mutex<Option<Settlement>>,
        condvar: Condvar,
        progress: Mutex<Vec<ProgressTick>>,
    }

    impl Outcome {
        fn new() -> Self {
            Outcome {
                settled: Mutex::new(None),
                condvar: Condvar::new(),
                progress: Mutex::new(Vec::new()),
            }
        }

        fn wait_for_settlement(&self, timeout: Duration) -> Settlement {
            let guard = self.settled.lock().unwrap();
            let (guard, result) = self
                .condvar
                .wait_timeout_while(guard, timeout, |settled| settled.is_none())
                .unwrap();
            assert!(!result.timed_out(), "job did not settle within {timeout:?}");
            guard.clone().expect("settled but recorded no outcome")
        }
    }

    extern "C" fn record_progress(
        progress: f64,
        players: *const EspadaEquityPlayerResult,
        player_count: u32,
        user_data: *mut c_void,
    ) {
        let outcome = unsafe { &*(user_data as *const Outcome) };
        let players = if players.is_null() {
            None
        } else {
            Some(unsafe { std::slice::from_raw_parts(players, player_count as usize) }.to_vec())
        };
        outcome.progress.lock().unwrap().push((progress, players));
    }

    extern "C" fn record_settlement(
        status: EspadaEquityStatus,
        players: *const EspadaEquityPlayerResult,
        player_count: u32,
        message: *const c_char,
        user_data: *mut c_void,
    ) {
        let outcome = unsafe { &*(user_data as *const Outcome) };
        let players = if players.is_null() {
            Vec::new()
        } else {
            unsafe { std::slice::from_raw_parts(players, player_count as usize) }.to_vec()
        };
        let message = if message.is_null() {
            None
        } else {
            Some(
                unsafe { CStr::from_ptr(message) }
                    .to_string_lossy()
                    .into_owned(),
            )
        };
        *outcome.settled.lock().unwrap() = Some((status, players, message));
        outcome.condvar.notify_all();
    }

    fn c(text: &str) -> CString {
        CString::new(text).unwrap()
    }

    /// owns the `CString`s a call's `player_ranges` array points into, so the pointers
    /// handed to `espada_engine_equity_start` stay valid for the call — a bare `Vec<CString>`
    /// dropped before the pointer array is built would leave it dangling.
    struct PlayerRanges {
        _owned: Vec<CString>,
        pointers: Vec<*const c_char>,
    }

    impl PlayerRanges {
        fn new(texts: &[&str]) -> Self {
            let owned: Vec<CString> = texts.iter().map(|t| c(t)).collect();
            let pointers = owned.iter().map(|s| s.as_ptr()).collect();
            PlayerRanges {
                _owned: owned,
                pointers,
            }
        }

        fn as_ptr(&self) -> *const *const c_char {
            if self.pointers.is_empty() {
                std::ptr::null()
            } else {
                self.pointers.as_ptr()
            }
        }

        fn len(&self) -> u32 {
            self.pointers.len() as u32
        }
    }

    fn run_job(board: &str, players: &[&str], thread_count: u32) -> Settlement {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let board_c = c(board);
        let player_ranges = PlayerRanges::new(players);

        let job = unsafe {
            espada_engine_equity_start(
                board_c.as_ptr(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                thread_count,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };
        assert!(!job.is_null(), "start unexpectedly returned null");

        let (status, players, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        unsafe { espada_engine_equity_free(job) };
        (status, players, message)
    }

    #[test]
    fn it_computes_equity_for_a_two_player_river() {
        let (status, players, message) = run_job("Qs 8d 2h 7c 4d", &["JJ+", "A2s+"], 0);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(players.len(), 2);
        for player in &players {
            assert!((0.0..=1.0).contains(&player.equity));
        }
        // the two players' equities sum to (approximately) the whole pot.
        assert!((players[0].equity + players[1].equity - 1.0).abs() < 1e-9);
    }

    #[test]
    fn it_reports_no_valid_runout_when_three_players_all_need_every_ace() {
        let (status, players, message) = run_job("Qs 8d 2h", &["AA", "AA", "AA"], 0);

        assert_eq!(status, EspadaEquityStatus::NoValidRunout);
        assert!(players.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_reports_unsupported_player_count_through_settle_rather_than_rejecting_synchronously() {
        // four players is not a synchronous rejection — `player_count` is a real argument
        // this layer passes straight through, so `EquityEvaluator::build` is what decides
        // it is unsupported, and does so through the settle callback.
        let (status, players, message) = run_job("Qs 8d 2h", &["JJ", "AKo", "22", "33"], 0);

        assert_eq!(status, EspadaEquityStatus::UnsupportedPlayerCount);
        assert!(players.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_rejects_an_unparseable_board_card_before_starting() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let board = c("Zz 8d 2h");
        let player_ranges = PlayerRanges::new(&["JJ+", "AKo"]);

        let job = unsafe {
            espada_engine_equity_start(
                board.as_ptr(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                0,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };

        assert!(job.is_null());

        let mut code = -1;
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
        assert!(!message.is_null());
    }

    #[test]
    fn it_rejects_an_unparseable_range_before_starting() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let board = c("Qs 8d 2h");
        let player_ranges = PlayerRanges::new(&["not a range", "AKo"]);

        let job = unsafe {
            espada_engine_equity_start(
                board.as_ptr(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                0,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };

        assert!(job.is_null());

        let mut code = -1;
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
        assert!(!message.is_null());
    }

    #[test]
    fn it_treats_an_empty_board_as_preflop() {
        // an empty board is the preflop walk (2,598,960 boards) — large enough, at one
        // thread, that cancelling right after `start` reliably lands well before the walk
        // would finish on its own. this only checks that an empty board is accepted at all
        // (reaches the settle callback, rather than being rejected as an unparsable board).
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let board = c("");
        let player_ranges = PlayerRanges::new(&["AsKs", "QhJd"]);

        let job = unsafe {
            espada_engine_equity_start(
                board.as_ptr(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                1,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };

        assert!(!job.is_null());
        let cancel_result = unsafe { espada_engine_equity_cancel(job) };
        assert_eq!(cancel_result, 0);

        let (status, players, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        unsafe { espada_engine_equity_free(job) };

        assert_eq!(status, EspadaEquityStatus::Cancelled);
        assert!(players.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_rejects_a_null_board() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let player_ranges = PlayerRanges::new(&["JJ+", "AKo"]);

        let job = unsafe {
            espada_engine_equity_start(
                std::ptr::null(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                0,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };

        assert!(job.is_null());
        let mut code = -1;
        unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
    }

    #[test]
    fn it_rejects_a_null_player_ranges_pointer_when_count_is_nonzero() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let board = c("Qs 8d 2h");

        let job = unsafe {
            espada_engine_equity_start(
                board.as_ptr(),
                std::ptr::null(),
                2,
                0,
                Some(record_progress),
                Some(record_settlement),
                user_data,
            )
        };

        assert!(job.is_null());
        let mut code = -1;
        unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
    }

    #[test]
    fn cancelling_a_null_job_returns_an_error_without_crashing() {
        let result = unsafe { espada_engine_equity_cancel(std::ptr::null_mut()) };
        assert_ne!(result, 0);
    }

    #[test]
    fn freeing_a_null_job_is_a_safe_no_op() {
        unsafe { espada_engine_equity_free(std::ptr::null_mut()) };
    }

    #[test]
    fn starting_with_a_null_callback_returns_an_error_instead_of_panicking() {
        let board = c("Qs 8d 2h");
        let player_ranges = PlayerRanges::new(&["JJ+", "AKo"]);

        let job = unsafe {
            espada_engine_equity_start(
                board.as_ptr(),
                player_ranges.as_ptr(),
                player_ranges.len(),
                0,
                None,
                Some(record_settlement),
                std::ptr::null_mut(),
            )
        };

        assert!(job.is_null());
        let mut code = -1;
        let message = unsafe { espada_engine_last_error(&mut code) };
        assert_eq!(code, EspadaErrorCode::InvalidArgument as i32);
        assert!(!message.is_null());
    }
}
