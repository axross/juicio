/**
 * the Equity Breakdown sheet's classification rule, Rule R1
 * (docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md):
 * every live card pair the native engine already delivers —
 * `liveCardPairsFromBuffers` below reads one out of
 * `EspadaEquityPlayerResult.equities`/`strengths`
 * (`@/modules/espada-engine/index`), filled only at settlement (a progress
 * tick carries every slot of both at the `NaN` sentinel — issue #294, see
 * `docs/decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md`)
 * — gets exactly one of four bands from its
 * own `equity` and `strength`, relative to the calculation's own fair share
 * (`1 / playerCount`). Kept as app-level constants rather than compiled
 * into the engine — see that decision record's own "Alternatives
 * rejected" — specifically so tuning a threshold needs no native rebuild.
 *
 * No I/O, no React: `../ui/equity-breakdown-sheet/equity-breakdown-sheet.tsx`
 * is this module's own caller for the per-pair bands and the four band
 * counts the legend shows; `../ui/equity-breakdown-chart/
 * equity-breakdown-chart.tsx` is the caller for `bandEquityBinCounts`/
 * `totalEquityBinCounts`/`majorityBandsPerBin`, which decide each drawn
 * bar's own height and flat colour from that same per-pair data
 * (`../ui/equity-breakdown-sheet/equity-breakdown-sheet.tsx` hands both
 * this player's own live per-pair equities and their already-classified
 * bands down to that chart, rather than the chart repeating the
 * classification itself).
 */

import { EQUITY_BIN_COUNTS, foldEquityBins, type EquityBinCount } from './equity-breakdown';

/**
 * one live card pair's own `equity`/`strength`, read out of
 * `EspadaEquityPlayerResult.equities`/`strengths`
 * (`@/modules/espada-engine/index`) by `liveCardPairsFromBuffers` below —
 * the same shape `classifyCardPairBand`/`classifyCardPairBands` already
 * take, so a caller reads a result's buffers once and feeds the same array
 * to every function below it, rather than each rereading the buffers its
 * own way.
 */
export type LiveCardPair = {
  readonly equity: number;
  readonly strength: number;
};

/**
 * the four strength bands, **strongest first** — this order is what
 * `majorityBandsPerBin` below reads to settle a tie between two bands within
 * one equity bin (docs/decisions/2026-09-04-colour-each-histogram-bar-by-its-
 * majority-strength-band.md: "a tie between two bands within a bin resolves
 * to the stronger of the two"). `theme.bands`
 * (`../../../core/theme/tokens.ts`) and this project's own translations key
 * the same four bands weakest-first instead (`trash, marginal, value, nuts`,
 * the histogram's own left-to-right colour order) — the two orderings serve
 * two different purposes and neither is "the" canonical one to standardise
 * on.
 */
export const STRENGTH_BANDS = ['nuts', 'value', 'marginal', 'trash'] as const;

export type StrengthBand = (typeof STRENGTH_BANDS)[number];

/** Rule R1's own `Nuts` cutoff: `P >= NUTS_CURRENT_STRENGTH_THRESHOLD`. */
export const NUTS_CURRENT_STRENGTH_THRESHOLD = 0.85;

/**
 * Rule R1's own `Value` current-strength cutoff — reused, alongside a
 * fair-share equity check, as the `Trash` rule's own upper bound on `P` too
 * (`classifyPostflopBand` below): R1 states `Trash` as `eq < 0.6 × fair AND
 * P < 0.50`, the same `0.50` this constant already names, not a second
 * threshold of its own.
 */
export const VALUE_CURRENT_STRENGTH_THRESHOLD = 0.5;

/**
 * the fraction of `fairShare` below which equity alone reads as `Trash` —
 * shared, by Rule R1's own statement, between the postflop rule's `Trash`
 * branch and the preflop rule's own `Trash` cutoff (`classifyPreflopBand`
 * below): both read literally as `eq < 0.6 × fair`, so this is one constant
 * rather than two that happen to start out equal.
 */
export const TRASH_FAIR_SHARE_RATIO = 0.6;

