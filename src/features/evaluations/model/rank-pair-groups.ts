import type { HandRange } from '@/shared/model/hand-range';
import { rankPairKey, type RankPair, type RankPairKey } from '@/shared/model/rank-pair';
import { gridCoordinatesToRankPair } from '@/shared/ui/grid-coordinates';

const GRID_COLUMNS = 13;

/**
 * every Rank Pair the 13×13 grid admits, in row-major order, both axes
 * descending A→2 — the same transform `@/shared/ui/rank-pair-grid/
 * rank-pair-grid.tsx`'s own `GRID_CELL_KEYS` builds from, kept here (rather
 * than that module's own array, which is keyed by `RankPairKey` alone) since
 * this module's own callers need each cell's parsed `isPocket`/`suitedness`
 * to sort it into a group, not only its key.
 *
 * moved here from `../ui/equity-breakdown-rank-pairs/
 * equity-breakdown-rank-pairs.tsx` (issue #293) once that component gained
 * a second reader — `../ui/equity-breakdown-blocker-score/
 * equity-breakdown-blocker-score.tsx` needs the identical three-group,
 * canonical-grid-order enumeration to lay out its own rows under the same
 * `Pocket pairs`/`Suited`/`Offsuit` headings — per
 * docs/conventions/directory-structure.md's "put shared logic at the lowest
 * tier with more than one caller" rule.
 */
export const ALL_RANK_PAIRS_IN_GRID_ORDER: readonly RankPair[] = Array.from(
  { length: GRID_COLUMNS * GRID_COLUMNS },
  (_, index) =>
    gridCoordinatesToRankPair({
      row: Math.floor(index / GRID_COLUMNS),
      col: index % GRID_COLUMNS,
    }),
);

export type RankPairGroups = {
  readonly pocket: readonly RankPairKey[];
  readonly suited: readonly RankPairKey[];
  readonly offsuit: readonly RankPairKey[];
};

/**
 * splits `rankPairs` into the three groups the Equity Breakdown sheet's own
 * Rank Pair list and Blocker Score section both enumerate under — one pass
 * over all 169 grid cells, keeping only the ones `rankPairs` actually
 * contains and sorting each into whichever of the three arrays it belongs
 * to, each still in `ALL_RANK_PAIRS_IN_GRID_ORDER`'s own canonical order.
 */
export function groupRankPairsByGridOrder(rankPairs: HandRange): RankPairGroups {
  const pocket: RankPairKey[] = [];
  const suited: RankPairKey[] = [];
  const offsuit: RankPairKey[] = [];
  for (const pair of ALL_RANK_PAIRS_IN_GRID_ORDER) {
    const key = rankPairKey(pair);
    if (!rankPairs.has(key)) {
      continue;
    }
    if (pair.isPocket) {
      pocket.push(key);
    } else if (pair.suitedness === 'suited') {
      suited.push(key);
    } else {
      offsuit.push(key);
    }
  }
  return { pocket, suited, offsuit };
}
