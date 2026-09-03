//! the equity job: spawning Rust-owned worker threads that shard an [`EquityEvaluator`]'s
//! own runout walk via [`EquityEvaluator::partition`], aggregating each worker's per-player
//! win/tie/share/total weights into one result per player, and pushing progress and
//! completion back through caller-supplied callbacks — the same handle-based shape
//! [`crate::job`] uses for the demo workload, but sharding the walk instead of a numeric
//! range, and settling with two outcomes the demo job has no use for (see
//! [`crate::equity_ffi::EspadaEquityStatus`]).

use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use espada::card::Card;
use espada::evaluator::{EquityEvaluator, EquityEvaluatorError, RunoutPlayer};
use espada::hand_range::HandRange;

use crate::equity_ffi::{
    EspadaEquityPlayerResult, EspadaEquityProgressCallback, EspadaEquitySettleCallback,
    EspadaEquityStatus,
};
use crate::job::{clamp_thread_count, host_available_parallelism};

/// progress callbacks fire at most this often per job — same cap, and same "one final
/// callback always fires" guarantee, as [`crate::job`]'s own [`PROGRESS_MIN_INTERVAL`].
///
/// [`PROGRESS_MIN_INTERVAL`]: crate::job
const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(100);

/// the number of contiguous parts a job's [`EquityEvaluator`] walk is split into, via
/// [`EquityEvaluator::partition`], fixed independently of the thread count so the total is
/// identical no matter how many worker threads pull parts off the cursor.
///
/// higher than the demo workload's own `SHARD_COUNT` (256): a preflop walk is up to
/// 2,598,960 runouts, each considerably more expensive to score than one prime-division
/// trial, so a finer split keeps cancellation latency and progress granularity reasonable
/// at that end of the range. a shard this small is still cheap on a short walk (a river
/// board's single runout, say) — most shards are simply empty, which
/// [`EquityEvaluator::partition`] already handles without a special case.
const SHARD_COUNT: u32 = 4096;

/// wraps a caller-supplied `void*` so it can be captured by worker thread closures. sound
/// for the same reason [`crate::job`]'s own `SendPtr` is: this crate only ever hands the
/// pointer back, unmodified, to the caller's own callback.
struct SendPtr(*mut c_void);
unsafe impl Send for SendPtr {}
unsafe impl Sync for SendPtr {}

/// one player's accumulated win/tie/share/total weight, summed across every runout a
/// worker's shards yielded, each row scaled by its own holding weight — matching
/// `EquityEvaluator`'s own documented aggregate (`lib/espada-internal/src/evaluator/equity.rs`):
/// `sum(weight * x)` for each of `win`, `tie`, `share`, and `total`.
#[derive(Clone, Copy, Default)]
struct PlayerTotals {
    win_weight: f64,
    tie_weight: f64,
    share_weight: f64,
    total_weight: f64,
}

impl PlayerTotals {
    fn accumulate(&mut self, row: &RunoutPlayer) {
        let weight = row.weight();

        self.win_weight += weight * row.win();
        self.tie_weight += weight * row.tie();
        self.share_weight += weight * row.share();
        self.total_weight += weight * row.total();
    }

    fn merge(&mut self, other: &PlayerTotals) {
        self.win_weight += other.win_weight;
        self.tie_weight += other.tie_weight;
        self.share_weight += other.share_weight;
        self.total_weight += other.total_weight;
    }

    /// converts the accumulated totals into the fractions the settle callback carries.
    /// only meaningful once the caller has ruled out `total_weight == 0.0` — see
    /// [`settle`]'s own "no valid runout" check, which happens before this is ever called.
    fn finalize(&self) -> EspadaEquityPlayerResult {
        EspadaEquityPlayerResult {
            win: self.win_weight / self.total_weight,
            tie: self.tie_weight / self.total_weight,
            equity: self.share_weight / self.total_weight,
        }
    }
}