/**
 * preflop only: how far past `fairShare`, as a fraction of the room between
 * `fairShare` and `1`, equity has to climb before a card pair reads as
 * `Nuts` rather than `Value` — `classifyPreflopBand` below's own `Value`
 * upper bound is `fair + PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO * (1 - fair)`.
 * Numerically the same `0.6` `TRASH_FAIR_SHARE_RATIO` above holds, per Rule
 * R1's own preflop variant — kept as its own named constant since the two
 * describe different boundaries (a floor under `fairShare`, a ceiling above
 * it) that only happen to share a value, not a rule that reuses the same
 * threshold on purpose.
 */
export const PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO = 0.6;

/** the equity a player would hold if the pot were split evenly among every
 * player in the calculation (docs/glossary.md's Fair Share entry):
 * `1 / playerCount`. */
export function fairShare(playerCount: number): number {
  return 1 / playerCount;
}

/**
 * Rule R1, postflop (a board exists to be ahead on): first-match-wins over
 * `equity` and `currentStrength` against `fairShare` —
 * `Nuts` if `currentStrength >= 0.85`; else `Value` if `currentStrength >=
 * 0.50 AND equity >= fairShare`; else `Trash` if `equity < 0.6 × fairShare
 * AND currentStrength < 0.50`; else `Marginal`. Every boundary named above
 * is inclusive on its own "cleared" side — `currentStrength === 0.85` is
 * already `Nuts`, `equity === fairShare` already clears the `Value` check,
 * and `equity === 0.6 × fairShare` does **not** clear the `Trash` check
 * (strictly `<`), landing in `Marginal` instead — see this module's own
 * tests for the four boundary values named in the decision record.
 */
export function classifyPostflopBand(
  equity: number,
  currentStrength: number,
  fairShare: number,
): StrengthBand {
  if (currentStrength >= NUTS_CURRENT_STRENGTH_THRESHOLD) {
    return 'nuts';
  }
  if (currentStrength >= VALUE_CURRENT_STRENGTH_THRESHOLD && equity >= fairShare) {
    return 'value';
  }
  if (
    equity < TRASH_FAIR_SHARE_RATIO * fairShare &&
    currentStrength < VALUE_CURRENT_STRENGTH_THRESHOLD
  ) {
    return 'trash';
  }
  return 'marginal';
}

/**
 * Rule R1, preflop: current strength has no board to be ahead on and is left
 * undefined by design (`EspadaEquityCardPairResult.strength`'s own doc
 * comment) — a preflop band comes from `equity` relative to `fairShare`
 * alone: `Trash` below `0.6 × fairShare`, `Marginal` below `fairShare`,
 * `Value` below `fairShare + 0.6 × (1 − fairShare)`, `Nuts` otherwise. Each
 * cutoff is exclusive on its lower branch's own side (`equity ===
 * fairShare` already reads as `Value`, not `Marginal`) — see this module's
 * own tests.
 */
export function classifyPreflopBand(equity: number, fairShare: number): StrengthBand {
  if (equity < TRASH_FAIR_SHARE_RATIO * fairShare) {
    return 'trash';
  }
  if (equity < fairShare) {
    return 'marginal';
  }
  if (equity < fairShare + PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO * (1 - fairShare)) {
    return 'value';
  }
  return 'nuts';
}

/**
 * one live card pair's own band, dispatching on `isPreflop` — the same
 * "current strength has no board to be ahead on preflop" split
 * `classifyPreflopBand`'s own doc comment states.
 * `EspadaEquityCardPairResult.strength` carries a `0` sentinel preflop
 * (never a measurement), so `isPreflop` — supplied by the caller from the
 * board it already knows, never inferred from `pair.strength` itself — is
 * what keeps a genuine postflop `strength` of exactly `0` from being
 * misread as that sentinel.
 */
export function classifyCardPairBand(
  pair: LiveCardPair,
  fairShare: number,
  isPreflop: boolean,
): StrengthBand {
  return isPreflop
    ? classifyPreflopBand(pair.equity, fairShare)
    : classifyPostflopBand(pair.equity, pair.strength, fairShare);
}

