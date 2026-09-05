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
use espada::evaluator::{pairwise_lead, EquityEvaluator, EquityEvaluatorError, RunoutPlayer};
use espada::hand_range::{CardPair, HandRange};

use crate::equity_ffi::{
    EspadaEquityCardPairResult, EspadaEquityPlayerResult, EspadaEquityProgressCallback,
    EspadaEquitySettleCallback, EspadaEquityStatus, EQUITY_DISTRIBUTION_BIN_COUNT,
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
    /// carry, alongside the owned buffer its own
    /// [`pairs`](EspadaEquityPlayerResult::pairs)/[`pair_count`](EspadaEquityPlayerResult::pair_count)
    /// point into. only meaningful once the caller has ruled out `totals.total_weight ==
    /// 0.0` — see [`settle`]'s own "no valid runout" check, and [`maybe_emit_progress`]'s own
    /// per-player guard, both of which rule it out before this is ever called.
    ///
    /// returns the buffer alongside the result, rather than leaving it to be recovered from
    /// the raw pointer, because the buffer must outlive the callback call the result is
    /// handed to — the caller keeps both alive together across that call and lets them drop
    /// together once it returns, the same shape [`settle`] and [`emit_progress`] already use
    /// for the outer `Vec<EspadaEquityPlayerResult>` itself.
    ///
    /// `strengths` is this same player's own current-strength map — see
    /// [`current_strengths`] — keyed by the identical live card pairs `self.pairs` accumulates
    /// against, since both are built from the same board-disjoint filtering; a pair present
    /// in one and missing from the other would still be a bug in this module, not a possible
    /// input, but is handled defensively here as a recoverable `Err` rather than a panic:
    /// unlike [`worker_loop`], which every call from [`run_worker`] wraps in
    /// `catch_unwind`, the call this makes from [`settle`] (via `finish_worker`) runs on the
    /// bare, unguarded tail of the last worker thread to finish — a panic there would unwind
    /// past `settle_cb` ever being invoked, leaving the caller's `onSettled` waiting forever
    /// instead of observing [`EspadaEquityStatus::Error`] the way every other internal fault
    /// in this job does.
    fn finalize(
        &self,
        strengths: &HashMap<CardPair, f64>,
    ) -> Result<(EspadaEquityPlayerResult, Vec<EspadaEquityCardPairResult>), String> {
        let mut pairs: Vec<EspadaEquityCardPairResult> = self
            .pairs
            .iter()
            .filter(|(_, totals)| totals.total_weight > 0.0)
            .map(|(pair, totals)| {
                let equity = (totals.share_weight / totals.total_weight).clamp(0.0, 1.0);
                let strength = strengths.get(pair).copied().ok_or_else(|| {
                    format!(
                        "{pair} has positive total weight but no entry in its own player's \
                         current-strength map — current_strengths and this accumulator should \
                         always agree on which pairs are live"
                    )
                })?;

                Ok(EspadaEquityCardPairResult {
                    card_a: card_index(&pair[0]),
                    card_b: card_index(&pair[1]),
                    equity_q16: quantize_q16(equity),
                    strength_q16: quantize_q16(strength),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        // a deterministic order, independent of the hash map's own iteration order, so a
        // test pinning this list against a fixture sees the same order on every run.
        pairs.sort_unstable_by_key(|pair| (pair.card_a, pair.card_b));

        let result = EspadaEquityPlayerResult {
            win: self.totals.win_weight / self.totals.total_weight,
            tie: self.totals.tie_weight / self.totals.total_weight,
            equity: self.totals.share_weight / self.totals.total_weight,
            distribution: distribution_of(&self.pairs),
            pairs: pairs.as_ptr(),
            pair_count: pairs.len() as u32,
        };

        Ok((result, pairs))
    }
}

/// the same card-index encoding `lib/espada-internal/src/evaluator/equity.rs`'s own
/// (private) `card_index` uses — `rank * 4 + suit`, `Rank` ordered `Ace..Deuce` and `Suit`
/// ordered `Spade, Heart, Diamond, Club` — restated here since nothing in `espada` exports
/// it and this wrapper needs the identical mapping for
/// [`EspadaEquityCardPairResult::card_a`]/[`card_b`](EspadaEquityCardPairResult::card_b).
fn card_index(card: &Card) -> u8 {
    u8::from(card.rank()) * 4 + u8::from(card.suit())
}

/// packs a fraction into the 16-bit fixed-point wire representation
/// [`EspadaEquityCardPairResult::equity_q16`]/[`strength_q16`](EspadaEquityCardPairResult::strength_q16)
/// carry — see that type's own doc comment for why. clamps into `[0.0, 1.0]` first: the same
/// floating-point cancellation slack [`distribution_of`]'s own doc comment already documents
/// for the histogram bins can land a value a hair on either side of an exact `0.0`/`1.0`
/// here too.
fn quantize_q16(value: f64) -> u16 {
    (value.clamp(0.0, 1.0) * u16::MAX as f64).round() as u16
}

/// computes every hand-range player's own current strength exactly once — before any worker
/// thread ever shards the walk — since it depends only on `board` and every player's range,
/// never on runout progress (see [`EspadaEquityPlayerResult::pairs`]'s own doc comment).
/// returns one `HashMap<CardPair, f64>` per player, in `players` order, keyed by that
/// player's own live card pairs — a pair sharing a card with `board` is not live and carries
/// no entry, matching how [`EquityEvaluator::build`] filters a range against a board and how
/// `self.pairs` in [`PlayerAccumulator`] only ever accumulates a row for a live pair.
///
/// `board` empty means preflop, where current strength has no board to be ahead on and is
/// left undefined by design (see
/// `docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`):
/// [`pairwise_lead`] itself has no preflop form (it validates the same 3-to-5-card board
/// [`EquityEvaluator::postflop`] does), so every live pair of a preflop job gets the sentinel
/// `0.0` [`EspadaEquityCardPairResult::strength_q16`]'s own doc comment names, rather than a
/// value [`pairwise_lead`] was ever asked to compute.
///
/// postflop, current strength against one opponent is that opponent's own pairwise lead; an
/// opponent with no live combo left against a given pair contributes a neutral `1.0` factor
/// to the product rather than being special-cased out of the loop (`pairwise_lead` reports
/// that case as `Ok(None)`) — both per the product-of-independent-pairwise-leads
/// approximation the decision record above adopts.
fn current_strengths(board: &[Card], players: &[HandRange]) -> Vec<HashMap<CardPair, f64>> {
    if board.is_empty() {
        return players
            .iter()
            .map(|range| range.card_pairs().keys().map(|pair| (*pair, 0.0)).collect())
            .collect();
    }

    players
        .iter()
        .enumerate()
        .map(|(player_index, range)| {
            range
                .card_pairs()
                .keys()
                .filter(|pair| !board.contains(&pair[0]) && !board.contains(&pair[1]))
                .map(|pair| (*pair, current_strength(*pair, board, player_index, players)))
                .collect()
        })
        .collect()
}

/// the product of `subject`'s pairwise lead against every one of `players`' other entries —
/// `players[subject_player]`'s own opponents — on `board`. see [`current_strengths`]'s own
/// doc comment for the preflop case, which never reaches this function at all.
fn current_strength(
    subject: CardPair,
    board: &[Card],
    subject_player: usize,
    players: &[HandRange],
) -> f64 {
    players
        .iter()
        .enumerate()
        .filter(|(opponent_index, _)| *opponent_index != subject_player)
        .fold(1.0_f64, |accumulated, (_, opponent)| {
            // every possible failure `pairwise_lead` can report — an invalid board, an
            // invalid `subject` holding, or an unusable opponent weight — was already ruled
            // out by this same board and these same ranges building a real `EquityEvaluator`
            // (see `start`'s own `evaluator.is_some()` guard around this whole computation)
            // and by `subject` coming from this player's own board-disjoint live-pair
            // filter, so a real `Err` here is a bug in this module, not a possible input.
            let lead = pairwise_lead(subject, board, opponent).unwrap_or_else(|error| {
                unreachable!(
                    "pairwise_lead({subject}, ..) failed ({error}) for a board and ranges that \
                     already built a real EquityEvaluator"
                )
            });

            accumulated * lead.unwrap_or(1.0)
        })
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
    /// each player's own current strength, computed exactly once by [`current_strengths`]
    /// before any worker thread starts, and read unchanged from every progress tick and the
    /// settled result alike — see [`crate::equity_ffi::EspadaEquityPlayerResult::pairs`]'s
    /// own doc comment for why it must never be recomputed per tick.
    strengths: Vec<HashMap<CardPair, f64>>,
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

    // computed here, synchronously, rather than lazily on first read: it depends only on
    // `board`/`players` and never on runout progress, so computing it once up front is what
    // lets every progress tick and the settled result simply copy the same map rather than
    // recomputing it (see `SharedState::strengths`'s own doc comment). a rejected
    // construction has no board/ranges worth walking, so its strength maps are left empty —
    // `settle`'s own rejection path returns before ever reading them.
    let strengths = if evaluator.is_some() {
        current_strengths(&board, &players)
    } else {
        vec![HashMap::new(); player_count]
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
        strengths,
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
/// on each player's own *aggregate* total alone, exactly as before this job also tracked a
/// per-pair breakdown — [`distribution_of`] carries its own, separate "not yet counted"
/// handling for a single card pair still at zero, which does not hold up this gate the way
/// a player's own aggregate does. a free function over a plain slice, separate from
/// [`snapshot_players`] below, so this guard is unit-testable without constructing a whole
/// [`SharedState`].
///
/// unlike [`settle`]'s own call into [`PlayerAccumulator::finalize`], this one runs from
/// inside [`worker_loop`] — every call to which [`run_worker`] wraps in `catch_unwind` — so
/// an `Err` here (the same invariant-violation bug `finalize`'s own doc comment describes,
/// not a possible input) is still safe to turn back into a panic: it unwinds no further than
/// that same `catch_unwind`, which reports it through [`EspadaEquityStatus::Error`] exactly
/// like any other worker-thread fault.
type FinalizedPlayer = (EspadaEquityPlayerResult, Vec<EspadaEquityCardPairResult>);

fn finalize_if_ready(
    accumulators: &[PlayerAccumulator],
    strengths: &[HashMap<CardPair, f64>],
) -> Option<Vec<FinalizedPlayer>> {
    if accumulators
        .iter()
        .any(|player| player.totals.total_weight == 0.0)
    {
        return None;
    }
    Some(
        accumulators
            .iter()
            .zip(strengths)
            .map(|(player, strengths)| {
                player
                    .finalize(strengths)
                    .unwrap_or_else(|message| panic!("{message}"))
            })
            .collect(),
    )
}

/// builds the per-player array a progress callback carries, per [`finalize_if_ready`]'s own
/// rule. locks [`SharedState::totals`] itself, once, rather than the caller holding it across
/// a call.
fn snapshot_players(state: &SharedState) -> Option<Vec<FinalizedPlayer>> {
    let totals = state.totals.lock().unwrap_or_else(|e| e.into_inner());
    finalize_if_ready(&totals, &state.strengths)
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
fn emit_progress(state: &SharedState, progress: f64, players: Option<Vec<FinalizedPlayer>>) {
    match players {
        Some(players) => {
            // each result's own `pairs`/`pair_count` borrow the matching element of `players`
            // itself (the buffer `PlayerAccumulator::finalize` returned alongside it) — both
            // must stay alive, unmoved, for the whole call below, which is why `results` is
            // built here rather than earlier and `players` is not dropped until this match
            // arm ends.
            let results: Vec<EspadaEquityPlayerResult> =
                players.iter().map(|(result, _)| *result).collect();

            (state.progress_cb)(
                progress,
                results.as_ptr(),
                results.len() as u32,
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
    // *aggregate* total, exactly as before this job also tracked a per-pair breakdown.
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

    // `finalized` owns every player's own pair buffer; `results` borrows into it via each
    // element's own `pairs` pointer, so both must stay alive, unmoved, for the whole call
    // below — see `emit_progress`'s own comment for the identical shape.
    //
    // unlike `finalize_if_ready`'s own call into the same method, this one runs on the bare
    // tail of `finish_worker` — never wrapped in `catch_unwind` (only `worker_loop` is, via
    // `run_worker`) — so an `Err` here is reported through `settle_cb` as
    // `EspadaEquityStatus::Error`, the same recoverable path a caught worker panic already
    // takes above, rather than being allowed to unwind an unguarded thread and leave
    // `settle_cb` never called.
    let finalized: Vec<FinalizedPlayer> = match totals
        .iter()
        .zip(&state.strengths)
        .map(|(player, strengths)| player.finalize(strengths))
        .collect::<Result<Vec<FinalizedPlayer>, String>>()
    {
        Ok(finalized) => finalized,
        Err(message) => {
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
    };
    let results: Vec<EspadaEquityPlayerResult> =
        finalized.iter().map(|(result, _)| *result).collect();
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

    /// the wet fixture board
    /// (`docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`)
    /// `lib/espada-internal/src/evaluator/pairwise_lead.rs`'s own tests already pin
    /// individual pairwise leads against — restated here since that crate's test-only
    /// helper is private to its own module.
    fn wet_board() -> Vec<Card> {
        cards("Js Ts 4h")
    }

    /// the wet fixture's opponent range, alongside [`wet_board`] above.
    fn wet_opponent_range() -> HandRange {
        "22+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,ATo+,KJo+"
            .parse()
            .unwrap()
    }

    /// a safe, owned copy of one player's result. `EspadaEquityPlayerResult` itself carries a
    /// `pairs` pointer valid only for the duration of the callback that hands it here, so a
    /// test that wants to inspect the per-card-pair list after the callback returns has to
    /// copy it out — via [`From`], below — while still inside the callback, exactly like
    /// every plain-value field this type already copies by value.
    #[derive(Debug, Clone, PartialEq)]
    struct CapturedPlayerResult {
        win: f64,
        tie: f64,
        equity: f64,
        distribution: [u32; EQUITY_DISTRIBUTION_BIN_COUNT],
        pairs: Vec<EspadaEquityCardPairResult>,
    }

    impl From<&EspadaEquityPlayerResult> for CapturedPlayerResult {
        fn from(result: &EspadaEquityPlayerResult) -> Self {
            let pairs = if result.pairs.is_null() {
                Vec::new()
            } else {
                unsafe { std::slice::from_raw_parts(result.pairs, result.pair_count as usize) }
                    .to_vec()
            };

            CapturedPlayerResult {
                win: result.win,
                tie: result.tie,
                equity: result.equity,
                distribution: result.distribution,
                pairs,
            }
        }
    }

    /// `(status, per-player results, error message)`, exactly what
    /// `record_settlement` copies out of a settle callback's raw pointers before they
    /// stop being valid.
    type Settlement = (
        EspadaEquityStatus,
        Vec<CapturedPlayerResult>,
        Option<String>,
    );

    /// one progress callback invocation: the completion fraction, and each player's own
    /// currently-accumulated result — `None` for a tick with nothing available yet — exactly
    /// what `record_progress` copies out of the callback's raw `players`/`player_count` before
    /// they stop being valid.
    type ProgressTick = (f64, Option<Vec<CapturedPlayerResult>>);

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
            Some(
                unsafe { std::slice::from_raw_parts(players, player_count as usize) }
                    .iter()
                    .map(CapturedPlayerResult::from)
                    .collect(),
            )
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
            unsafe { std::slice::from_raw_parts(players, player_count as usize) }
                .iter()
                .map(CapturedPlayerResult::from)
                .collect()
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
        let strengths = current_strengths(&board, &players);

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
                let (want, _) = reference[index].finalize(&strengths[index]).unwrap();
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
        let strengths = current_strengths(&board, &players);

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
                let (want, _) = reference[index].finalize(&strengths[index]).unwrap();
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
        let strengths = vec![HashMap::new(), HashMap::new()];
        // one player still at exactly zero — the whole tick withholds, not a partial array.
        accumulators[0].totals.total_weight = 4.0;
        accumulators[0].totals.win_weight = 3.0;
        assert!(finalize_if_ready(&accumulators, &strengths).is_none());

        accumulators[1].totals.total_weight = 2.0;
        accumulators[1].totals.tie_weight = 1.0;
        let ready = finalize_if_ready(&accumulators, &strengths)
            .expect("every player has nonzero weight now");
        assert_eq!(ready.len(), 2);
        assert_close(ready[0].0.win, 3.0 / 4.0);
        assert_close(ready[1].0.tie, 1.0 / 2.0);
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

    fn dequantize_q16(value: u16) -> f64 {
        value as f64 / u16::MAX as f64
    }

    fn find_pair(
        pairs: &[EspadaEquityCardPairResult],
        subject: CardPair,
    ) -> &EspadaEquityCardPairResult {
        let (a, b) = (card_index(&subject[0]), card_index(&subject[1]));

        pairs
            .iter()
            .find(|pair| pair.card_a == a && pair.card_b == b)
            .unwrap_or_else(|| panic!("{subject} is not in the pairs list"))
    }

    #[test]
    fn it_computes_current_strength_as_the_lone_opponents_pairwise_lead_heads_up() {
        let board = wet_board();
        let subject = CardPair::from_str("KsQs").unwrap();
        let opponent = wet_opponent_range();
        let players = vec![HandRange::from_iter([subject]), opponent.clone()];

        let strengths = current_strengths(&board, &players);
        let want = pairwise_lead(subject, &board, &opponent).unwrap().unwrap();

        assert_close(*strengths[0].get(&subject).unwrap(), want);
    }

    #[test]
    fn it_multiplies_pairwise_leads_across_every_opponent_for_three_players() {
        let board = wet_board();
        let subject = CardPair::from_str("KsQs").unwrap();
        let opponent_a = wet_opponent_range();
        let opponent_b: HandRange = "22+,A2s+".parse().unwrap();
        let players = vec![
            HandRange::from_iter([subject]),
            opponent_a.clone(),
            opponent_b.clone(),
        ];

        let strengths = current_strengths(&board, &players);
        let lead_a = pairwise_lead(subject, &board, &opponent_a)
            .unwrap()
            .unwrap();
        let lead_b = pairwise_lead(subject, &board, &opponent_b)
            .unwrap()
            .unwrap();

        assert_close(*strengths[0].get(&subject).unwrap(), lead_a * lead_b);
    }

    #[test]
    fn it_treats_an_opponent_with_no_live_combo_against_a_pair_as_a_neutral_factor_of_one() {
        let board = cards("Qs 8d 2h");
        let subject = CardPair::from_str("AsKs").unwrap();
        // every combo in this range shares a card with `subject` (`As` or `Ks`), so it has
        // no live combo left to compare `subject` against — but it still has a real live
        // holding against the board alone, so it is a usable opponent for the *other*
        // player's own current strength, and for `EquityEvaluator::build`'s own
        // per-player "has a live holding" check.
        let no_live_combo_opponent: HandRange = "AsKd,KsQd".parse().unwrap();
        let real_opponent: HandRange = "22+,A2s+,AJo+".parse().unwrap();
        let players = vec![
            HandRange::from_iter([subject]),
            no_live_combo_opponent.clone(),
            real_opponent.clone(),
        ];

        assert_eq!(
            pairwise_lead(subject, &board, &no_live_combo_opponent),
            Ok(None),
            "the fixture is only meaningful if this opponent truly has no live combo"
        );

        let strengths = current_strengths(&board, &players);
        let want = pairwise_lead(subject, &board, &real_opponent)
            .unwrap()
            .unwrap();

        // the neutral opponent contributes a factor of exactly 1, so the product is just
        // the one real opponent's own pairwise lead.
        assert_close(*strengths[0].get(&subject).unwrap(), want);
    }

    #[test]
    fn it_excludes_a_card_pair_that_shares_a_card_with_the_board_from_the_strength_map() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["QsKs,AhKh", "22+,A2s+"]);

        let strengths = current_strengths(&board, &players);
        let dead_pair = CardPair::from_str("QsKs").unwrap();

        assert!(
            !strengths[0].contains_key(&dead_pair),
            "QsKs shares the Qs the board already holds, so it is not a live pair"
        );
        assert!(strengths[0].contains_key(&CardPair::from_str("AhKh").unwrap()));
    }

    #[test]
    fn it_leaves_every_pair_at_the_sentinel_zero_current_strength_preflop() {
        let players = ranges(&["AsKs,QhJh", "22+,A2s+"]);

        let strengths = current_strengths(&[], &players);

        assert_eq!(strengths[0].len(), 2);
        for value in strengths[0].values() {
            assert_eq!(*value, 0.0);
        }
    }

    #[test]
    fn player_accumulator_finalize_excludes_a_card_pair_whose_total_weight_has_not_gone_positive_yet_from_the_pairs_list(
    ) {
        let counted = CardPair::new(Card::from_str("As").unwrap(), Card::from_str("Ks").unwrap());
        let not_yet_accumulated =
            CardPair::new(Card::from_str("2c").unwrap(), Card::from_str("2d").unwrap());
        let mut accumulator = PlayerAccumulator::default();
        accumulator.pairs.insert(
            counted,
            PlayerTotals {
                win_weight: 3.0,
                tie_weight: 0.0,
                share_weight: 3.0,
                total_weight: 4.0,
            },
        );
        accumulator
            .pairs
            .insert(not_yet_accumulated, PlayerTotals::default());
        let strengths = HashMap::from([(counted, 0.5), (not_yet_accumulated, 0.25)]);

        let (_, pairs) = accumulator.finalize(&strengths).unwrap();

        assert_eq!(pairs.len(), 1, "the not-yet-counted pair must be excluded");
        let entry = find_pair(&pairs, counted);
        // the 16-bit fixed-point wire encoding is lossy — see
        // `EspadaEquityCardPairResult`'s own doc comment — so a dequantized reading is
        // compared within that encoding's own worst-case error, `1 / u16::MAX`, rather than
        // `assert_close`'s much tighter floating-point tolerance.
        let quantization_error = 1.0 / u16::MAX as f64;
        assert!((dequantize_q16(entry.equity_q16) - 0.75).abs() <= quantization_error);
        assert!((dequantize_q16(entry.strength_q16) - 0.5).abs() <= quantization_error);
    }

    #[test]
    fn player_accumulator_finalize_returns_an_err_instead_of_panicking_when_a_live_pair_has_no_matching_strength_entry(
    ) {
        // the invariant `finalize`'s own doc comment describes — `strengths` and `self.pairs`
        // should always agree on which pairs are live — deliberately broken here, to pin that
        // a violation surfaces as a recoverable `Err` rather than the `unreachable!()` panic
        // this used to be: unlike `finalize_if_ready`'s own call into this method (reached
        // from inside `worker_loop`, which `run_worker` always wraps in `catch_unwind`),
        // `settle`'s call runs on the bare tail of `finish_worker`, with no such guard.
        let live_pair = CardPair::new(Card::from_str("As").unwrap(), Card::from_str("Ks").unwrap());
        let mut accumulator = PlayerAccumulator::default();
        accumulator.pairs.insert(
            live_pair,
            PlayerTotals {
                win_weight: 3.0,
                tie_weight: 0.0,
                share_weight: 3.0,
                total_weight: 4.0,
            },
        );
        let strengths: HashMap<CardPair, f64> = HashMap::new();

        let error = accumulator
            .finalize(&strengths)
            .expect_err("a live pair missing from `strengths` must be reported, not panicked on");

        assert!(
            error.contains(&live_pair.to_string()),
            "error message should name the offending pair: {error}"
        );
    }

    #[test]
    fn it_reports_current_strength_present_from_the_first_progress_tick_and_constant_across_ticks_for_two_players(
    ) {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+"]);

        let ((status, settled_results, message), progress) = run_with_progress(board, players, 1);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert!(progress.len() > 1, "expected more than one progress tick");

        assert_current_strength_is_present_and_constant(&progress, &settled_results);
    }

    #[test]
    fn it_reports_current_strength_present_from_the_first_progress_tick_and_constant_across_ticks_for_three_players(
    ) {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+", "JJ+,AKs"]);

        let ((status, settled_results, message), progress) = run_with_progress(board, players, 1);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert!(progress.len() > 1, "expected more than one progress tick");

        assert_current_strength_is_present_and_constant(&progress, &settled_results);
    }

    /// asserts, for every progress tick that carries per-player data and for the settled
    /// result together, that (a) every player's own `pairs` list is non-empty as soon as any
    /// data is available at all, and (b) a given player's given card pair's own
    /// `strength_q16` never differs across every observation of it — only `equity_q16` may
    /// move between ticks.
    fn assert_current_strength_is_present_and_constant(
        progress: &[ProgressTick],
        settled_results: &[CapturedPlayerResult],
    ) {
        let mut observed: HashMap<(usize, u8, u8), u16> = HashMap::new();
        let mut saw_players = false;

        let ticks = progress
            .iter()
            .filter_map(|(_, players)| players.as_ref().map(Vec::as_slice))
            .chain(std::iter::once(settled_results));

        for players in ticks {
            saw_players = true;

            for (player_index, player) in players.iter().enumerate() {
                assert!(
                    !player.pairs.is_empty(),
                    "player {player_index}'s own pairs list should not be empty once any data \
                     is available for it at all"
                );

                for pair in &player.pairs {
                    let key = (player_index, pair.card_a, pair.card_b);

                    match observed.get(&key) {
                        Some(&previous) => assert_eq!(
                            previous, pair.strength_q16,
                            "player {player_index}'s pair ({}, {}) current strength moved \
                             across ticks",
                            pair.card_a, pair.card_b
                        ),
                        None => {
                            observed.insert(key, pair.strength_q16);
                        }
                    }
                }
            }
        }

        assert!(
            saw_players,
            "expected at least one tick with per-player data"
        );
    }
}
