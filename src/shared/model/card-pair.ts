import { cardKey, cardsEqual, compareRankStrength, SUITS, type Card } from './card';

/**
 * a data type, not a game concept: two distinct cards, order-normalised so
 * the two are always read the same way regardless of the order a caller
 * picked them in — the higher-ranked card first, and — when the two share
 * a rank, a pocket pair — whichever suit sorts first in `./card.ts`'s
 * `SUITS` order (spades, hearts, diamonds, clubs). `CardPair` says nothing
 * about who holds the two cards or what they're for; `Holding` represents a
 * player's own **hole cards** — the game term — as one (see its `holeCards`
 * field), the same way a `RankPair`'s own `cardPairCount` (`./rank-pair.ts`)
 * counts how many of these a rank pair stands for without either card pair
 * belonging to anyone. docs/glossary.md's Hand Ranges section states this
 * "represented by" relationship once, for both directions.
 *
 * matches espada-internal's `CardPair(Card, Card)`
 * (`modules/espada-engine/lib/espada-internal/src/hand_range/card_pair.rs`)
 * in name and normalisation: that crate's own `CardPair::new` swaps to
 * keep the smaller *derived* `Ord` first, and because its `Rank` enum
 * declares Ace-first, the smaller-ordinal card is the higher poker rank —
 * and its `Suit` enum happens to declare the same spade/heart/diamond/club
 * order `SUITS` uses — so that crate's normalisation and this one agree on
 * every pair, even reached through different comparators (this project's
 * ascending Ace-high vs. its derived Ace-low).
 *
 * **this type also enforces distinctness, which the Rust struct doesn't.**
 * `CardPair::new` there normalises two copies of the same card into a
 * `CardPair` of that card twice rather than rejecting them. this is a
 * deliberate strengthening for this UI, not a gap to close toward parity:
 * the card/range input sheet requires two different hole cards, and
 * `cardPair()` below is what lets that requirement live in the type
 * instead of in every caller's discipline. leave this check in place even
 * if a future pass brings the rest of this module closer to the Rust
 * struct's shape.
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
