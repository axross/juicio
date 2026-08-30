import { RANKS, type Rank } from '../model/card';
import type { RankPair } from '../model/rank-pair';

/**
 * the 13×13 rank-pair grid's own coordinate system: which row/column a
 * `RankPair` (`../model/rank-pair.ts`) draws at, and the inverse. this is
 * view logic about *this grid* — its own row/column axes and its own
 * diagonal rule — not a fact about a rank pair itself, which is why it
 * lives under `ui/` rather than in `../model/rank-pair.ts` alongside
 * `RankPair`'s own construction and notation rules. moved here originally
 * from that module per the maintainer's review comment: "this is a
 * 'grid'-specific view logic. Shouldn't be in 'models'."
 *
 * **lives at `ui/`'s own top level, not inside either of its two
 * consumers' own directories.** `hand-range-pane.tsx` was this module's
 * only consumer when it first moved here, into `hand-range-pane/` beside
 * it; `rank-pair-grid/rank-pair-grid.tsx` (issue #87, the players list's
 * own dot-matrix preview) is a second, genuinely independent consumer in a
 * different directory — the exact shape docs/conventions/
 * directory-structure.md's own worked example (`card-fan-geometry.ts` and
 * `card-spoken-name.ts`, both read by `cards-pane.tsx` and
 * `playing-card.tsx`) already covers: colocating this module into either
 * single consumer's own directory would misstate the coupling the import
 * graph now actually shows, so it moved up to `ui/`'s own top level
 * instead, per that document's rule.
 *
 * named `grid-coordinates.ts`, not `hand-range-grid.ts` or
 * `rank-pair-grid-coordinates.ts` — this project's naming rule for a
 * coupled module only forbids repeating its *own* directory's name, and
 * this module is no longer coupled to one directory at all; `grid-
 * coordinates.ts` already reads as this grid's own coordinate transform
 * without either consumer's name folded into it.
 */

const RANKS_DESCENDING: readonly Rank[] = [...RANKS].reverse();

/**
 * the grid's own 0(`A`)..12(`2`) descending-display index for a rank —
 * for `rankPairToGridCoordinates`/`gridCoordinatesToRankPair` below only.
 * this is a coordinate transform, not a strength comparison, so it stays
 * separate from `../../model/card.ts`'s `compareRankStrength`: the two
 * answer different questions (a rank's position on this grid's axes, vs.
 * which of two ranks is stronger) that happen to share an
 * ascending/descending relationship, not a caller either could stand in
 * for.
 */
function gridIndex(rank: Rank): number {
  return RANKS_DESCENDING.indexOf(rank);
}

export type GridCoordinates = {
  readonly row: number;
  readonly col: number;
};

/**
 * the 13×13 grid cell a rank pair occupies, both axes descending `A`→`2`
 * (index 0 is `A`, index 12 is `2`) per docs/specs/hand-ranges.md: the
 * diagonal (`row === col`) is pocket pairs (`isPocket`), above it
 * (`row < col`) is suited, below it (`row > col`) is offsuit.
 *
 * `row` holds whichever rank is higher for a suited pair and lower for an
 * offsuit one — the assignment that makes `row < col` mean "above the
 * diagonal" for both suitedness values, rather than a row/col axis chosen
 * independently of the diagonal rule it has to satisfy.
 */
export function rankPairToGridCoordinates(pair: RankPair): GridCoordinates {
  const highIndex = gridIndex(pair.highRank);
  const lowIndex = gridIndex(pair.lowRank);
  if (pair.isPocket) {
    return { row: highIndex, col: highIndex };
  }
  return pair.suitedness === 'suited'
    ? { row: highIndex, col: lowIndex }
    : { row: lowIndex, col: highIndex };
}

/** the inverse of `rankPairToGridCoordinates` — the rank pair a grid cell holds. */
export function gridCoordinatesToRankPair(coordinates: GridCoordinates): RankPair {
  const rowRank = RANKS_DESCENDING[coordinates.row];
  const colRank = RANKS_DESCENDING[coordinates.col];
  if (coordinates.row === coordinates.col) {
    return { highRank: rowRank, lowRank: rowRank, suitedness: 'offsuit', isPocket: true };
  }
  return coordinates.row < coordinates.col
    ? { highRank: rowRank, lowRank: colRank, suitedness: 'suited', isPocket: false }
    : { highRank: colRank, lowRank: rowRank, suitedness: 'offsuit', isPocket: false };
}
