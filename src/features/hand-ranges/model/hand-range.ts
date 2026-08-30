import { cardPairCount, parseRankPairKey, type RankPairKey } from './rank-pair';

/**
 * a hand range: a set of `RankPairKey`s, keyed exactly as `./rank-pair.ts`'s
 * own `RankPairKey`. a plain `Set` alias rather than a wrapper object, so
 * a caller building or mutating one keeps `Set`'s own API instead of this
 * module growing a bespoke one just to hold it.
 *
 * **unweighted, unlike espada-internal's own `HandRange`.** that crate's
 * `HandRange` is a map of `CardPair` to an `f32` probability
 * (`modules/espada-engine/lib/espada-internal/src/hand_range/hand_range.rs`)
 * — a range can include a card pair at less than full weight. this UI has
 * no control that sets one and no caller reads one, so adding a weight now
 * would be speculative (`software-development`'s YAGNI); every entry here
 * is implicitly "selected". whoever wires this feature to the Rust engine
 * needs to know the conversion this type implies is "every selected rank
 * pair's every card pair, at weight `1.0`" — this comment is where that
 * reader meets it.
 */
export type HandRange = ReadonlySet<RankPairKey>;

/** the range's total card pair count: every rank pair's own count, summed. */
export function handRangeCardPairCount(handRange: HandRange): number {
  let total = 0;
  for (const key of handRange) {
    total += cardPairCount(parseRankPairKey(key));
  }
  return total;
}