/**
 * every one of a hand-range player's own live card pairs, read directly out
 * of `EspadaEquityPlayerResult.equities`/`strengths`
 * (`@/modules/espada-engine/index`) — each an `ArrayBuffer` of
 * `CARD_PAIR_COUNT` (`@/shared/model/card-pair`) 32-bit floats, one slot
 * per **card pair number**. A slot is live exactly when its own `equities`
 * value is not `NaN` — checked on `equities` alone, never `strengths`,
 * since a preflop result leaves every `strengths` slot `NaN` regardless of
 * liveness (`EspadaEquityPlayerResult.strengths`'s own doc comment); the
 * caller's own `isPreflop` flag, not this function, is what keeps a
 * preflop `strength` from being misread by `classifyCardPairBand` above.
 * Filled only at settlement — a progress tick carries every slot of both
 * buffers at the `NaN` sentinel (issue #294, see
 * `docs/decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md`)
 * — this is the one function every caller reads a settled result's own live
 * card pairs through, feeding the same output array to
 * `classifyCardPairBands` and `bandEquityBinCounts` below so a bar's own
 * height and colour can never disagree about which pairs are live.
 */
export function liveCardPairsFromBuffers(
  equities: ArrayBuffer,
  strengths: ArrayBuffer,
): readonly LiveCardPair[] {
  const equityView = new Float32Array(equities);
  const strengthView = new Float32Array(strengths);
  const live: LiveCardPair[] = [];
  for (let slot = 0; slot < equityView.length; slot++) {
    const equity = equityView[slot];
    if (Number.isNaN(equity)) {
      continue;
    }
    live.push({ equity, strength: strengthView[slot] });
  }
  return live;
}

/**
 * classifies every entry of `pairs`, in the same order — one band per live
 * card pair, nothing added or dropped: a card pair that is not currently
 * live already carries no entry in the array a caller hands this function
 * (`liveCardPairsFromBuffers` above, on any tick, or a settled result's own
 * `pairs`), so it is excluded here simply by never reaching this function,
 * with no filtering step of this module's own.
 */
export function classifyCardPairBands(
  pairs: readonly LiveCardPair[],
  playerCount: number,
  isPreflop: boolean,
): readonly StrengthBand[] {
  const fair = fairShare(playerCount);
  return pairs.map((pair) => classifyCardPairBand(pair, fair, isPreflop));
}

export type StrengthBandCounts = Readonly<Record<StrengthBand, number>>;

/** tallies `bands` into the four band counts the legend shows — always sums
 * to `bands.length`, since every entry is exactly one of the four. */
export function countStrengthBands(bands: readonly StrengthBand[]): StrengthBandCounts {
  const counts: Record<StrengthBand, number> = { nuts: 0, value: 0, marginal: 0, trash: 0 };
  for (const band of bands) {
    counts[band] += 1;
  }
  return counts;
}

/**
 * the equity-bin index a card pair's own `equity` falls in — mirrors the
 * native engine's own `distribution_of` binning exactly
 * (`modules/espada-engine/lib/espada-engine/src/equity_job.rs`):
 * `EQUITY_BIN_COUNTS[0]` (20) equal-width slices of `[0, 1]`, an `equity` of
 * exactly `1` clamped into the last bin rather than landing one past it.
 * Bucketing every live card pair this same way, per band, is what lets
 * `majorityBandsPerBin` below fold its own per-band bin counts with the
 * exact same position-based partition `foldEquityBins` already applies to
 * `totalEquityBinCounts`'s own bar-height totals — so a drawn bar's own
 * total across every band always agrees with that bar's own height.
 */
export function equityBinIndex(equity: number): number {
  const binCount = EQUITY_BIN_COUNTS[0];
  return Math.min(Math.floor(equity * binCount), binCount - 1);
}

/**
 * for every band, an `EQUITY_BIN_COUNTS[0]`-length count array: how many of
 * `equities` land in each equity bin under that same index's own band.
 * `bands` must be the same length as `equities`, in the same order
 * (`classifyCardPairBands`'s own output paired with each pair's own
 * `equity`) — an index past either array's own length is simply skipped, so
 * a caller handing in two arrays of unequal length loses only the
 * trailing, unmatched entries rather than throwing.
 */
