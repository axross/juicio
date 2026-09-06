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
//! [`crate::equity_ffi::EspadaEquityPlayerResult::distribution`] carries, and
//! [`blocker_scores_for_settlement`] for how [`settle`] derives each player's own
//! [`crate::equity_ffi::EspadaEquityPlayerResult::blocker_scores`] from the same per-pair
//! accumulators, once every player's own is in hand at once.

use std::collections::HashMap;
use std::ffi::{c_void, CString};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use espada::card::Card;
use espada::evaluator::{pairwise_lead, EquityEvaluator, EquityEvaluatorError, RunoutPlayer};
use espada::hand_range::{CardPair, HandRange};

use crate::equity_ffi::{
    EspadaEquityCardPairResult, EspadaEquityPlayerResult, EspadaEquityProgressCallback,
    EspadaEquitySettleCallback, EspadaEquityStatus, EQUITY_CARD_PAIR_COUNT,
    EQUITY_DISTRIBUTION_BIN_COUNT,
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

    /// builds this player's two fixed-slot buffers —
    /// [`EspadaEquityPlayerResult::equities`]/[`strengths`](EspadaEquityPlayerResult::strengths)
    /// — shared by [`finalize_for_progress`](Self::finalize_for_progress) and
    /// [`finalize_for_settlement`](Self::finalize_for_settlement) alike, since the two buffers
    /// are filled identically on every tick and at settlement — only the card-pair list and
    /// the distribution differ between the two (see [`EspadaEquityPlayerResult::pairs`]'s own
    /// doc comment). every slot starts `NaN`; a live pair (`total_weight > 0.0`) overwrites its
    /// own [`card_pair_number`]-numbered slot in `equities` with its equity so far, and, unless
    /// `board_is_preflop`, its own slot in `strengths` with its current strength — preflop,
    /// every `strengths` slot is left `NaN` regardless of live-ness, since current strength has
    /// no board to be ahead on there (see [`current_strengths`]'s own doc comment).
    ///
    /// `strengths` (the parameter, not the buffer this fills) is this same player's own
    /// current-strength map — see [`current_strengths`] — keyed by the identical live card
    /// pairs `self.pairs` accumulates against, since both are built from the same
    /// board-disjoint filtering; a pair present in one and missing from the other would still
    /// be a bug in this module, not a possible input, but is handled defensively here as a
    /// recoverable `Err` rather than a panic — see [`finalize_for_settlement`](Self::finalize_for_settlement)'s
    /// own doc comment for why that matters on the settlement path in particular.
    fn card_pair_buffers(
        &self,
        board_is_preflop: bool,
        strengths: &HashMap<CardPair, f64>,
    ) -> Result<([f32; EQUITY_CARD_PAIR_COUNT], [f32; EQUITY_CARD_PAIR_COUNT]), String> {
        let mut equities = [f32::NAN; EQUITY_CARD_PAIR_COUNT];
        let mut pair_strengths = [f32::NAN; EQUITY_CARD_PAIR_COUNT];

        for (pair, totals) in self
            .pairs
            .iter()
            .filter(|(_, totals)| totals.total_weight > 0.0)
        {
            let slot = card_pair_number(pair);
            let equity = (totals.share_weight / totals.total_weight).clamp(0.0, 1.0);
            equities[slot] = equity as f32;

            if board_is_preflop {
                continue;
            }

            let strength = strengths.get(pair).copied().ok_or_else(|| {
                format!(
                    "{pair} has positive total weight but no entry in its own player's \
                     current-strength map — current_strengths and this accumulator should \
                     always agree on which pairs are live"
                )
            })?;
            pair_strengths[slot] = strength as f32;
        }

        Ok((equities, pair_strengths))
    }

    /// converts the accumulated totals into a progress tick's own result: the whole-player
    /// aggregate and both fixed-slot buffers (see
    /// [`card_pair_buffers`](Self::card_pair_buffers)), with the card-pair list, the
    /// distribution, and the blocker-score buffer all left empty — a null `pairs`, a
    /// `pair_count` of `0`, a zeroed `distribution`, and a null `blocker_scores` with a
    /// `blocker_score_count` of `0` — since none of the three is read before settlement any
    /// more (see [`EspadaEquityPlayerResult::pairs`]'s own doc comment). a blocker score
    /// specifically needs every *other* player's own accumulated totals in hand at once, which
    /// only [`settle`] has — see [`blocker_scores_for_settlement`]. only meaningful once the
    /// caller has ruled out `totals.total_weight == 0.0` — see [`maybe_emit_progress`]'s own
    /// per-player guard, which rules it out before this is ever called.
    fn finalize_for_progress(
        &self,
        board_is_preflop: bool,
        strengths: &HashMap<CardPair, f64>,
    ) -> Result<EspadaEquityPlayerResult, String> {
        let (equities, pair_strengths) = self.card_pair_buffers(board_is_preflop, strengths)?;

        Ok(EspadaEquityPlayerResult {
            win: self.totals.win_weight / self.totals.total_weight,
            tie: self.totals.tie_weight / self.totals.total_weight,
            equity: self.totals.share_weight / self.totals.total_weight,
            distribution: [0; EQUITY_DISTRIBUTION_BIN_COUNT],
            pairs: std::ptr::null(),
            pair_count: 0,
            equities,
            strengths: pair_strengths,
            blocker_scores: std::ptr::null(),
            blocker_score_count: 0,
        })
    }

    /// converts the accumulated totals into the settled result [`settle`] hands its callback,
    /// alongside the owned buffer its own
    /// [`pairs`](EspadaEquityPlayerResult::pairs)/[`pair_count`](EspadaEquityPlayerResult::pair_count)
    /// point into. only meaningful once the caller has ruled out `totals.total_weight == 0.0`
    /// — see [`settle`]'s own "no valid runout" check.
    ///
    /// returns the buffer alongside the result, rather than leaving it to be recovered from
    /// the raw pointer, because the buffer must outlive the callback call the result is
    /// handed to — the caller keeps both alive together across that call and lets them drop
    /// together once it returns, the same shape [`settle`] already uses for the outer
    /// `Vec<EspadaEquityPlayerResult>` itself.
    ///
    /// a live pair missing from `strengths` (see [`card_pair_buffers`](Self::card_pair_buffers)'s
    /// own doc comment for why that would be a bug, not a possible input) is a recoverable
    /// `Err` rather than a panic here specifically because, unlike [`worker_loop`] (which
    /// every call from [`run_worker`] wraps in `catch_unwind`), the call this makes from
    /// [`settle`] (via `finish_worker`) runs on the bare, unguarded tail of the last worker
    /// thread to finish — a panic there would unwind past `settle_cb` ever being invoked,
    /// leaving the caller's `onSettled` waiting forever instead of observing
    /// [`EspadaEquityStatus::Error`] the way every other internal fault in this job does.
    ///
    /// the returned [`EspadaEquityPlayerResult`]'s own
    /// [`blocker_scores`](EspadaEquityPlayerResult::blocker_scores)/
    /// [`blocker_score_count`](EspadaEquityPlayerResult::blocker_score_count) are left null/`0`
    /// here — this player's own accumulator alone is not enough to score its card pairs, which
    /// need every *other* player's own accumulated totals too. [`settle`] fills them in on its
    /// own copy of this result, once every player's own [`finalize_for_settlement`] has run and
    /// every accumulator is in hand at once — see [`blocker_scores_for_settlement`].
    fn finalize_for_settlement(
        &self,
        board_is_preflop: bool,
        strengths: &HashMap<CardPair, f64>,
    ) -> Result<(EspadaEquityPlayerResult, Vec<EspadaEquityCardPairResult>), String> {
        let (equities, pair_strengths) = self.card_pair_buffers(board_is_preflop, strengths)?;

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
            equities,
            strengths: pair_strengths,
            blocker_scores: std::ptr::null(),
            blocker_score_count: 0,
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

/// numbers `card` the way `docs/specs/equity-breakdown.md`'s Blocker Score section defines a
/// **card pair number**'s own two cards: `rank * 4 + suit`, rank running 0 for a deuce up to
/// 12 for an ace — the opposite direction from [`card_index`] above (`Rank` itself is ordered
/// `Ace..Deuce`, so [`card_index`] numbers a card ace-low the other way), which is why this is
/// implemented fresh here rather than reusing that function or `espada-internal`'s own
/// (rank-descending) `pair_code`. suit runs `Spade, Heart, Diamond, Club`, the same order
/// [`card_index`] already uses, so only the rank half needs inverting.
fn spec_card_number(card: &Card) -> u32 {
    let ace_low_rank = 12 - u8::from(card.rank()) as u32;

    ace_low_rank * 4 + u8::from(card.suit()) as u32
}

/// numbers `pair` the way the same spec section defines a **card pair number**: for the two
/// cards' own [`spec_card_number`]s `a < b`, `a * 51 - a * (a - 1) / 2 + (b - a - 1)` — the
/// combinatorial index of `{a, b}` among the `52 choose 2` = [`EQUITY_CARD_PAIR_COUNT`]
/// two-card combinations, mapping them onto `0..EQUITY_CARD_PAIR_COUNT` one to one (2♠2♥ is
/// `0`, 2♦2♣ is `101`, A♠A♥ is `1320`, A♦A♣ is `1325` — the spec's own worked examples). `a`'s
/// own `a * (a - 1) / 2` term is computed via `saturating_sub` rather than plain subtraction:
/// `a` is `u32` and `a == 0` is a real, valid input (2♠ paired with anything), and
/// `0_u32 - 1` would overflow before the multiplication ever zeroes it back out —
/// `saturating_sub` reaches the same `0` result for that case by a route that never
/// underflows.
fn card_pair_number(pair: &CardPair) -> usize {
    let (x, y) = (spec_card_number(&pair[0]), spec_card_number(&pair[1]));
    let (a, b) = if x < y { (x, y) } else { (y, x) };

    (a * 51 - a * a.saturating_sub(1) / 2 + (b - a - 1)) as usize
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

/// computes every hand-range player's own current strength — depends only on `board` and
/// every player's range, never on runout progress (see [`EspadaEquityPlayerResult::pairs`]'s
/// own doc comment), which is why [`SharedState::strengths`] computes it at most once per
/// job rather than once per tick (see that field's own doc comment for when). returns one
/// `HashMap<CardPair, f64>` per player, in `players` order, keyed by that player's own live
/// card pairs — a pair sharing a card with `board` is not live and carries no entry, matching
/// how [`EquityEvaluator::build`] filters a range against a board and how `self.pairs` in
/// [`PlayerAccumulator`] only ever accumulates a row for a live pair.
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
/// `share_weight / total_weight`, the same ratio [`PlayerAccumulator::card_pair_buffers`]
/// computes for the whole player, applied to one holding at a time — into one of
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

/// one opponent's own totals, recoverable in constant time per scoring card pair rather than
/// by re-walking that opponent's whole card-pair set for every one of the scoring player's own
/// pairs — see [`blocker_scores_for_settlement`]'s own doc comment for the formula this feeds,
/// and `docs/specs/equity-breakdown.md`'s Blocker Score section for what it computes.
struct OpponentCardTotals {
    /// this opponent's own aggregate totals, summed over every one of its live card pairs —
    /// the same [`PlayerTotals`] a player's own settled `equity` is already derived from.
    totals: PlayerTotals,
    /// per physical card ([`card_index`]-keyed, `0..52`), the summed totals of every one of
    /// this opponent's own live card pairs containing that card — built by one linear pass
    /// over `opponent.pairs` in [`opponent_card_totals`], rather than per scoring pair.
    by_card: [PlayerTotals; 52],
}

/// builds `opponent`'s own [`OpponentCardTotals`] in one linear pass over its live card pairs.
fn opponent_card_totals(opponent: &PlayerAccumulator) -> OpponentCardTotals {
    let mut by_card = [PlayerTotals::default(); 52];

    for (pair, totals) in opponent.pairs.iter().filter(|(_, t)| t.total_weight > 0.0) {
        by_card[card_index(&pair[0]) as usize].merge(totals);
        by_card[card_index(&pair[1]) as usize].merge(totals);
    }

    OpponentCardTotals {
        totals: opponent.totals,
        by_card,
    }
}

/// the skip-self opponent ordinal `docs/specs/equity-breakdown.md`'s Blocker Score section
/// defines for [`EspadaEquityPlayerResult::blocker_scores`]: `opponent_index` itself when the
/// opponent sits before the scoring player's own seat, one less when it sits past it — so a
/// three-seat table's seat 1 reads seat 0 at ordinal 0 and seat 2 at ordinal 1.
fn opponent_ordinal(player_index: usize, opponent_index: usize) -> usize {
    if opponent_index < player_index {
        opponent_index
    } else {
        opponent_index - 1
    }
}

/// `pair`'s own blocker score against `opponent`, given `opponent`'s own [`OpponentCardTotals`]
/// — `docs/specs/equity-breakdown.md`'s Blocker Score section: the signed shift `pair` causes
/// in `opponent`'s own mean equity by removing `opponent`'s live holdings that share a card
/// with it. computed as `baseline - restricted` (not the reverse — see that section's own
/// worked `AA`/`KK` signs), where `baseline` is `opponent`'s own aggregate equity and
/// `restricted` is that same ratio recomputed with every one of `opponent`'s holdings `pair`
/// blocks removed from both the numerator and the denominator. those blocked totals are
/// `by_card[a] + by_card[b] - containing(a, b)`: the two per-card sums both count
/// `opponent`'s own live `{a, b}` pair (if any), so it is subtracted back out once.
///
/// `Err` only when the resulting `restricted` denominator is not strictly positive.
/// `docs/specs/equity-breakdown.md`'s own reasoning holds over exact real-number weights: if
/// `pair` blocked every one of `opponent`'s live holdings, no deal of the deck could ever have
/// produced `pair` against `opponent`, so `pair` would not be live in the first place. that
/// argument alone says nothing about the `f64` arithmetic this function actually runs, since
/// `restricted_weight` is reached by subtracting sums of several non-negative `PlayerTotals`
/// accumulations from `opponent_cards.totals.total_weight` — every term involved bounded in
/// magnitude by that same `total_weight`, so the cancellation error the subtraction can
/// introduce is bounded in absolute terms by a small multiple of
/// `total_weight * f64::EPSILON`, vanishing relative to `total_weight` itself. for this guard
/// to trip, then, the *true* restricted weight already has to be vanishingly small relative to
/// `opponent`'s own total — a genuinely degenerate accumulation, not a healthy value perturbed
/// by floating-point noise — and refusing to score that case with a recoverable `Err` is this
/// guard's intended job, not a false positive. reported the same recoverable way
/// [`PlayerAccumulator::card_pair_buffers`]'s own invariant violation is, rather than panicking
/// on the bare, unguarded tail of [`finish_worker`] [`settle`] runs on (see
/// [`PlayerAccumulator::finalize_for_settlement`]'s own doc comment for why that matters here
/// specifically).
fn blocker_score(
    pair: &CardPair,
    opponent: &PlayerAccumulator,
    opponent_cards: &OpponentCardTotals,
) -> Result<f64, String> {
    let a = card_index(&pair[0]) as usize;
    let b = card_index(&pair[1]) as usize;
    let containing = opponent.pairs.get(pair).copied().unwrap_or_default();

    let blocked_share = opponent_cards.by_card[a].share_weight
        + opponent_cards.by_card[b].share_weight
        - containing.share_weight;
    let blocked_weight = opponent_cards.by_card[a].total_weight
        + opponent_cards.by_card[b].total_weight
        - containing.total_weight;

    let restricted_weight = opponent_cards.totals.total_weight - blocked_weight;
    if restricted_weight <= 0.0 {
        return Err(format!(
            "{pair} blocked every one of its opponent's live holdings (restricted weight \
             {restricted_weight}) — a live card pair should never be able to do this; see \
             docs/specs/equity-breakdown.md's Blocker Score section"
        ));
    }

    let baseline = opponent_cards.totals.share_weight / opponent_cards.totals.total_weight;
    let restricted = (opponent_cards.totals.share_weight - blocked_share) / restricted_weight;

    Ok(baseline - restricted)
}

/// builds every player's own [`EspadaEquityPlayerResult::blocker_scores`] buffer — one
/// `Vec<f64>` of `EQUITY_CARD_PAIR_COUNT * (totals.len() - 1)` slots per player, `NaN` for
/// every card pair that is not live and this player's own [`blocker_score`] against each
/// opponent, at [`opponent_ordinal`], for every one that is. called once per settlement, from
/// [`settle`], rather than from each player's own [`PlayerAccumulator::finalize_for_settlement`]
/// — a player's own score needs every *other* player's own accumulator already merged in, and
/// `settle` is the one place all of them are in hand at once.
///
/// [`opponent_card_totals`] is computed once per opponent up front, so scoring every one of a
/// player's own live card pairs against every opponent costs constant work per pair after
/// that: settlement gains a pass proportional to card pairs times players, never to card pairs
/// squared — see `docs/specs/equity-breakdown.md`'s Blocker Score section and this project's
/// own settlement-payload decision record.
fn blocker_scores_for_settlement(totals: &[PlayerAccumulator]) -> Result<Vec<Vec<f64>>, String> {
    let player_count = totals.len();
    let opponent_cards: Vec<OpponentCardTotals> = totals.iter().map(opponent_card_totals).collect();

    totals
        .iter()
        .enumerate()
        .map(|(player_index, player)| {
            let mut scores = vec![f64::NAN; EQUITY_CARD_PAIR_COUNT * (player_count - 1)];

            for (pair, pair_totals) in &player.pairs {
                if pair_totals.total_weight <= 0.0 {
                    continue;
                }
                let slot_base = card_pair_number(pair) * (player_count - 1);

                for (opponent_index, opponent) in totals.iter().enumerate() {
                    if opponent_index == player_index {
                        continue;
                    }
                    let ordinal = opponent_ordinal(player_index, opponent_index);
                    scores[slot_base + ordinal] =
                        blocker_score(pair, opponent, &opponent_cards[opponent_index])?;
                }
            }

            Ok(scores)
        })
        .collect()
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
    /// `start`'s own `board`/`players`, kept around only so [`strengths`](SharedState::strengths)
    /// can compute [`current_strengths`] lazily, later, from a worker thread — `EquityEvaluator`
    /// has no accessor of its own for the board or ranges it was built from.
    board: Vec<Card>,
    players: Vec<HandRange>,
    /// each player's own current strength, keyed by that player's own live card pairs (see
    /// [`current_strengths`]). left empty by `start`, then computed at most once — by
    /// whichever worker thread's call to [`OnceLock::get_or_init`] reaches it first, a
    /// progress tick's own [`snapshot_players`] or [`settle`]'s own finalize — and cached
    /// from then on: every read after that first one, and every read within one tick, sees
    /// the identical map. see [`crate::equity_ffi::EspadaEquityPlayerResult::pairs`]'s own
    /// doc comment for why it must never be recomputed per tick.
    strengths: OnceLock<Vec<HashMap<CardPair, f64>>>,
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
/// `board` is empty, postflop otherwise), then spawns
/// `clamp_thread_count(thread_count, <host cores>)` Rust-owned worker threads that shard the
/// walk via [`EquityEvaluator::partition`]. this function itself does zero current-strength
/// work and returns immediately no matter how wide `players`' own ranges are: every
/// hand-range player's own current strength ([`current_strengths`]) is left uncomputed here
/// and instead populated lazily, on first read, by whichever worker thread reaches
/// [`SharedState::strengths`]'s own [`OnceLock::get_or_init`] first — a progress tick's own
/// [`snapshot_players`] or [`settle`]'s own finalize — running alongside the ongoing walk on
/// every other worker thread rather than blocking this function's own caller (see that
/// field's own doc comment). beyond that, this — unlike [`crate::job::start`] — never
/// returns null: a construction failure ([`EquityEvaluatorError::UnsupportedPlayerCount`] or
/// any other) still gets a real job handle, settled through the callback instead (see this
/// module's own doc comment and [`crate::equity_ffi::espada_engine_equity_start`]'s "why not
/// synchronously" note).
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
        board,
        players,
        strengths: OnceLock::new(),
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

/// one player's settled result, alongside the owned buffer its own `pairs`/`pair_count`
/// point into — see [`PlayerAccumulator::finalize_for_settlement`]'s own doc comment for why
/// the two travel together. [`snapshot_players`]'s own progress-tick path needs no such pair,
/// since [`PlayerAccumulator::finalize_for_progress`] hands back a self-contained
/// [`EspadaEquityPlayerResult`] with a null `pairs` — nothing external to keep alive.
type SettledPlayer = (EspadaEquityPlayerResult, Vec<EspadaEquityCardPairResult>);

/// the all-or-nothing rule [`EspadaEquityProgressCallback`]'s own doc comment states: `Some`
/// once every player's own accumulated aggregate `total_weight` is nonzero, `None`
/// otherwise — so an early tick where even one player has not yet accumulated a single
/// weighted runout never hands back a partial array or a divide-by-zero `NaN`. this gate is
/// on each player's own *aggregate* total alone — [`distribution_of`] carries its own,
/// separate "not yet counted" handling for a single card pair still at zero, which does not
/// hold up this gate the way a player's own aggregate does. a free function over a plain
/// slice, separate from [`snapshot_players`] below, so this guard is unit-testable without
/// constructing a whole [`SharedState`].
///
/// unlike [`settle`]'s own call into [`PlayerAccumulator::finalize_for_settlement`], this one
/// runs from inside [`worker_loop`] — every call to which [`run_worker`] wraps in
/// `catch_unwind` — so an `Err` here (the same invariant-violation bug
/// [`PlayerAccumulator::card_pair_buffers`]'s own doc comment describes, not a possible input)
/// is still safe to turn back into a panic: it unwinds no further than that same
/// `catch_unwind`, which reports it through [`EspadaEquityStatus::Error`] exactly like any
/// other worker-thread fault.
fn finalize_if_ready(
    accumulators: &[PlayerAccumulator],
    board_is_preflop: bool,
    strengths: &[HashMap<CardPair, f64>],
) -> Option<Vec<EspadaEquityPlayerResult>> {
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
                    .finalize_for_progress(board_is_preflop, strengths)
                    .unwrap_or_else(|message| panic!("{message}"))
            })
            .collect(),
    )
}

/// builds the per-player array a progress callback carries, per [`finalize_if_ready`]'s own
/// rule. computes [`SharedState::strengths`]'s first-tick value, if this is the tick that
/// reaches it, *before* taking [`SharedState::totals`]'s own lock — deliberately, so every
/// other worker thread's own [`worker_loop`] (which needs that same lock to merge its shard
/// results in) keeps progressing while this thread computes it, rather than queuing up behind
/// a lock held for the whole computation. every read after the first sees the cached value
/// from [`OnceLock::get_or_init`] immediately either way, so this ordering costs nothing once
/// the first tick has passed.
fn snapshot_players(state: &SharedState) -> Option<Vec<EspadaEquityPlayerResult>> {
    let strengths = state
        .strengths
        .get_or_init(|| current_strengths(&state.board, &state.players));
    let totals = state.totals.lock().unwrap_or_else(|e| e.into_inner());
    finalize_if_ready(&totals, state.board.is_empty(), strengths)
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
/// `settle_cb`'s own `players` argument. unlike `settle`'s own `SettledPlayer`, a progress
/// tick's own [`EspadaEquityPlayerResult`] carries a null `pairs` (see
/// [`PlayerAccumulator::finalize_for_progress`]), so there is no separate owned buffer to keep
/// alive alongside it here — `results` itself is the only thing this call needs kept alive.
fn emit_progress(
    state: &SharedState,
    progress: f64,
    players: Option<Vec<EspadaEquityPlayerResult>>,
) {
    match players {
        Some(results) => {
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

    // `finalized` owns every player's own pair buffer; `results` borrows into it via each
    // element's own `pairs` pointer, so both must stay alive, unmoved, for the whole call
    // below.
    //
    // unlike `finalize_if_ready`'s own call into `finalize_for_progress`, this call into
    // `finalize_for_settlement` runs on the bare tail of `finish_worker` — never wrapped in
    // `catch_unwind` (only `worker_loop` is, via `run_worker`) — so an `Err` here is reported
    // through `settle_cb` as `EspadaEquityStatus::Error`, the same recoverable path a caught
    // worker panic already takes above, rather than being allowed to unwind an unguarded
    // thread and leave `settle_cb` never called.
    let strengths = state
        .strengths
        .get_or_init(|| current_strengths(&state.board, &state.players));
    let board_is_preflop = state.board.is_empty();
    let finalized: Vec<SettledPlayer> = match totals
        .iter()
        .zip(strengths)
        .map(|(player, strengths)| player.finalize_for_settlement(board_is_preflop, strengths))
        .collect::<Result<Vec<SettledPlayer>, String>>()
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
    // every player's own accumulator is in hand at once here — the one place a blocker score
    // can be computed at all, since scoring a player's own card pair needs every *other*
    // player's own totals (see `blocker_scores_for_settlement`'s own doc comment). an `Err`
    // here (only reachable if a live card pair's own restricted denominator were not strictly
    // positive — see `blocker_score`'s own doc comment for why that should never happen) is
    // reported through `settle_cb` the same recoverable way the `finalize_for_settlement`
    // failure above already is, rather than being allowed to unwind this same unguarded thread.
    let blocker_scores = match blocker_scores_for_settlement(&totals) {
        Ok(blocker_scores) => blocker_scores,
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

    // `results` is a fresh copy of each `finalized` result (itself still alive, keeping every
    // player's own `pairs` buffer alive) so each copy's own `blocker_scores`/
    // `blocker_score_count` can point into `blocker_scores` above without mutating `finalized`
    // — both `finalized` and `blocker_scores` must stay alive, unmoved, for the whole call
    // below, exactly like `finalized`'s own doc comment already states for the `pairs` buffer.
    let mut results: Vec<EspadaEquityPlayerResult> =
        finalized.iter().map(|(result, _)| *result).collect();
    for (result, scores) in results.iter_mut().zip(&blocker_scores) {
        result.blocker_scores = scores.as_ptr();
        result.blocker_score_count = scores.len() as u32;
    }

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
        equities: [f32; EQUITY_CARD_PAIR_COUNT],
        strengths: [f32; EQUITY_CARD_PAIR_COUNT],
        blocker_scores: Vec<f64>,
    }

    impl From<&EspadaEquityPlayerResult> for CapturedPlayerResult {
        fn from(result: &EspadaEquityPlayerResult) -> Self {
            let pairs = if result.pairs.is_null() {
                Vec::new()
            } else {
                unsafe { std::slice::from_raw_parts(result.pairs, result.pair_count as usize) }
                    .to_vec()
            };
            let blocker_scores = if result.blocker_scores.is_null() {
                Vec::new()
            } else {
                unsafe {
                    std::slice::from_raw_parts(
                        result.blocker_scores,
                        result.blocker_score_count as usize,
                    )
                }
                .to_vec()
            };

            CapturedPlayerResult {
                win: result.win,
                tie: result.tie,
                equity: result.equity,
                distribution: result.distribution,
                pairs,
                equities: result.equities,
                strengths: result.strengths,
                blocker_scores,
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
        run_with_timeout(board, players, thread_count, Duration::from_secs(30))
    }

    /// same as `run` above, but for a caller whose own board walk needs longer than
    /// `run`'s 30s default to settle even on a slow, contended host.
    fn run_with_timeout(
        board: Vec<Card>,
        players: Vec<HandRange>,
        thread_count: u32,
        timeout: Duration,
    ) -> Settlement {
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

        let result = outcome.wait_for_settlement(timeout);
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
    /// only its aggregate `PlayerTotals`) so `.finalize_for_settlement()` is available on it
    /// exactly like on the sharded job's own accumulators — the tests below read only
    /// `.win`/`.tie`/`.equity` off it, but nothing about this reference's own accumulation
    /// differs from the sharded job's, per-pair accounting included.
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
                let (want, _) = reference[index]
                    .finalize_for_settlement(board.is_empty(), &strengths[index])
                    .unwrap();
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
                let (want, _) = reference[index]
                    .finalize_for_settlement(board.is_empty(), &strengths[index])
                    .unwrap();
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
        assert!(finalize_if_ready(&accumulators, false, &strengths).is_none());

        accumulators[1].totals.total_weight = 2.0;
        accumulators[1].totals.tie_weight = 1.0;
        let ready = finalize_if_ready(&accumulators, false, &strengths)
            .expect("every player has nonzero weight now");
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

        let (_, pairs) = accumulator
            .finalize_for_settlement(false, &strengths)
            .unwrap();

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
        // the invariant `card_pair_buffers`'s own doc comment describes — `strengths` and
        // `self.pairs` should always agree on which pairs are live — deliberately broken
        // here, to pin that a violation surfaces as a recoverable `Err` rather than a panic:
        // unlike `finalize_if_ready`'s own call into `finalize_for_progress` (reached from
        // inside `worker_loop`, which `run_worker` always wraps in `catch_unwind`), `settle`'s
        // call into `finalize_for_settlement` runs on the bare tail of `finish_worker`, with
        // no such guard.
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
            .finalize_for_settlement(false, &strengths)
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
    /// result together, that (a) every player's own `equities` buffer holds at least one live
    /// (non-`NaN`) slot as soon as any data is available at all, and (b) a given player's
    /// given card pair number's own `strengths` slot, once live, never differs across every
    /// observation of it — only its `equities` slot may move between ticks.
    fn assert_current_strength_is_present_and_constant(
        progress: &[ProgressTick],
        settled_results: &[CapturedPlayerResult],
    ) {
        let mut observed: HashMap<(usize, usize), f32> = HashMap::new();
        let mut saw_players = false;

        let ticks = progress
            .iter()
            .filter_map(|(_, players)| players.as_ref().map(Vec::as_slice))
            .chain(std::iter::once(settled_results));

        for players in ticks {
            saw_players = true;

            for (player_index, player) in players.iter().enumerate() {
                assert!(
                    player.equities.iter().any(|value| !value.is_nan()),
                    "player {player_index}'s own equities buffer should hold at least one \
                     live slot once any data is available for it at all"
                );

                for (slot, &strength) in player.strengths.iter().enumerate() {
                    if strength.is_nan() {
                        continue;
                    }

                    let key = (player_index, slot);

                    match observed.get(&key) {
                        Some(&previous) => assert_eq!(
                            previous, strength,
                            "player {player_index}'s card pair number {slot} current strength \
                             moved across ticks"
                        ),
                        None => {
                            observed.insert(key, strength);
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

    fn pair(a: &str, b: &str) -> CardPair {
        CardPair::new(Card::from_str(a).unwrap(), Card::from_str(b).unwrap())
    }

    #[test]
    fn card_pair_number_matches_the_specs_worked_examples() {
        // `docs/specs/equity-breakdown.md`'s Blocker Score section's own worked examples,
        // covering the first pair, a boundary pair (the last pair whose smaller card is a
        // deuce), and the last two pairs overall.
        assert_eq!(card_pair_number(&pair("2s", "2h")), 0);
        assert_eq!(card_pair_number(&pair("2d", "2c")), 101);
        assert_eq!(card_pair_number(&pair("As", "Ah")), 1320);
        assert_eq!(card_pair_number(&pair("Ad", "Ac")), 1325);
    }

    #[test]
    fn card_pair_number_is_independent_of_argument_order() {
        // the spec's own `a < b` ordering is by card pair *number*, not by whichever card a
        // `CardPair` happens to store first — `spec_card_number`'s own rank direction runs
        // opposite `Card`'s derived `Ord`, so this is worth pinning explicitly rather than
        // trusting it holds by construction.
        assert_eq!(
            card_pair_number(&pair("Ks", "2h")),
            card_pair_number(&pair("2h", "Ks"))
        );
    }

    #[test]
    fn card_pair_buffers_leave_every_strength_slot_nan_preflop_while_filling_equity_normally() {
        let live_pair = pair("As", "Ks");
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
        // preflop never even consults `strengths` — an empty map here would return an `Err`
        // if it did, since `live_pair` has no entry in it.
        let strengths: HashMap<CardPair, f64> = HashMap::new();

        let (equities, pair_strengths) = accumulator
            .card_pair_buffers(true, &strengths)
            .expect("preflop must not need a strengths entry for the live pair");

        assert!(
            pair_strengths.iter().all(|value| value.is_nan()),
            "preflop, every strength slot must be NaN, including the live pair's own"
        );

        let slot = card_pair_number(&live_pair);
        assert!(
            (equities[slot] - 0.75).abs() < 1e-6,
            "the live pair's own equity slot should still be filled normally preflop"
        );
        for (index, &value) in equities.iter().enumerate() {
            if index != slot {
                assert!(
                    value.is_nan(),
                    "slot {index} is not live, so its equity must be NaN"
                );
            }
        }
    }

    /// asserts, for every one of `ranges`' own players against `board`, that (a) a slot in
    /// `results`' own `equities`/`strengths` buffers is `NaN` in both if and only if it is not
    /// one of that player's structurally live (board-disjoint) card pairs, and (b) a live
    /// slot's own buffer values agree, within the settled list's own `u16` quantization error,
    /// with that same pair's entry in the settled `pairs` list — the two ways this result now
    /// carries the identical per-pair accounting.
    fn assert_buffers_match_settled_list_for_live_pairs(
        board: &[Card],
        ranges: &[HandRange],
        results: &[CapturedPlayerResult],
    ) {
        let quantization_error = 1.0 / u16::MAX as f32;

        for (range, result) in ranges.iter().zip(results) {
            let live: Vec<CardPair> = range
                .card_pairs()
                .keys()
                .filter(|pair| !board.contains(&pair[0]) && !board.contains(&pair[1]))
                .copied()
                .collect();
            let live_slots: std::collections::HashSet<usize> =
                live.iter().map(card_pair_number).collect();

            assert_eq!(
                result.pairs.len(),
                live.len(),
                "fixture assumption: every structurally live pair should have accumulated \
                 positive weight by settlement"
            );

            for slot in 0..EQUITY_CARD_PAIR_COUNT {
                if live_slots.contains(&slot) {
                    continue;
                }
                assert!(
                    result.equities[slot].is_nan(),
                    "slot {slot} is not one of this player's live pairs, so its equity should \
                     be NaN"
                );
                assert!(
                    result.strengths[slot].is_nan(),
                    "slot {slot} is not one of this player's live pairs, so its strength \
                     should be NaN"
                );
            }

            for live_pair in &live {
                let slot = card_pair_number(live_pair);
                let (card_a, card_b) = (card_index(&live_pair[0]), card_index(&live_pair[1]));
                let entry = result
                    .pairs
                    .iter()
                    .find(|entry| entry.card_a == card_a && entry.card_b == card_b)
                    .unwrap_or_else(|| panic!("{live_pair} missing from the settled pairs list"));

                assert!(
                    (result.equities[slot] - dequantize_q16(entry.equity_q16) as f32).abs()
                        <= quantization_error,
                    "{live_pair}'s buffer equity should match the settled list within \
                     quantization error"
                );
                assert!(
                    (result.strengths[slot] - dequantize_q16(entry.strength_q16) as f32).abs()
                        <= quantization_error,
                    "{live_pair}'s buffer strength should match the settled list within \
                     quantization error"
                );
            }
        }
    }

    #[test]
    fn card_pair_buffers_hold_correct_values_and_match_the_settled_list_two_players() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+"]);

        let (status, results, message) = run(board.clone(), players.clone(), 0);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(results.len(), 2);

        assert_buffers_match_settled_list_for_live_pairs(&board, &players, &results);
    }

    #[test]
    fn card_pair_buffers_hold_correct_values_and_match_the_settled_list_three_players() {
        let board = cards("Qs 8d 2h 7c");
        let players = ranges(&["AhKh,7d7s", "AdKd,7c7h", "AcKc,5c4c"]);

        let (status, results, message) = run(board.clone(), players.clone(), 0);

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(results.len(), 3);

        assert_buffers_match_settled_list_for_live_pairs(&board, &players, &results);
    }

    /// times [`PlayerAccumulator::card_pair_buffers`] against issue #261's own non-functional
    /// requirement — filling both buffers costs at most 0.1 ms per player per tick — using the
    /// same worst-case-rows methodology
    /// `docs/decisions/2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md`
    /// measured the fixed-slot record's own fill cost with: every one of the 1,326 possible
    /// card pairs live at once, so every slot in both buffers is filled on every call. the
    /// reported number is the mean per-call time across `ITERATIONS` calls, and is meaningful
    /// only from a release build (`cargo test --release`) — a debug build's per-call time is
    /// far above the release-build precedent this budget is drawn from, which is why the
    /// assertion below leaves generous margin rather than checking against the 0.1 ms budget
    /// itself.
    #[test]
    fn card_pair_buffers_fills_worst_case_buffers_well_under_budget() {
        use espada::card::{RankRange, SuitRange};

        let deck: Vec<Card> = RankRange::all()
            .into_iter()
            .flat_map(|rank| {
                SuitRange::all()
                    .into_iter()
                    .map(move |suit| Card::new(rank, suit))
            })
            .collect();

        let mut accumulator = PlayerAccumulator::default();
        let mut strengths: HashMap<CardPair, f64> = HashMap::new();
        for i in 0..deck.len() {
            for j in (i + 1)..deck.len() {
                let pair = CardPair::new(deck[i], deck[j]);
                accumulator.pairs.insert(
                    pair,
                    PlayerTotals {
                        win_weight: 1.0,
                        tie_weight: 0.0,
                        share_weight: 1.0,
                        total_weight: 1.0,
                    },
                );
                strengths.insert(pair, 0.5);
            }
        }
        assert_eq!(
            accumulator.pairs.len(),
            EQUITY_CARD_PAIR_COUNT,
            "fixture assumption: every one of the 52-choose-2 card pairs should be live"
        );

        const ITERATIONS: u32 = 1_000;
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            accumulator
                .card_pair_buffers(false, &strengths)
                .expect("every live pair has a matching strengths entry by construction");
        }
        let per_call = start.elapsed() / ITERATIONS;

        eprintln!(
            "card_pair_buffers worst-case fill: {per_call:?} per call, mean over {ITERATIONS} \
             iterations"
        );

        // 5ms is far above the 0.03-0.07ms release-build precedent this budget is drawn from
        // (see this test's own doc comment) even for the heavier f64 version of this same fill
        // loop, so this stays a regression guard rather than a tight budget check that would
        // flake under debug-build or CI noise.
        assert!(
            per_call < Duration::from_millis(5),
            "worst-case card_pair_buffers fill took {per_call:?} per call, well above the \
             regression-guard threshold"
        );
    }

    /// every card in a 52-card deck not among `exclude`, as a `HandRange` holding every
    /// possible pair of them — a synthetic, unrealistically wide range this module's own
    /// worker walk never partitions (this test never touches `SharedState::evaluator`), used
    /// only to make [`current_strengths`]' own per-pair, per-opponent cost large enough to
    /// observe in [`strengths_computation_does_not_block_other_workers_totals_merges`] below.
    fn every_pair_of_the_remaining_deck(exclude: &[Card]) -> HandRange {
        use espada::card::{RankRange, SuitRange};

        let deck: Vec<Card> = RankRange::all()
            .into_iter()
            .flat_map(|rank| {
                SuitRange::all()
                    .into_iter()
                    .map(move |suit| Card::new(rank, suit))
            })
            .filter(|card| !exclude.contains(card))
            .collect();

        let mut combos = Vec::with_capacity(deck.len() * deck.len() / 2);
        for i in 0..deck.len() {
            for j in (i + 1)..deck.len() {
                combos.push(CardPair::new(deck[i], deck[j]));
            }
        }

        HandRange::from_iter(combos)
    }

    /// pins the lock-ordering fix in [`snapshot_players`]: the shared totals lock every
    /// worker's own [`worker_loop`] needs to merge a shard's results in must not be held for
    /// the whole of the first tick's (potentially expensive) current-strength computation.
    ///
    /// rather than asserting on wall-clock timing (inherently flaky across machines), this
    /// spins a second thread that repeatedly, tightly acquires and releases that same lock —
    /// simulating `worker_loop`'s own brief per-shard merge — for as long as the first thread
    /// is inside `snapshot_players` computing (deliberately expensive, via
    /// [`every_pair_of_the_remaining_deck`]) [`SharedState::strengths`]' first value. if the
    /// lock were held for that whole computation (the bug this fix removes), the spinning
    /// thread would complete at most a handful of merges before `snapshot_players` returns;
    /// with the fix, it completes many, regardless of how fast or slow the host machine is.
    #[test]
    fn strengths_computation_does_not_block_other_workers_totals_merges() {
        let board = cards("Qs 8d 2h");
        let players = vec![
            every_pair_of_the_remaining_deck(&board),
            every_pair_of_the_remaining_deck(&board),
        ];
        let player_count = players.len();

        let state = Arc::new(SharedState {
            evaluator: None,
            rejection: None,
            player_count,
            next_shard: AtomicU32::new(0),
            completed_shards: AtomicU32::new(0),
            cancelled: AtomicBool::new(false),
            settled: AtomicBool::new(false),
            active_workers: AtomicUsize::new(1),
            fault_message: Mutex::new(None),
            totals: Mutex::new(vec![PlayerAccumulator::default(); player_count]),
            board,
            players,
            strengths: OnceLock::new(),
            last_progress_nanos: AtomicU64::new(0),
            start_instant: Instant::now(),
            progress_cb: ignore_progress,
            settle_cb: record_settlement,
            user_data: SendPtr(std::ptr::null_mut()),
        });

        let strength_thread_state = Arc::clone(&state);
        let strength_thread = std::thread::spawn(move || {
            snapshot_players(&strength_thread_state);
        });

        let mut merges = 0u64;
        while !strength_thread.is_finished() {
            if let Ok(mut totals) = state.totals.try_lock() {
                // the same brief section `worker_loop` takes this lock for, merging one
                // shard's own (here, empty) delta into the shared totals.
                let delta = PlayerAccumulator::default();
                for slot in totals.iter_mut() {
                    slot.merge(&delta);
                }
                merges += 1;
            }
        }
        strength_thread.join().unwrap();

        assert!(
            merges > 100,
            "expected the totals lock to stay free for many merges while the first tick's \
             current-strength computation ran — only {merges} went through, which would mean \
             `snapshot_players` is once again holding that lock for the whole computation"
        );
    }

    fn pair_from(a: &str, b: &str) -> CardPair {
        CardPair::new(Card::from_str(a).unwrap(), Card::from_str(b).unwrap())
    }

    /// a `PlayerAccumulator` holding exactly one live card pair, its own aggregate totals
    /// equal to that one pair's — the simplest fixture [`blocker_score`] and
    /// [`blocker_scores_for_settlement`] can be exercised against without running a real job.
    fn accumulator_with_one_live_pair(pair: CardPair, totals: PlayerTotals) -> PlayerAccumulator {
        let mut accumulator = PlayerAccumulator::default();
        accumulator.pairs.insert(pair, totals);
        accumulator.totals = totals;
        accumulator
    }

    /// three players, each holding one live card pair disjoint from the other two, all three
    /// pairs equally weighted (`share`/`total` = 0.5) — the fixture
    /// [`blocker_scores_for_settlement`]'s own index-arithmetic, liveness, and single-live-row
    /// tests below share.
    fn three_seat_single_pair_fixture() -> (Vec<PlayerAccumulator>, CardPair, CardPair, CardPair) {
        let pair0 = pair_from("As", "Ks");
        let pair1 = pair_from("2c", "3d");
        let pair2 = pair_from("4h", "5h");
        let totals = PlayerTotals {
            win_weight: 5.0,
            tie_weight: 0.0,
            share_weight: 5.0,
            total_weight: 10.0,
        };
        let players = vec![
            accumulator_with_one_live_pair(pair0, totals),
            accumulator_with_one_live_pair(pair1, totals),
            accumulator_with_one_live_pair(pair2, totals),
        ];

        (players, pair0, pair1, pair2)
    }

    #[test]
    fn opponent_ordinal_skips_the_scoring_players_own_seat_at_a_three_seat_table() {
        // seat 1 reads seat 0 at ordinal 0 and seat 2 at ordinal 1 — the exact case
        // `docs/specs/equity-breakdown.md`'s Blocker Score section states.
        assert_eq!(opponent_ordinal(1, 0), 0);
        assert_eq!(opponent_ordinal(1, 2), 1);
        // a seat before the scoring player's own keeps its own index; every later seat
        // shifts down by one to make room for the skipped self column.
        assert_eq!(opponent_ordinal(2, 0), 0);
        assert_eq!(opponent_ordinal(2, 1), 1);
        assert_eq!(opponent_ordinal(0, 1), 0);
        assert_eq!(opponent_ordinal(0, 2), 1);
    }

    #[test]
    fn blocker_scores_for_settlement_sizes_each_players_buffer_by_the_table_minus_one() {
        let totals = PlayerTotals {
            win_weight: 5.0,
            tie_weight: 0.0,
            share_weight: 5.0,
            total_weight: 10.0,
        };
        let two_players = vec![
            accumulator_with_one_live_pair(pair_from("As", "Ks"), totals),
            accumulator_with_one_live_pair(pair_from("2c", "3d"), totals),
        ];
        let scores_two = blocker_scores_for_settlement(&two_players).unwrap();
        assert_eq!(scores_two.len(), 2);
        for player_scores in &scores_two {
            assert_eq!(player_scores.len(), EQUITY_CARD_PAIR_COUNT);
        }

        let (three_players, ..) = three_seat_single_pair_fixture();
        let scores_three = blocker_scores_for_settlement(&three_players).unwrap();
        assert_eq!(scores_three.len(), 3);
        for player_scores in &scores_three {
            assert_eq!(player_scores.len(), EQUITY_CARD_PAIR_COUNT * 2);
        }
    }

    #[test]
    fn blocker_scores_for_settlement_produces_one_opponent_column_heads_up_and_two_at_three_players(
    ) {
        let totals = PlayerTotals {
            win_weight: 5.0,
            tie_weight: 0.0,
            share_weight: 5.0,
            total_weight: 10.0,
        };
        let heads_up = vec![
            accumulator_with_one_live_pair(pair_from("As", "Ks"), totals),
            accumulator_with_one_live_pair(pair_from("2c", "3d"), totals),
        ];
        let heads_up_scores = blocker_scores_for_settlement(&heads_up).unwrap();
        for player_scores in &heads_up_scores {
            assert_eq!(
                player_scores.len() / EQUITY_CARD_PAIR_COUNT,
                1,
                "a heads-up job has exactly one opponent column"
            );
        }

        let (three_players, ..) = three_seat_single_pair_fixture();
        let three_player_scores = blocker_scores_for_settlement(&three_players).unwrap();
        for player_scores in &three_player_scores {
            assert_eq!(
                player_scores.len() / EQUITY_CARD_PAIR_COUNT,
                2,
                "a three-player job has exactly two opponent columns"
            );
        }
    }

    #[test]
    fn blocker_scores_for_settlement_reads_the_skip_self_opponent_ordinal_at_a_three_seat_table() {
        let (players, _pair0, pair1, _pair2) = three_seat_single_pair_fixture();
        let scores = blocker_scores_for_settlement(&players).unwrap();

        let slot_base = card_pair_number(&pair1) * 2;
        assert!(
            scores[1][slot_base].is_finite(),
            "seat 1 reading seat 0 at ordinal 0 should be finite"
        );
        assert!(
            scores[1][slot_base + 1].is_finite(),
            "seat 1 reading seat 2 at ordinal 1 should be finite"
        );
    }

    #[test]
    fn blocker_scores_for_settlement_marks_a_not_live_card_pair_nan_and_a_live_one_finite() {
        let (players, pair0, pair1, _pair2) = three_seat_single_pair_fixture();
        let scores = blocker_scores_for_settlement(&players).unwrap();

        let live_base = card_pair_number(&pair1) * 2;
        assert!(scores[1][live_base].is_finite());
        assert!(scores[1][live_base + 1].is_finite());

        // `pair0` is a card pair player 1 never holds, so both of its own score slots must
        // carry a non-value rather than a fabricated zero.
        let dead_base = card_pair_number(&pair0) * 2;
        assert!(scores[1][dead_base].is_nan());
        assert!(scores[1][dead_base + 1].is_nan());
    }

    #[test]
    fn blocker_scores_for_settlement_gives_a_fixed_hole_cards_player_exactly_one_live_row() {
        let (players, _pair0, pair1, _pair2) = three_seat_single_pair_fixture();
        let scores = blocker_scores_for_settlement(&players).unwrap();

        let live_rows = scores[1]
            .chunks(2)
            .filter(|row| row.iter().any(|slot| slot.is_finite()))
            .count();
        assert_eq!(
            live_rows, 1,
            "a fixed-holding player has exactly one live card pair"
        );
        let live_base = card_pair_number(&pair1) * 2;
        assert!(scores[1][live_base].is_finite());
        assert!(scores[1][live_base + 1].is_finite());
    }

    #[test]
    fn blocker_score_baseline_equals_the_opponents_own_settled_aggregate_equity() {
        // two live holdings of different weight, so the opponent's own aggregate equity is a
        // genuine weighted mean rather than trivially equal to either holding's own equity.
        let strong = pair_from("As", "Ks");
        let weak = pair_from("2c", "3d");
        let mut opponent = PlayerAccumulator::default();
        opponent.pairs.insert(
            strong,
            PlayerTotals {
                win_weight: 8.0,
                tie_weight: 0.0,
                share_weight: 8.0,
                total_weight: 10.0,
            },
        );
        opponent.pairs.insert(
            weak,
            PlayerTotals {
                win_weight: 1.0,
                tie_weight: 0.0,
                share_weight: 1.0,
                total_weight: 10.0,
            },
        );
        opponent.totals = PlayerTotals {
            win_weight: 9.0,
            tie_weight: 0.0,
            share_weight: 9.0,
            total_weight: 20.0,
        };

        let opponent_cards = opponent_card_totals(&opponent);

        // a scoring pair sharing no card with either of the opponent's own holdings blocks
        // nothing, so its restricted mean can equal the opponent's own unrestricted mean only
        // if `blocker_score`'s own baseline term already is that same aggregate — the identity
        // an acceptance criterion of this change names directly.
        let scoring_pair = pair_from("Th", "9h");
        let score = blocker_score(&scoring_pair, &opponent, &opponent_cards).unwrap();
        assert_close(score, 0.0);

        let opponent_equity = opponent.totals.share_weight / opponent.totals.total_weight;
        assert_close(opponent_equity, 9.0 / 20.0);
        // preflop, every live pair still needs a (sentinel `0.0`) entry — see
        // `current_strengths`'s own doc comment for why preflop's map is never empty.
        let strengths = HashMap::from([(strong, 0.0), (weak, 0.0)]);
        let (opponent_settled, _) = opponent
            .finalize_for_settlement(true, &strengths)
            .expect("every live pair has a strengths entry");
        assert_close(opponent_settled.equity, opponent_equity);
    }

    #[test]
    fn blocker_score_is_positive_for_a_pair_blocking_a_strong_holding_and_negative_for_one_blocking_a_weak_one(
    ) {
        // an opponent with one strong (9/10 equity) and one weak (1/10 equity) live holding,
        // equally weighted, so its own aggregate equity sits exactly between them at 0.5 —
        // the sign each assertion below is derived from, not read off this implementation's
        // own output.
        let strong = pair_from("As", "Ks");
        let weak = pair_from("2c", "3d");
        let mut opponent = PlayerAccumulator::default();
        opponent.pairs.insert(
            strong,
            PlayerTotals {
                win_weight: 9.0,
                tie_weight: 0.0,
                share_weight: 9.0,
                total_weight: 10.0,
            },
        );
        opponent.pairs.insert(
            weak,
            PlayerTotals {
                win_weight: 1.0,
                tie_weight: 0.0,
                share_weight: 1.0,
                total_weight: 10.0,
            },
        );
        opponent.totals = PlayerTotals {
            win_weight: 10.0,
            tie_weight: 0.0,
            share_weight: 10.0,
            total_weight: 20.0,
        };

        let opponent_cards = opponent_card_totals(&opponent);

        // removing the strong holding leaves the opponent's remaining range weaker than its
        // own average, so holding a card from it reads positive.
        let blocks_strong = pair_from("As", "4h");
        let blocks_strong_score = blocker_score(&blocks_strong, &opponent, &opponent_cards)
            .expect("a live pair should never fail to score");
        assert!(
            blocks_strong_score > 0.0,
            "expected a positive score, got {blocks_strong_score}"
        );

        // removing the weak holding leaves the opponent's remaining range stronger than its
        // own average, so holding a card from it reads negative.
        let blocks_weak = pair_from("2c", "5h");
        let blocks_weak_score = blocker_score(&blocks_weak, &opponent, &opponent_cards)
            .expect("a live pair should never fail to score");
        assert!(
            blocks_weak_score < 0.0,
            "expected a negative score, got {blocks_weak_score}"
        );
    }

    #[test]
    fn blocker_score_returns_an_err_instead_of_panicking_when_the_restricted_denominator_is_not_positive(
    ) {
        // the invariant `blocker_score`'s own doc comment describes — a live `pair` can never
        // block every one of its opponent's live holdings — deliberately broken here, the same
        // way `player_accumulator_finalize_returns_an_err_instead_of_panicking_when_a_live_pair_has_no_matching_strength_entry`
        // breaks its own accumulator's invariant above: `opponent_cards.by_card` is built by
        // hand rather than through `opponent_card_totals`, carrying more weight on `pair`'s own
        // cards than `opponent`'s own total, so `restricted_weight` goes negative. this pins
        // that the guard reports a recoverable `Err` rather than panicking or emitting a
        // fabricated score.
        let pair = pair_from("As", "Ks");
        let opponent = PlayerAccumulator::default();
        let mut by_card = [PlayerTotals::default(); 52];
        by_card[card_index(&Card::from_str("As").unwrap()) as usize] = PlayerTotals {
            win_weight: 10.0,
            tie_weight: 0.0,
            share_weight: 10.0,
            total_weight: 10.0,
        };
        let opponent_cards = OpponentCardTotals {
            totals: PlayerTotals {
                win_weight: 1.0,
                tie_weight: 0.0,
                share_weight: 1.0,
                total_weight: 1.0,
            },
            by_card,
        };

        let error = blocker_score(&pair, &opponent, &opponent_cards).expect_err(
            "a restricted weight that goes non-positive must be reported, not panicked on",
        );

        assert!(
            error.contains(&pair.to_string()),
            "error message should name the offending pair: {error}"
        );
    }

    #[test]
    fn settle_reports_a_blocker_score_err_as_espada_equity_status_error() {
        // exercises `settle`'s own conversion of `blocker_scores_for_settlement`'s `Err` into
        // `EspadaEquityStatus::Error` — reached the same way the test above reaches
        // `blocker_score`'s own guard, but this time by handing `settle` a `totals` accumulator
        // whose aggregate is smaller than one of its own live pairs' totals, a state a real
        // walk can never produce.
        let hero = accumulator_with_one_live_pair(
            pair_from("As", "Ks"),
            PlayerTotals {
                win_weight: 5.0,
                tie_weight: 0.0,
                share_weight: 5.0,
                total_weight: 10.0,
            },
        );
        let mut villain = PlayerAccumulator::default();
        villain.pairs.insert(
            pair_from("As", "Qh"),
            PlayerTotals {
                win_weight: 10.0,
                tie_weight: 0.0,
                share_weight: 10.0,
                total_weight: 10.0,
            },
        );
        villain.totals = PlayerTotals {
            win_weight: 1.0,
            tie_weight: 0.0,
            share_weight: 1.0,
            total_weight: 1.0,
        };

        let outcome = Outcome::new();
        let user_data = &outcome as *const Outcome as *mut c_void;
        let state = SharedState {
            evaluator: None,
            rejection: None,
            player_count: 2,
            next_shard: AtomicU32::new(0),
            completed_shards: AtomicU32::new(0),
            cancelled: AtomicBool::new(false),
            settled: AtomicBool::new(false),
            active_workers: AtomicUsize::new(0),
            fault_message: Mutex::new(None),
            totals: Mutex::new(vec![hero, villain]),
            board: vec![],
            players: ranges(&["AsKs", "AsQh"]),
            strengths: OnceLock::new(),
            last_progress_nanos: AtomicU64::new(0),
            start_instant: Instant::now(),
            progress_cb: ignore_progress,
            settle_cb: record_settlement,
            user_data: SendPtr(user_data),
        };

        settle(&state);

        let (status, players, message) = outcome
            .settled
            .lock()
            .unwrap()
            .clone()
            .expect("settle must call settle_cb exactly once");
        assert_eq!(status, EspadaEquityStatus::Error);
        assert!(players.is_empty(), "an error settlement carries no players");
        let message = message.expect("an Error status must carry a message");
        assert!(
            message.contains(&pair_from("As", "Ks").to_string()),
            "message should name the offending pair: {message}"
        );
    }

    #[test]
    fn it_reports_an_empty_blocker_scores_buffer_on_a_progress_tick() {
        let board = cards("Qs 8d 2h");
        let players = ranges(&["22+,A2s+", "22+,A2o+"]);

        let (_, progress) = run_with_progress(board, players, 1);

        for (_, players) in &progress {
            if let Some(players) = players {
                for player in players {
                    assert!(
                        player.blocker_scores.is_empty(),
                        "a progress tick must carry no blocker scores"
                    );
                }
            }
        }
    }

    #[test]
    fn it_reproduces_the_definitions_decision_records_aa_positive_kk_negative_signs_preflop_against_qq_plus_aks(
    ) {
        // the exact scenario `docs/decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md`
        // records: heads-up preflop, a hero range of `AA,KK` against `QQ+,AKs` — every AA pair
        // scored positive there and every KK pair negative, since AA removes the opponent's own
        // strongest holdings (its own AA and two of its AKs) while KK removes only holdings the
        // opponent's own AA already beat.
        let players = ranges(&["AA,KK", "QQ+,AKs"]);
        // the acceptance criterion and the decision record below pin this exact walk
        // and these ranges; the 2,598,960-board walk, not thread count, needs longer
        // than run's 30s default under contention.
        // ../../../../../docs/decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md
        let (status, results, message) =
            run_with_timeout(vec![], players, 0, Duration::from_secs(120));

        assert_eq!(status, EspadaEquityStatus::Success);
        assert_eq!(message, None);
        assert_eq!(results.len(), 2);

        let hero = &results[0];
        let opponent_ordinal = 0usize; // heads-up: the sole opponent's own ordinal is always 0.
        let column_count = results.len() - 1;

        let aa_pair = CardPair::from_str("AsAh").unwrap();
        let aa_slot = card_pair_number(&aa_pair) * column_count + opponent_ordinal;
        assert!(
            hero.blocker_scores[aa_slot] > 0.0,
            "expected AA to score positive against QQ+,AKs, got {}",
            hero.blocker_scores[aa_slot]
        );

        let kk_pair = CardPair::from_str("KsKh").unwrap();
        let kk_slot = card_pair_number(&kk_pair) * column_count + opponent_ordinal;
        assert!(
            hero.blocker_scores[kk_slot] < 0.0,
            "expected KK to score negative against QQ+,AKs, got {}",
            hero.blocker_scores[kk_slot]
        );
    }
}
