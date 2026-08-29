import { cardKey, cardsEqual, compareRankStrength, SUITS, type Card } from './card';

/**
 * a data type, not a game concept: two distinct cards, order-normalised so
 * the two are always read the same way regardless of which order a caller
 * picked them in — the higher-ranked card first, and — when the two share
 * a rank, a pocket pair — whichever suit sorts first in `./card.ts`'s own
 * `SUITS` order (spades, hearts, diamonds, clubs). `CardPair` says nothing
 * about who holds the two cards or what they are for; `./holding.ts`'s
 * `Holding` is what represents a player's own **hole cards** — the game
 * term — as one (see that module's own `holeCards` field), the same way a
 * `RankPair`'s own `cardPairCount` (`./rank-pair.ts`) counts how many of
 * these a rank pair stands for without either of those card pairs
 * belonging to anyone. `docs/glossary.md`'s Hand Ranges section states
 * this "represented by" relationship once, for both directions.
 *
 * matches espada-internal's `CardPair(Card, Card)`
 * (`modules/espada-engine/lib/espada-internal/src/hand_range/card_pair.rs`)
 * in name and in that normalisation. that crate's own `CardPair::new`
 * swaps the two cards to keep whichever has the smaller *derived* `Ord`
 * first; because its `Rank` enum is declared Ace-first (see `./card.ts`'s
 * `compareRankStrength` doc comment for why), the smaller-ordinal card is
 * the higher poker rank, and its `Suit` enum happens to declare the same
 * spade/heart/diamond/club order `SUITS` already uses (see `SUITS`'s own
 * doc comment) — so that crate's normalisation and this one agree on
 * every pair, even though this module gets there through this project's
 * own ascending, Ace-high comparator rather than a derived, Ace-low one.
 *
 * **this type also enforces distinctness, which the Rust struct does
 * not.** `CardPair::new` there normalises two copies of the same card
 * into a `CardPair` of that card twice rather than rejecting them — see
 * that constructor's own body, which only ever compares and swaps, never
 * rejects. this is a deliberate strengthening for this UI, not a gap to
 * close toward parity: the card/range input sheet requires two different
 * hole cards, and `cardPair()` below is what lets that requirement live
 * in the type instead of in every caller's own discipline. leave this
 * check in place even if a future pass brings the rest of this module
 * closer to the Rust struct's shape.
 */
export type CardPair = {
  readonly first: Card;
  readonly second: Card;
};

/** true when `a` sorts before `b` under this module's own normalisation — see `CardPair`'s own doc comment. */
function precedes(a: Card, b: Card): boolean {
  const strengthDifference = compareRankStrength(a.rank, b.rank);
  if (strengthDifference !== 0) {
    return strengthDifference > 0;
  }
  return SUITS.indexOf(a.suit) < SUITS.indexOf(b.suit);
}

/**
 * builds a `CardPair` from two cards in either order, normalising and
 * validating so a caller never has to: throws if the two are the same
 * card, per `CardPair`'s own doc comment on why this module enforces what
 * espada-internal's equivalent constructor does not.
 */
export function cardPair(a: Card, b: Card): CardPair {
  if (cardsEqual(a, b)) {
    throw new Error(`a card pair needs two distinct cards, got two copies of ${cardKey(a)}`);
  }
  return precedes(a, b) ? { first: a, second: b } : { first: b, second: a };
}
