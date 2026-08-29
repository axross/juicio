import { compareRankStrength, RANKS, type Rank } from './card';

/**
 * one cell of the 13×13 grid docs/specs/hand-ranges.md describes: an
 * unordered pair of ranks plus whether the two cards share a suit. `AA` is
 * a pocket pair, `AKs` suited, `AKo` offsuit — `docs/glossary.md`'s Rank
 * Pair entry.
 *
 * spelled `offsuit` deliberately, not espada-internal's `Ofsuit`
 * (`modules/espada-engine/lib/espada-internal/src/hand_range/rank_pair.rs`'s
 * `RankPair::Ofsuit` variant). that crate's own spelling is a typo, and
 * copying a typo into a second language only compounds it — noted here so
 * a reader comparing the two names side by side is not left wondering
 * which one is wrong.
 */
export type Suitedness = 'suited' | 'offsuit';

/**
 * a rank pair always either shares a suit or does not — `Suitedness`
 * above carries exactly that, not a third "pocket pair" value. Pocket-ness
 * is a genuinely independent fact (two cards of the same rank can still be
 * dealt suited or offsuit at the card-pair level; a rank *pair* just never
 * distinguishes which), so it is its own field, `isPocket`, rather than a
 * third arm of `suitedness` — the maintainer's own correction to this
 * module's original three-valued shape. A pocket pair is `offsuit` with
 * `isPocket: true`; the discriminated union below still forecloses the one
 * combination that would be a genuine contradiction — `suited` with
 * `isPocket: true` — at the type level. It cannot, on its own, also
 * enforce "a pocket pair has `highRank === lowRank`" or its converse: that
 * would need a type parameterised per rank, which every caller here would
 * then have to thread through for no benefit over the two lines that
 * assert it directly — `rankPair` (equal ranks in), `parseRankPairKey` and
 * `gridCoordinatesToRankPair` (the diagonal in) are what hold that
 * invariant, at the one or two places a `RankPair` actually gets built.
 */
export type RankPair =
  | {
      readonly highRank: Rank;
      readonly lowRank: Rank;
      readonly suitedness: 'suited';
      readonly isPocket: false;
    }
  | {
      readonly highRank: Rank;
      readonly lowRank: Rank;
      readonly suitedness: 'offsuit';
      readonly isPocket: boolean;
    };

/**
 * the string identity a `RankPair` carries into a `Set` or a `HandRange`
 * — `AA`, `AKs`, `72o` — already this project's own rank-pair shorthand. it
 * doubles as `RankPair`'s display label too (`rankPairLabel` below just
 * returns it): unlike `./card.ts`'s `cardKey`, whose ASCII key is never
 * shown on screen (a card's spoken label is composed separately, in the
 * `ui/` layer, from a rank and a suit name), a rank pair's canonical
 * notation is already both unique and exactly what a screen shows, so
 * there is nothing for a second string to add.
 */
export type RankPairKey = string;

const RANKS_DESCENDING: readonly Rank[] = [...RANKS].reverse();

/**
 * the grid's own 0(`A`)..12(`2`) descending-display index for a rank —
 * for `rankPairToGridCoordinates`/`gridCoordinatesToRankPair` below only.
 * this is a coordinate transform, not a strength comparison, so it stays
 * separate from `./card.ts`'s own named `compareRankStrength`: the two
 * answer different questions (a rank's position on this grid's axes, vs.
 * which of two ranks is stronger) that happen to share an ascending/
 * descending relationship, not a caller either one could stand in for.
 */
function gridIndex(rank: Rank): number {
  return RANKS_DESCENDING.indexOf(rank);
}

/**
 * builds a `RankPair` from two ranks in either order, sorting them into
 * `highRank`/`lowRank` itself so a caller never has to — via `./card.ts`'s
 * own named `compareRankStrength`, not a bare array-index comparison, so
 * this sort reads as "whichever rank is stronger" rather than depending on
 * `RANKS`'s own declaration order meaning that silently. `suited` is
 * ignored when the two ranks are equal — a pocket pair is always built
 * `offsuit` with `isPocket: true`, never `suited`, the same way the grid's
 * own diagonal carries no suited/offsuit toggle.
 */
export function rankPair(rankA: Rank, rankB: Rank, suited: boolean): RankPair {
  if (rankA === rankB) {
    return { highRank: rankA, lowRank: rankA, suitedness: 'offsuit', isPocket: true };
  }
  const [highRank, lowRank] =
    compareRankStrength(rankA, rankB) > 0 ? [rankA, rankB] : [rankB, rankA];
  return suited
    ? { highRank, lowRank, suitedness: 'suited', isPocket: false }
    : { highRank, lowRank, suitedness: 'offsuit', isPocket: false };
}

export function rankPairKey(pair: RankPair): RankPairKey {
  if (pair.isPocket) {
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
 * generated. a two-character key is always the pocket pair `RankPair`'s
 * own doc comment describes — `offsuit` with `isPocket: true` — never a
 * third suitedness value.
 */
export function parseRankPairKey(key: RankPairKey): RankPair {
  const highRank = key[0] as Rank;
  const lowRank = key[1] as Rank;
  if (key.length === 2) {
    return { highRank, lowRank: highRank, suitedness: 'offsuit', isPocket: true };
  }
  return key[2] === 's'
    ? { highRank, lowRank, suitedness: 'suited', isPocket: false }
    : { highRank, lowRank, suitedness: 'offsuit', isPocket: false };
}

/**
 * how many `CardPair`s (`./card-pair.ts`) this rank pair stands for: 6 for
 * a pocket pair (C(4,2) — choosing 2 of the 4 cards at that rank), 4 for
 * suited (one card pair per suit), 12 for offsuit (4×4 rank combinations
 * minus the 4 that are suited). docs/specs/hand-ranges.md;
 * `docs/glossary.md`'s Rank Pair and Card Pair entries.
 */
export function cardPairCount(pair: RankPair): number {
  if (pair.isPocket) {
    return 6;
  }
  return pair.suitedness === 'suited' ? 4 : 12;
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
