//! the equity job: spawning Rust-owned worker threads that shard an [`EquityEvaluator`]'s
//! own runout walk via [`EquityEvaluator::partition`], aggregating each worker's per-player
//! win/tie/share/total weights into one result per player — both the whole-player aggregate
//! and, per [`PlayerAccumulator`], a second accounting broken out by that player's own
//! individual card pairs — and pushing progress and completion back through caller-supplied
//! callbacks — the same handle-based shape [`crate::job`] uses for the demo workload, but
//! sharding the walk instead of a numeric range, and settling with two outcomes the demo
//! job has no use for (see [`crate::equity_ffi::EspadaEquityStatus`]).
//!
//! the per-card-pair accounting costs no extra pass over the walk: every
//! [`RunoutPlayer`] row this job already visits, once, to fold into a player's own
//! aggregate already names its own [`RunoutPlayer::hole_cards`], so [`PlayerAccumulator`]
//! folds the identical row into a second, per-holding total at the same time — see
//! [`distribution_of`] for how that per-holding accounting becomes the bin counts
//! [`crate::equity_ffi::EspadaEquityPlayerResult::distribution`] carries.

use std::collections::HashMap;
use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use espada::card::Card;
use espada::evaluator::{EquityEvaluator, EquityEvaluatorError, RunoutPlayer};
use espada::hand_range::{CardPair, HandRange};

use crate::equity_ffi::{
    EspadaEquityPlayerResult, EspadaEquityProgressCallback, EspadaEquitySettleCallback,
    EspadaEquityStatus, EQUITY_DISTRIBUTION_BIN_COUNT,
};
use crate::job::{clamp_thread_count, host_available_parallelism, lower_worker_thread_priority};

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
}

/// one player's whole accounting for the walk: the aggregate [`PlayerTotals`] the settle
/// callback's `win`/`tie`/`equity` come from, alongside that same player's own card pairs
/// broken out individually — one [`PlayerTotals`] per [`CardPair`], accumulated and merged
/// exactly like the aggregate is, just keyed by holding instead of summed across all of
/// them. keeping both in one type, behind one lock (see [`SharedState::totals`]), is what
/// keeps a snapshot of the two always consistent with each other: nothing here reads the
/// aggregate and the per-pair map from two separately-locked snapshots that could observe
/// two different shards' worth of progress.
///
/// carrying the per-pair map is bookkeeping alongside a computation this job already runs
/// once per row — every row this job's own worker loop visits already names its own
/// [`RunoutPlayer::hole_cards`], so keying one more accumulator by it costs one hash-map
/// lookup per row already being visited, not a second walk.
#[derive(Clone, Default)]
struct PlayerAccumulator {
    totals: PlayerTotals,
    pairs: HashMap<CardPair, PlayerTotals>,
}

impl PlayerAccumulator {
    fn accumulate(&mut self, row: &RunoutPlayer) {
        self.totals.accumulate(row);
        self.pairs
            .entry(row.hole_cards())
            .or_default()
            .accumulate(row);
    }

    fn merge(&mut self, other: &PlayerAccumulator) {
        self.totals.merge(&other.totals);

        for (pair, totals) in &other.pairs {
            self.pairs.entry(*pair).or_default().merge(totals);
        }
    }

    /// converts the accumulated totals into the result the progress and settle callbacks
    /// carry. only meaningful once the caller has ruled out `totals.total_weight == 0.0` —
    /// see [`settle`]'s own "no valid runout" check, and [`maybe_emit_progress`]'s own
    /// per-player guard, both of which rule it out before this is ever called.
    fn finalize(&self) -> EspadaEquityPlayerResult {
        EspadaEquityPlayerResult {
            win: self.totals.win_weight / self.totals.total_weight,
            tie: self.totals.tie_weight / self.totals.total_weight,
            equity: self.totals.share_weight / self.totals.total_weight,
            distribution: distribution_of(&self.pairs),
        }
    }
}