export function bandEquityBinCounts(
  equities: readonly number[],
  bands: readonly StrengthBand[],
): Readonly<Record<StrengthBand, readonly number[]>> {
  const binCount = EQUITY_BIN_COUNTS[0];
  const counts: Record<StrengthBand, number[]> = {
    nuts: new Array(binCount).fill(0),
    value: new Array(binCount).fill(0),
    marginal: new Array(binCount).fill(0),
    trash: new Array(binCount).fill(0),
  };
  const length = Math.min(equities.length, bands.length);
  for (let i = 0; i < length; i++) {
    const band = bands[i];
    counts[band][equityBinIndex(equities[i])] += 1;
  }
  return counts;
}

/**
 * the total live card-pair count per raw equity bin, summed across all
 * four bands of `bandBinCounts` (`bandEquityBinCounts`'s own output) — the
 * bar-height total `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx`
 * folds down to whichever bar count it resolved to. Deriving a bar's own
 * height this way, from the identical per-band counts `majorityBandsPerBin`
 * below already resolves its colour from, is what keeps the two from ever
 * disagreeing about which bin a given live card pair belongs to — unlike a
 * height read from a separately-encoded `distribution`, which could put a
 * pair in a different bin than its own classified band did.
 */
export function totalEquityBinCounts(
  bandBinCounts: Readonly<Record<StrengthBand, readonly number[]>>,
): readonly number[] {
  const binCount = EQUITY_BIN_COUNTS[0];
  const totals = new Array(binCount).fill(0);
  for (const band of STRENGTH_BANDS) {
    for (let i = 0; i < binCount; i++) {
      totals[i] += bandBinCounts[band][i];
    }
  }
  return totals;
}

/**
 * the majority band for each of `count` drawn bars
 * (docs/decisions/2026-09-04-colour-each-histogram-bar-by-its-majority-
 * strength-band.md): folds `bandBinCounts` (`bandEquityBinCounts`'s own
 * output, always `EQUITY_BIN_COUNTS[0]`-wide per band) down to `count` bins
 * the same position-based way `foldEquityBins` folds `totalEquityBinCounts`'s
 * own bar-height totals above — one `foldEquityBins` call per band, reusing
 * that already-tested function rather than a second folding implementation
 * — so a drawn bar's own total across every band always agrees with the
 * height `totalEquityBinCounts`, folded the same way, gives that same bar.
 *
 * A tie between two bands within one bin resolves to the stronger band:
 * `STRENGTH_BANDS`'s own strongest-first order settles it on its own,
 * since the loop below only replaces the running winner on a strictly
 * greater count, never an equal one — so an earlier (stronger) band already
 * holding the lead is never displaced by a later (weaker) band matching it.
 * `null` for a bin with no live card pair under any band — the same "an
 * empty bin draws no bar" case
 * `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx` already handles
 * via a zero-value bar, so a `null` here never needs to resolve to a real
 * colour for anything to render correctly.
 */
export function majorityBandsPerBin(
  bandBinCounts: Readonly<Record<StrengthBand, readonly number[]>>,
  count: EquityBinCount,
): readonly (StrengthBand | null)[] {
  const folded: Record<StrengthBand, readonly number[]> = {
    nuts: foldEquityBins(bandBinCounts.nuts, count),
    value: foldEquityBins(bandBinCounts.value, count),
    marginal: foldEquityBins(bandBinCounts.marginal, count),
    trash: foldEquityBins(bandBinCounts.trash, count),
  };
  const majorities: (StrengthBand | null)[] = [];
  for (let i = 0; i < count; i++) {
    let winner: StrengthBand | null = null;
    let winnerCount = 0;
    for (const band of STRENGTH_BANDS) {
      const bandCount = folded[band][i];
      if (bandCount > winnerCount) {
        winner = band;
        winnerCount = bandCount;
      }
    }
    majorities.push(winner);
  }
  return majorities;
}
