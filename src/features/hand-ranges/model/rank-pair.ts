import { RANKS, type Rank } from './card';

/**
 * one cell of the 13×13 grid docs/specs/hand-ranges.md describes: an
 * unordered pair of ranks plus whether the two cards share a suit. `AA` is
 * a pocket pair, `AKs` suited, `AKo` offsuit — `docs/glossary.md`'s Combo
 * entry.
 */
export type Suitedness = 'pair' | 'suited' | 'offsuit';

export type RankPair = {
  readonly highRank: Rank;
  readonly lowRank: Rank;
  readonly suitedness: Suitedness;
};

/**
 * the string identity a `RankPair` carries into a `Set` or a `HandRange`
 * — `AA`, `AKs`, `72o` — already this project's own combo shorthand. it
 * doubles as `RankPair`'s display label too (`rankPairLabel` below just
 * returns it): unlike `./card.ts`'s `cardKey`/`cardLabel`, which diverge
 * because a card's ASCII key and its glyph label are genuinely different
 * strings, a rank pair's canonical notation is already both unique and
 * exactly what a screen shows, so there is nothing for a second string to
 * add.
 */
export type RankPairKey = string;

const RANKS_DESCENDING: readonly Rank[] = [...RANKS].reverse();

function rankIndex(rank: Rank): number {
  return RANKS_DESCENDING.indexOf(rank);
}

/**
 * builds a `RankPair` from two ranks in either order, sorting them into
 * `highRank`/`lowRank` itself so a caller never has to. `suited` is
 * ignored when the two ranks are equal — a pocket pair is neither suited
 * nor offsuit, the same way the grid's own diagonal carries no
 * suitedness toggle.
 */
export function rankPair(rankA: Rank, rankB: Rank, suited: boolean): RankPair {
  if (rankA === rankB) {
    return { highRank: rankA, lowRank: rankA, suitedness: 'pair' };
  }
  const [highRank, lowRank] = rankIndex(rankA) < rankIndex(rankB) ? [rankA, rankB] : [rankB, rankA];
  return { highRank, lowRank, suitedness: suited ? 'suited' : 'offsuit' };
}

export function rankPairKey(pair: RankPair): RankPairKey {
  if (pair.suitedness === 'pair') {
    return `${pair.highRank}${pair.highRank}`;
  }
  const suffix = pair.suitedness === 'suited' ? 's' : 'o';
  return `${pair.highRank}${pair.lowRank}${suffix}`;
}

export function rankPairLabel(pair: RankPair): string {
  return rankPairKey(pair);
}

/**
 * the inverse of `rankPairKey` — parses `AA`/`AKs`/`72o` back into a
 * `RankPair`. trusts a well-formed key, the shape `rankPairKey` itself
 * produces; it does not validate a malformed one, since every caller in
 * this codebase feeds it a key this module or `./hand-range-shorthand.ts`
 * generated.
 */
export function parseRankPairKey(key: RankPairKey): RankPair {
  const highRank = key[0] as Rank;
  const lowRank = key[1] as Rank;
  if (key.length === 2) {
    return { highRank, lowRank: highRank, suitedness: 'pair' };
  }
  return { highRank, lowRank, suitedness: key[2] === 's' ? 'suited' : 'offsuit' };
}

/**
 * 6 for a pocket pair (C(4,2) — choosing 2 of the 4 cards at that rank),
 * 4 for suited (one combo per suit), 12 for offsuit (4×4 rank
 * combinations minus the 4 that are suited). docs/specs/hand-ranges.md.
 */
export function rankPairComboCount(pair: RankPair): number {
  switch (pair.suitedness) {
    case 'pair':
      return 6;
    case 'suited':
      return 4;
    case 'offsuit':
      return 12;
  }
}

export type GridCoordinates = {
  readonly row: number;
  readonly col: number;
};

/**
 * the 13×13 grid cell a rank pair occupies, both axes descending `A`→`2`
 * (index 0 is `A`, index 12 is `2`) per docs/specs/hand-ranges.md: the
 * diagonal (`row === col`) is pocket pairs, above it (`row < col`) is
 * suited, below it (`row > col`) is offsuit.
 *
 * `row` holds whichever rank is higher for a suited pair and lower for an
 * offsuit one — the assignment that makes `row < col` mean "above the
 * diagonal" for both suitedness values, rather than a row/col axis chosen
 * independently of the diagonal rule it has to satisfy.
 */
export function rankPairToGridCoordinates(pair: RankPair): GridCoordinates {
  const highIndex = rankIndex(pair.highRank);
  const lowIndex = rankIndex(pair.lowRank);
  if (pair.suitedness === 'pair') {
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
    return { highRank: rowRank, lowRank: rowRank, suitedness: 'pair' };
  }
  return coordinates.row < coordinates.col
    ? { highRank: rowRank, lowRank: colRank, suitedness: 'suited' }
    : { highRank: colRank, lowRank: rowRank, suitedness: 'offsuit' };
}