/// bins each of `pairs`' own card pairs by that one holding's own equity —
/// `share_weight / total_weight`, the same ratio [`PlayerAccumulator::finalize`] computes
/// for the whole player, applied to one holding at a time — into one of
/// [`EQUITY_DISTRIBUTION_BIN_COUNT`] equal-width slices of the `0..=100` equity axis.
///
/// a card pair whose own `total_weight` has not gone positive yet is skipped rather than
/// divided by zero: mid-calculation that means every board this pair is live on still sits
/// in a shard no worker has finished, so it has nothing to report yet; at settlement it
/// means no opponent combination was ever consistent with it on any board it was live on —
/// rare, but not ruled out the way [`settle`]'s own whole-player "no valid runout" check
/// rules it out for every card pair of every player at once. either way the pair is simply
/// not yet counted in any bin, rather than counted in bin `0` or propagating a `NaN`.
///
/// equity is clamped into `[0.0, 1.0]` before binning — cancellation slack in the
/// evaluator's own floating-point sums (see `Outcome::new` in
/// `lib/espada-internal/src/evaluator/equity.rs`) can otherwise land a hair on either side
/// of an exact `0.0` or `1.0` — and a value landing exactly on the axis's own upper bound
/// clamps into the last bin rather than overflowing past it, the same "equity 100% belongs
/// to the top bin" rule a card pair certain to win needs.
fn distribution_of(
    pairs: &HashMap<CardPair, PlayerTotals>,
) -> [u32; EQUITY_DISTRIBUTION_BIN_COUNT] {
    let mut bins = [0u32; EQUITY_DISTRIBUTION_BIN_COUNT];

    for totals in pairs.values() {
        if totals.total_weight <= 0.0 {
            continue;
        }

        let equity = (totals.share_weight / totals.total_weight).clamp(0.0, 1.0);
        let bin = ((equity * EQUITY_DISTRIBUTION_BIN_COUNT as f64) as usize)
            .min(EQUITY_DISTRIBUTION_BIN_COUNT - 1);

        bins[bin] += 1;
    }

    bins
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
    /// per-player accounting — aggregate and per-card-pair alike — merged in once per
    /// completed shard rather than once per runout — the same granularity `crate::job`
    /// merges progress at, so the lock is contended at most `SHARD_COUNT` times over the
    /// job's whole life.
    totals: Mutex<Vec<PlayerAccumulator>>,
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
        totals: Mutex::new(vec![PlayerAccumulator::default(); player_count]),
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

/// a worker thread's whole body: lowers its own scheduling priority (see
/// [`crate::job::lower_worker_thread_priority`]), then catches a panic raised while
/// sharding or scoring, so one worker's bug is reported as [`EspadaEquityStatus::Error`]
/// rather than aborting the process, then always runs the "did I finish last?"
/// bookkeeping — panic or not. mirrors [`crate::job::run_worker`] exactly.
fn run_worker(state: Arc<SharedState>) {
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        lower_worker_thread_priority();
        worker_loop(&state)
    }));
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
        let mut local = vec![PlayerAccumulator::default(); state.player_count];

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

/// the all-or-nothing rule [`EspadaEquityProgressCallback`]'s own doc comment states: `Some`
/// once every player's own accumulated aggregate `total_weight` is nonzero, `None`
/// otherwise — so an early tick where even one player has not yet accumulated a single
/// weighted runout never hands back a partial array or a divide-by-zero `NaN`. this gate is
/// on each player's own *aggregate* total alone — [`distribution_of`] carries its own,
/// separate "not yet counted" handling for a single card pair still at zero, which does not
/// hold up this gate the way a player's own aggregate does. a free function over a plain
/// slice, separate from [`snapshot_players`] below, so this guard is unit-testable without
/// constructing a whole [`SharedState`].
fn finalize_if_ready(accumulators: &[PlayerAccumulator]) -> Option<Vec<EspadaEquityPlayerResult>> {
    if accumulators
        .iter()
        .any(|player| player.totals.total_weight == 0.0)
    {
        return None;
    }
    Some(
        accumulators
            .iter()
            .map(PlayerAccumulator::finalize)
            .collect(),
    )
}

