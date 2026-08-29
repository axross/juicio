import { parseRankPairKey, rankPairComboCount, type RankPairKey } from './rank-pair';

/**
 * a hand range: a set of `RankPairKey`s, keyed exactly as `./rank-pair.ts`'s
 * own `RankPairKey`. a plain `Set` alias rather than a wrapper object, so
 * a caller building or mutating one keeps `Set`'s own API instead of this
 * module growing a bespoke one just to hold it.
 */
export type HandRange = ReadonlySet<RankPairKey>;

/** the range's total combo count: every rank pair's own count, summed. */
export function handRangeComboCount(handRange: HandRange): number {
  let total = 0;
  for (const key of handRange) {
    total += rankPairComboCount(parseRankPairKey(key));
  }
  return total;
}