struct SharedState {
    /// `Some` once `EquityEvaluator::preflop`/`postflop` built successfully; `None` when
    /// construction was rejected (see `rejection`), in which case no worker ever shards a
    /// walk that does not exist.
    evaluator: Option<EquityEvaluator>,
    /// the outcome a rejected construction settles with — carried here rather than
    /// discovered at settle time, since only `start` (which called `preflop`/`postflop`)
    /// ever has the `EquityEvaluatorError` to classify.
    rejection: Option<(EspadaEquityStatus, Option<String>)>,
    player_count: usize,
    next_shard: AtomicU32,
    completed_shards: AtomicU32,
    cancelled: AtomicBool,
    settled: AtomicBool,
    /// counts worker threads that haven't finished yet, the same "last one out settles"
    /// design [`crate::job`] uses.
    active_workers: AtomicUsize,
    fault_message: Mutex<Option<String>>,
    /// per-player totals, merged in once per completed shard rather than once per runout —
    /// the same granularity `crate::job` merges progress at, so the lock is contended at
    /// most `SHARD_COUNT` times over the job's whole life.
    totals: Mutex<Vec<PlayerTotals>>,
    last_progress_nanos: AtomicU64,
    start_instant: Instant,
    progress_cb: EspadaEquityProgressCallback,
    settle_cb: EspadaEquitySettleCallback,
    user_data: SendPtr,
}

/// the opaque job handle returned by `espada_engine_equity_start`.
pub struct EquityJob {
    state: Arc<SharedState>,
}

/// starts an equity job: builds an [`EquityEvaluator`] for `board`/`players` (preflop when
/// `board` is empty, postflop otherwise), then spawns `clamp_thread_count(thread_count,
/// <host cores>)` Rust-owned worker threads that shard its walk via
/// [`EquityEvaluator::partition`]. returns immediately without blocking for any part of the
/// computation, and — unlike [`crate::job::start`] — never returns null: a construction
/// failure ([`EquityEvaluatorError::UnsupportedPlayerCount`] or any other) still gets a real
/// job handle, settled through the callback instead (see this module's own doc comment and
/// [`crate::equity_ffi::espada_engine_equity_start`]'s "why not synchronously" note).
pub(crate) fn start(
    board: Vec<Card>,
    players: Vec<HandRange>,
    thread_count: u32,
    progress_cb: EspadaEquityProgressCallback,
    settle_cb: EspadaEquitySettleCallback,
    user_data: *mut c_void,
) -> *mut EquityJob {
    let player_count = players.len();
    let built = if board.is_empty() {
        EquityEvaluator::preflop(&players)
    } else {
        EquityEvaluator::postflop(&board, &players)
    };

    let (evaluator, rejection) = match built {
        Ok(evaluator) => (Some(evaluator), None),
        Err(EquityEvaluatorError::UnsupportedPlayerCount(_)) => (
            None,
            Some((EspadaEquityStatus::UnsupportedPlayerCount, None)),
        ),
        Err(other) => (
            None,
            Some((EspadaEquityStatus::Error, Some(other.to_string()))),
        ),
    };

    // a rejected construction still needs exactly one worker thread to deliver the settle
    // callback — never zero, or nothing would ever call it, and never synchronously from
    // this function, or a settle-triggered `release()` on the C++ side could deadlock on
    // the lock `start()` there still holds (see this module's doc comment).
    let effective_threads = if evaluator.is_some() {
        clamp_thread_count(thread_count, host_available_parallelism())
    } else {
        1
    };

    let state = Arc::new(SharedState {
        evaluator,
        rejection,
        player_count,
        next_shard: AtomicU32::new(0),
        completed_shards: AtomicU32::new(0),
        cancelled: AtomicBool::new(false),
        settled: AtomicBool::new(false),
        active_workers: AtomicUsize::new(effective_threads as usize),
        fault_message: Mutex::new(None),
        totals: Mutex::new(vec![PlayerTotals::default(); player_count]),
        last_progress_nanos: AtomicU64::new(0),
        start_instant: Instant::now(),
        progress_cb,
        settle_cb,
        user_data: SendPtr(user_data),
    });

    for _ in 0..effective_threads {
        let worker_state = Arc::clone(&state);
        std::thread::spawn(move || run_worker(worker_state));
    }

    Box::into_raw(Box::new(EquityJob { state }))
}