/// builds the per-player array a progress callback carries, per [`finalize_if_ready`]'s own
/// rule. locks [`SharedState::totals`] itself, once, rather than the caller holding it across
/// a call.
fn snapshot_players(state: &SharedState) -> Option<Vec<EspadaEquityPlayerResult>> {
    let totals = state.totals.lock().unwrap_or_else(|e| e.into_inner());
    finalize_if_ready(&totals)
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
        let players = snapshot_players(state);
        emit_progress(state, 1.0, players);
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
        let players = snapshot_players(state);
        emit_progress(state, fraction, players);
    }
}

/// calls `progress_cb` with a snapshot's own borrowed pointer/length, converting `None` into
/// the null-pointer/zero-length pair [`EspadaEquityProgressCallback`]'s own doc comment
/// documents — the exact same "borrow it, call, let it drop" shape [`settle`] below uses for
/// `settle_cb`'s own `players` argument.
fn emit_progress(
    state: &SharedState,
    progress: f64,
    players: Option<Vec<EspadaEquityPlayerResult>>,
) {
    match players {
        Some(players) => {
            (state.progress_cb)(
                progress,
                players.as_ptr(),
                players.len() as u32,
                state.user_data.0,
            );
        }
        None => {
            (state.progress_cb)(progress, std::ptr::null(), 0, state.user_data.0);
        }
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
    // back exactly rather than against a tolerance. this checks each player's own
    // *aggregate* total; `distribution_of` handles the per-pair case separately.
    let no_valid_runout = totals
        .iter()
        .any(|player| player.totals.total_weight == 0.0);

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
        totals.iter().map(PlayerAccumulator::finalize).collect();
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

    /// one progress callback invocation: the completion fraction, and each player's own
    /// currently-accumulated result — `None` for a tick with nothing available yet — exactly
    /// what `record_progress` copies out of the callback's raw `players`/`player_count` before
    /// they stop being valid.
    type ProgressTick = (f64, Option<Vec<EspadaEquityPlayerResult>>);

    struct Outcome {
        settled: StdMutex<Option<Settlement>>,
        condvar: Condvar,
        progress: StdMutex<Vec<ProgressTick>>,
    }

    impl Outcome {
        fn new() -> Self {
            Outcome {
                settled: StdMutex::new(None),
                condvar: Condvar::new(),
                progress: StdMutex::new(Vec::new()),
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

    extern "C" fn ignore_progress(
        _progress: f64,
        _players: *const EspadaEquityPlayerResult,
        _player_count: u32,
        _user_data: *mut c_void,
    ) {
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

    /// same as `run` above, but keeps every progress callback invocation around instead of
    /// discarding them via `ignore_progress` — for a test asserting on the progress
    /// callback's own per-player payload rather than only the settle callback's.
    fn run_with_progress(
        board: Vec<Card>,
        players: Vec<HandRange>,
        thread_count: u32,
    ) -> (Settlement, Vec<ProgressTick>) {
        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;

        let job = start(
            board,
            players,
            thread_count,
            record_progress,
            record_settlement,
            user_data,
        );
        assert!(!job.is_null());

        let result = outcome.wait_for_settlement(Duration::from_secs(30));
        drop(unsafe { Box::from_raw(job) });
        let progress = outcome.progress.lock().unwrap().clone();
        (result, progress)
    }

    /// a single-threaded, unsharded reference: the same aggregate `sum(weight * share) /
    /// sum(weight * total)` `EquityEvaluator`'s own doc comment describes, computed by
    /// walking the whole evaluator directly rather than through this job's worker threads
    /// or its `SHARD_COUNT`-based partitioning. returns a full `PlayerAccumulator` (not
    /// only its aggregate `PlayerTotals`) so `.finalize()` is available on it exactly like
    /// on the sharded job's own accumulators — the tests below read only `.win`/`.tie`/
    /// `.equity` off it, but nothing about this reference's own accumulation differs from
    /// the sharded job's, per-pair accounting included.
    fn reference_equities(
        evaluator: &EquityEvaluator,
        player_count: usize,
    ) -> Vec<PlayerAccumulator> {
        let mut totals = vec![PlayerAccumulator::default(); player_count];

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
    fn it_reports_a_per_player_distribution_that_spans_multiple_equity_slices_and_sums_to_the_live_combo_count(
    ) {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+"]);
        let live_combo_counts: Vec<usize> = players
            .iter()
            .map(|range| {
                range
                    .card_pairs()
                    .keys()
                    .filter(|pair| !board.contains(&pair[0]) && !board.contains(&pair[1]))
                    .count()
            })
            .collect();

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(results.len(), 2);

        for (result, &live_combo_count) in results.iter().zip(&live_combo_counts) {
            let counted: u32 = result.distribution.iter().sum();
            assert_eq!(
                counted as usize, live_combo_count,
                "the distribution's own bins should count every live card pair exactly once"
            );

            let nonzero_bins = result
                .distribution
                .iter()
                .filter(|&&count| count > 0)
                .count();
            assert!(
                nonzero_bins > 1,
                "expected this range's own card pairs to span more than one equity slice, got {nonzero_bins}"
            );
        }
    }

    #[test]
    fn it_reports_a_single_bin_distribution_for_a_single_card_pair_range() {
        // an exact-holding player's own range is one card pair — the same shape a
        // hand-range player's own distribution takes once its range has been narrowed to
        // one live combo, and the case the plan's own verification strategy names.
        let board = cards("Qs 8d 2h");
        let players = ranges(&["AsKs", "22+,A2s+,AJo+"]);

        let (status, results, message) = run(board, players, 0);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(results.len(), 2);

        let single_pair = &results[0];
        let counted: u32 = single_pair.distribution.iter().sum();
        assert_eq!(
            counted, 1,
            "a single card pair has exactly one combo to place"
        );

        let nonzero_bins = single_pair
            .distribution
            .iter()
            .filter(|&&count| count > 0)
            .count();
        assert_eq!(nonzero_bins, 1);

        // with exactly one card pair, that pair's own equity *is* the player's whole
        // aggregate equity, so the bin it lands in follows directly from `equity`.
        let expected_bin = ((single_pair.equity * EQUITY_DISTRIBUTION_BIN_COUNT as f64) as usize)
            .min(EQUITY_DISTRIBUTION_BIN_COUNT - 1);
        assert_eq!(single_pair.distribution[expected_bin], 1);
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

    #[test]
    fn finalize_if_ready_withholds_every_player_until_all_have_accumulated_weight() {
        let mut accumulators = vec![PlayerAccumulator::default(); 2];
        // one player still at exactly zero — the whole tick withholds, not a partial array.
        accumulators[0].totals.total_weight = 4.0;
        accumulators[0].totals.win_weight = 3.0;
        assert_eq!(finalize_if_ready(&accumulators), None);

        accumulators[1].totals.total_weight = 2.0;
        accumulators[1].totals.tie_weight = 1.0;
        let ready = finalize_if_ready(&accumulators).expect("every player has nonzero weight now");
        assert_eq!(ready.len(), 2);
        assert_close(ready[0].win, 3.0 / 4.0);
        assert_close(ready[1].tie, 1.0 / 2.0);
    }

    #[test]
    fn distribution_of_skips_a_card_pair_whose_total_weight_has_not_gone_positive_yet() {
        let mut pairs: HashMap<CardPair, PlayerTotals> = HashMap::new();
        let counted = CardPair::new(Card::from_str("As").unwrap(), Card::from_str("Ks").unwrap());
        let not_yet_accumulated =
            CardPair::new(Card::from_str("2c").unwrap(), Card::from_str("2d").unwrap());

        pairs.insert(
            counted,
            PlayerTotals {
                win_weight: 3.0,
                tie_weight: 0.0,
                share_weight: 3.0,
                total_weight: 4.0,
            },
        );
        // never touched by a completed shard (mid-calculation), or genuinely no consistent
        // opponent combination ever existed for it (at settlement) — either way its own
        // `total_weight` never went positive, so it must not divide by zero or land in bin 0.
        pairs.insert(not_yet_accumulated, PlayerTotals::default());

        let bins = distribution_of(&pairs);

        assert_eq!(
            bins.iter().sum::<u32>(),
            1,
            "the not-yet-counted pair must not appear in any bin"
        );
        // 3.0 / 4.0 = 0.75 equity, which is bin 15 of 20 (0.75..0.80).
        assert_eq!(bins[15], 1);
    }

    #[test]
    fn distribution_of_clamps_equity_of_exactly_one_into_the_last_bin() {
        let mut pairs: HashMap<CardPair, PlayerTotals> = HashMap::new();
        let certain_winner =
            CardPair::new(Card::from_str("As").unwrap(), Card::from_str("Ks").unwrap());

        pairs.insert(
            certain_winner,
            PlayerTotals {
                win_weight: 5.0,
                tie_weight: 0.0,
                share_weight: 5.0,
                total_weight: 5.0,
            },
        );

        let bins = distribution_of(&pairs);

        assert_eq!(bins.iter().sum::<u32>(), 1);
        assert_eq!(bins[EQUITY_DISTRIBUTION_BIN_COUNT - 1], 1);
    }

    #[test]
    fn it_reports_per_player_progress_that_converges_toward_the_final_settlement() {
        // narrow enough to settle in about a second at one thread (debug build), but wide
        // enough that `PROGRESS_MIN_INTERVAL` yields more than one non-final progress tick —
        // deliberately not the widest ranges this crate's other tests use.
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+"]);

        let ((status, settled_results, message), progress) = run_with_progress(board, players, 1);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(settled_results.len(), 2);
        // more than the one final call alone — this walk is wide enough that
        // `PROGRESS_MIN_INTERVAL` catches it mid-run at least once.
        assert!(
            progress.len() > 1,
            "expected more than one progress tick, got {}",
            progress.len()
        );

        // (a) every non-null per-player reading this job produced is a fraction in [0, 1].
        let mut saw_players = false;
        for (_, players) in &progress {
            if let Some(players) = players {
                saw_players = true;
                for player in players {
                    assert!(
                        (0.0..=1.0).contains(&player.win),
                        "win {} out of range",
                        player.win
                    );
                    assert!(
                        (0.0..=1.0).contains(&player.tie),
                        "tie {} out of range",
                        player.tie
                    );
                    assert!(
                        (0.0..=1.0).contains(&player.equity),
                        "equity {} out of range",
                        player.equity
                    );
                }
            }
        }
        // (b) the sequence of non-null per-player readings is available at all, for a walk
        // with enough shards — `PROGRESS_MIN_INTERVAL` should have caught at least one tick
        // once every player's own accumulated weight had gone nonzero.
        assert!(
            saw_players,
            "expected at least one progress tick to carry per-player data"
        );

        // (c) the last progress callback's per-player numbers are close to the settle
        // callback's — `thread_count: 1` makes the two directly comparable, since nothing
        // else can merge into `totals` between the final progress tick and settlement.
        let (last_progress, last_players) = progress.last().expect("progress is non-empty");
        assert_eq!(*last_progress, 1.0);
        let last_players = last_players.as_ref().expect(
            "the final progress tick always carries per-player data (see maybe_emit_progress)",
        );
        assert_eq!(last_players.len(), settled_results.len());
        for (progress_player, settled_player) in last_players.iter().zip(settled_results.iter()) {
            assert_close(progress_player.win, settled_player.win);
            assert_close(progress_player.tie, settled_player.tie);
            assert_close(progress_player.equity, settled_player.equity);
        }
    }
}
