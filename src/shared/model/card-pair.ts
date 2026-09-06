import { cardKey, cardsEqual, compareRankStrength, RANKS, SUITS, type Card } from './card';

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
 * validating so a caller never has to, per `CardPair`'s own doc comment on
 * why this module enforces what espada-internal's equivalent constructor
 * does not.
 *
 * @throws when `a` and `b` are the same card.
 */
export function cardPair(a: Card, b: Card): CardPair {
  if (cardsEqual(a, b)) {
    throw new Error(`a card pair needs two distinct cards, got two copies of ${cardKey(a)}`);
  }
  return precedes(a, b) ? { first: a, second: b } : { first: b, second: a };
}

/**
 * the total number of distinct card pairs a 52-card deck admits — `52
 * choose 2`. The length every **card pair number**-indexed buffer
 * (`docs/specs/equity-analysis.md`'s Blocker Score section;
 * `EspadaEquityPlayerResult.equities`/`strengths`,
 * `@/modules/espada-engine/index`) allocates one slot per.
 */
export const CARD_PAIR_COUNT = 1326;

/**
 * a card's own component of a **card pair number**: `rank * 4 + suit`,
 * rank `0` for a deuce through `12` for an ace, suit `0` for spades
 * through `3` for clubs — `./card.ts`'s own `RANKS`/`SUITS` ascending
 * order, the same order `DECK` enumerates cards in, so this is
 * `DECK.indexOf(card)` computed directly rather than by a linear scan.
 */
function cardNumber(card: Card): number {
  return RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);
}

/** the inverse of `cardNumber` above — `cardPairFromNumber`'s own helper. */
function cardFromNumber(n: number): Card {
  return { rank: RANKS[Math.floor(n / 4)], suit: SUITS[n % 4] };
}

/**
 * `pair`'s own **card pair number**
 * (`docs/specs/equity-analysis.md`'s Blocker Score section): for the two
 * cards' own `cardNumber`s `a < b`, `a * 51 - a * (a - 1) / 2 + (b - a -
 * 1)` — the combinatorial index of `{a, b}` among the `CARD_PAIR_COUNT`
 * two-card combinations, mapping them onto `0` through `CARD_PAIR_COUNT -
 * 1` one to one. Matches
 * `modules/espada-engine/lib/espada-engine/src/equity_job.rs`'s own
 * `card_pair_number` bit for bit — that function numbers a card the
 * opposite rank direction internally (its own `spec_card_number`'s doc
 * comment) before applying the identical formula, so the two sides agree
 * on every pair despite neither importing the other. `pair`'s own
 * `first`/`second` order (`CardPair`'s own doc comment, "the higher-ranked
 * card first") is unrelated to `a < b` here — both card numbers are
 * computed and then compared, exactly as the Rust implementation does.
 */
export function cardPairNumber(pair: CardPair): number {
  const x = cardNumber(pair.first);
  const y = cardNumber(pair.second);
  const a = Math.min(x, y);
  const b = Math.max(x, y);
  return a * 51 - (a * (a - 1)) / 2 + (b - a - 1);
}

/**
 * the inverse of `cardPairNumber` above: the two cards `n` names, in
 * `CardPair`'s own normalised order. `a`, the smaller of the two card
 * numbers, is found by walking off the same triangular-number term
 * `cardPairNumber` subtracts — `51 - a` is exactly how many pairs start at
 * card number `a`, the count `cardPairNumber` groups before moving on to
 * `a + 1` — and `b` is whatever of `n` is left over past that point.
 */
export function cardPairFromNumber(n: number): CardPair {
  let a = 0;
  let remaining = n;
  while (remaining >= 51 - a) {
    remaining -= 51 - a;
    a += 1;
  }
  const b = a + 1 + remaining;
  return cardPair(cardFromNumber(a), cardFromNumber(b));
}