/// sets the job's cancellation flag. same contract as [`crate::job::cancel`]: workers
/// observe it between shards, never mid-shard, and this call never joins them.
pub(crate) fn cancel(job: &EquityJob) {
    job.state.cancelled.store(true, Ordering::Release);
}

/// a worker thread's whole body: catches a panic raised while sharding or scoring, so one
/// worker's bug is reported as [`EspadaEquityStatus::Error`] rather than aborting the
/// process, then always runs the "did I finish last?" bookkeeping — panic or not. mirrors
/// [`crate::job::run_worker`] exactly.
fn run_worker(state: Arc<SharedState>) {
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker_loop(&state)));
    if let Err(payload) = outcome {
        let message = crate::error::panic_message(&payload);
        let mut fault = state
            .fault_message
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if fault.is_none() {
            *fault = Some(message);
        }
    }
    finish_worker(&state);
}

fn worker_loop(state: &SharedState) {
    // a rejected construction has no evaluator to shard — this worker's only job is to be
    // the one `finish_worker` counts down to zero, so `settle` runs and reports `rejection`.
    let Some(evaluator) = state.evaluator.as_ref() else {
        return;
    };

    loop {
        if state.cancelled.load(Ordering::Acquire) {
            return;
        }
        let shard_index = state.next_shard.fetch_add(1, Ordering::Relaxed);
        if shard_index >= SHARD_COUNT {
            return;
        }

        let part = evaluator.partition(SHARD_COUNT, shard_index, shard_index + 1);
        let mut local = vec![PlayerTotals::default(); state.player_count];

        for runout in &part {
            for row in runout.players() {
                local[row.player_index()].accumulate(row);
            }
        }

        {
            let mut totals = state.totals.lock().unwrap_or_else(|e| e.into_inner());
            for (slot, delta) in totals.iter_mut().zip(&local) {
                slot.merge(delta);
            }
        }

        let completed = state.completed_shards.fetch_add(1, Ordering::AcqRel) + 1;
        maybe_emit_progress(state, completed);
    }
}

fn maybe_emit_progress(state: &SharedState, completed_shards: u32) {
    let is_final = completed_shards >= SHARD_COUNT;
    let now_nanos = state.start_instant.elapsed().as_nanos() as u64;

    if is_final {
        // see `crate::job::maybe_emit_progress`'s own comment: exactly one call across
        // every worker ever observes `completed_shards >= SHARD_COUNT`, so this stores
        // unconditionally rather than gating behind a compare-exchange a concurrent
        // non-final worker's own compare-exchange could invalidate.
        state
            .last_progress_nanos
            .store(now_nanos, Ordering::Relaxed);
        (state.progress_cb)(1.0, state.user_data.0);
        return;
    }

    let last_nanos = state.last_progress_nanos.load(Ordering::Relaxed);
    let interval_nanos = PROGRESS_MIN_INTERVAL.as_nanos() as u64;
    if now_nanos.saturating_sub(last_nanos) < interval_nanos {
        return;
    }
    if state
        .last_progress_nanos
        .compare_exchange(last_nanos, now_nanos, Ordering::Relaxed, Ordering::Relaxed)
        .is_ok()
    {
        let fraction = (completed_shards as f64 / SHARD_COUNT as f64).min(1.0);
        (state.progress_cb)(fraction, state.user_data.0);
    }
}

fn finish_worker(state: &SharedState) {
    let remaining = state.active_workers.fetch_sub(1, Ordering::AcqRel) - 1;
    if remaining == 0 {
        settle(state);
    }
}

/// calls `settle_cb` exactly once, from whichever worker thread finishes last, in priority
/// order: an internal fault (a caught panic) first, then cancellation, then a rejected
/// construction (`UnsupportedPlayerCount` or another `EquityEvaluatorError`), then — only
/// once a real walk actually ran — whether it found the situation combinatorially
/// impossible or produced a real result.
fn settle(state: &SharedState) {
    if state
        .settled
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return;
    }

    let fault = state
        .fault_message
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();

    if let Some(message) = fault {
        let message =
            CString::new(message).unwrap_or_else(|_| CString::new("internal fault").unwrap());
        (state.settle_cb)(
            EspadaEquityStatus::Error,
            std::ptr::null(),
            0,
            message.as_ptr(),
            state.user_data.0,
        );
        return;
    }

    if state.cancelled.load(Ordering::Acquire) {
        (state.settle_cb)(
            EspadaEquityStatus::Cancelled,
            std::ptr::null(),
            0,
            std::ptr::null(),
            state.user_data.0,
        );
        return;
    }

    if let Some((status, message)) = &state.rejection {
        let c_message = message.as_ref().map(|m| {
            CString::new(m.as_str()).unwrap_or_else(|_| CString::new("invalid input").unwrap())
        });
        let message_ptr = c_message.as_ref().map_or(std::ptr::null(), |m| m.as_ptr());
        (state.settle_cb)(*status, std::ptr::null(), 0, message_ptr, state.user_data.0);
        return;
    }

    let totals = state.totals.lock().unwrap_or_else(|e| e.into_inner());

    // every term `PlayerTotals::accumulate` adds is a sum of `weight * total()` — each
    // `total()` a non-negative opponent-consistent weight (`Outcome::new` floors it at
    // zero) — so the sum stays exactly 0.0 in IEEE754 unless at least one runout
    // contributed a genuinely positive term. a situation where no full deal can give every
    // player a live holding at once (see `EspadaEquityStatus::NoValidRunout`'s own doc
    // comment) makes every row's `total()` exactly 0.0 on every runout, so this reads it
    // back exactly rather than against a tolerance.
    let no_valid_runout = totals.iter().any(|player| player.total_weight == 0.0);

    if no_valid_runout {
        (state.settle_cb)(
            EspadaEquityStatus::NoValidRunout,
            std::ptr::null(),
            0,
            std::ptr::null(),
            state.user_data.0,
        );
        return;
    }

    let results: Vec<EspadaEquityPlayerResult> =
        totals.iter().map(PlayerTotals::finalize).collect();
    (state.settle_cb)(
        EspadaEquityStatus::Success,
        results.as_ptr(),
        results.len() as u32,
        std::ptr::null(),
        state.user_data.0,
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use std::sync::{Condvar, Mutex as StdMutex};
    use std::time::Duration;

    fn cards(text: &str) -> Vec<Card> {
        text.split_whitespace()
            .map(|c| Card::from_str(c).unwrap())
            .collect()
    }

    fn ranges(texts: &[&str]) -> Vec<HandRange> {
        texts
            .iter()
            .map(|text| HandRange::from_str(text).unwrap())
            .collect()
    }

    /// `(status, per-player results, error message)`, exactly what
    /// `record_settlement` copies out of a settle callback's raw pointers before they
    /// stop being valid.
    type Settlement = (
        EspadaEquityStatus,
        Vec<EspadaEquityPlayerResult>,
        Option<String>,
    );

    struct Outcome {
        settled: StdMutex<Option<Settlement>>,
        condvar: Condvar,
    }

    impl Outcome {
        fn new() -> Self {
            Outcome {
                settled: StdMutex::new(None),
                condvar: Condvar::new(),
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

    extern "C" fn ignore_progress(_progress: f64, _user_data: *mut c_void) {}

    extern "C" fn record_settlement(
        status: EspadaEquityStatus,
        players: *const EspadaEquityPlayerResult,
        player_count: u32,
        message: *const std::ffi::c_char,
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
                unsafe { std::ffi::CStr::from_ptr(message) }
                    .to_string_lossy()
                    .into_owned(),
            )
        };
        *outcome.settled.lock().unwrap() = Some((status, players, message));
        outcome.condvar.notify_all();
    }

    fn run(board: Vec<Card>, players: Vec<HandRange>, thread_count: u32) -> Settlement {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;

        let job = start(
            board,
            players,
            thread_count,
            ignore_progress,
            record_settlement,
            user_data,
        );
        assert!(!job.is_null());

        let result = outcome.wait_for_settlement(Duration::from_secs(30));
        drop(unsafe { Box::from_raw(job) });
        result
    }

    /// a single-threaded, unsharded reference: the same aggregate `sum(weight * share) /
    /// sum(weight * total)` `EquityEvaluator`'s own doc comment describes, computed by
    /// walking the whole evaluator directly rather than through this job's worker threads
    /// or its `SHARD_COUNT`-based partitioning.
    fn reference_equities(evaluator: &EquityEvaluator, player_count: usize) -> Vec<PlayerTotals> {
        let mut totals = vec![PlayerTotals::default(); player_count];

        for runout in evaluator {
            for row in runout.players() {
                totals[row.player_index()].accumulate(row);
            }
        }

        totals
    }

    fn assert_close(left: f64, right: f64) {
        assert!(
            (left - right).abs() <= 1e-9 * left.abs().max(right.abs()).max(1.0),
            "{left} and {right} are not close"
        );
    }

    #[test]
    fn it_matches_a_single_threaded_reference_for_a_two_player_flop() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["JJ,A5s", "AhKh,5c4c"]);
        let reference = reference_equities(
            &EquityEvaluator::postflop(&board, &players).unwrap(),
            players.len(),
        );

        for &thread_count in &[1u32, 4, 0] {
            let (status, results, message) = run(board.clone(), players.clone(), thread_count);

            assert_eq!(
                status,
                EspadaEquityStatus::Success,
                "thread_count {thread_count}"
            );
            assert_eq!(message, None);
            assert_eq!(results.len(), 2);

            for (index, result) in results.iter().enumerate() {
                let want = reference[index].finalize();
                assert_close(result.win, want.win);
                assert_close(result.tie, want.tie);
                assert_close(result.equity, want.equity);
            }
        }
    }

    #[test]
    fn it_matches_a_single_threaded_reference_for_a_three_player_flop() {
        let board = cards("Qs 8d 2h 7c");
        let players = ranges(&["AhKh,7d7s", "AdKd,7c7h", "AcKc,5c4c"]);
        let reference = reference_equities(
            &EquityEvaluator::postflop(&board, &players).unwrap(),
            players.len(),
        );

        for &thread_count in &[1u32, 4] {
            let (status, results, message) = run(board.clone(), players.clone(), thread_count);

            assert_eq!(
                status,
                EspadaEquityStatus::Success,
                "thread_count {thread_count}"
            );
            assert_eq!(message, None);
            assert_eq!(results.len(), 3);

            for (index, result) in results.iter().enumerate() {
                let want = reference[index].finalize();
                assert_close(result.win, want.win);
                assert_close(result.tie, want.tie);
                assert_close(result.equity, want.equity);
            }
        }
    }

    #[test]
    fn cancelling_mid_walk_settles_as_cancelled_not_success_or_error() {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;

        let job = start(
            vec![],
            ranges(&["AsKs", "QhJd"]),
            1,
            ignore_progress,
            record_settlement,
            user_data,
        );
        assert!(!job.is_null());

        cancel(unsafe { &*job });

        let (status, results, message) = outcome.wait_for_settlement(Duration::from_secs(30));
        drop(unsafe { Box::from_raw(job) });

        assert_eq!(status, EspadaEquityStatus::Cancelled);
        assert!(results.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_reports_no_valid_runout_when_three_players_all_need_every_ace() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["AA", "AA", "AA"]);

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::NoValidRunout);
        assert!(results.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_reports_unsupported_player_count_for_one_player() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["JJ+"]);

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::UnsupportedPlayerCount);
        assert!(results.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_reports_unsupported_player_count_for_four_players() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["JJ", "AKo", "22", "33"]);

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::UnsupportedPlayerCount);
        assert!(results.is_empty());
        assert_eq!(message, None);
    }

    #[test]
    fn it_reports_a_generic_error_for_a_range_the_board_leaves_nothing_of() {
        // a construction failure that is not `UnsupportedPlayerCount` — the board holds
        // every card the sole-holding range names, so nothing survives card removal.
        let board = cards("As Ks Kh");
        let players = ranges(&["JJ", "AsKs,AsKh"]);

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::Error);
        assert!(results.is_empty());
        assert!(message.is_some());
    }
}
