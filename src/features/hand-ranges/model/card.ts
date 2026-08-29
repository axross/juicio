/**
 * a playing card: one of the 52 cards a hole-card selection or the board
 * draws from. `Rank` and `Suit` are closed string unions rather than
 * numeric codes, so a card renders and compares without a lookup table at
 * every call site.
 *
 * `T` (ten) is this project's own choice, matching standard hold'em
 * shorthand (`TT`, `AKs`, `72o` — docs/glossary.md's Combo entry) rather
 * than the digits `10`, which would break every two-character rank-pair
 * key `../ui/card-fan-geometry.ts` and `./rank-pair.ts` build off a single
 * rank character.
 */
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Card = {
  readonly rank: Rank;
  readonly suit: Suit;
};

/**
 * ascending, `2` low through `A` high — the order docs/specs/hand-ranges.md
 * itself states for the grid's own diagonal (`AA` down to `22`), and the
 * order every rank-ordered surface in this feature reads off.
 */
export const RANKS: readonly Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
];

/**
 * spades, hearts, diamonds, clubs — the order the design's own card picker
 * stacks its four fanned arcs in (`../ui/card-fan-geometry.ts`'s
 * `fan-geometry.ts` source: "four arcs, spades to clubs"), and the order
 * `theme.suits` exposes them in (`src/core/theme/tokens.ts`).
 */
export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** the full 52-card deck, ranks outer / suits inner, so the four cards of one rank stay adjacent. */
export const DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

const SUIT_LETTERS: Record<Suit, string> = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

/**
 * a stable, ASCII, `Set`/`Map`-safe identity for a card — `rank` plus the
 * suit's first letter (`Ah`, `Td`, `2c`), the same shorthand poker
 * notation already uses. `Card` is a plain object, so two values that
 * describe the same card are never the same reference; this is what a
 * caller reaches for to dedupe cards or key a `Map` by one, in place of a
 * linear `cardsEqual` scan.
 */
export function cardKey(card: Card): string {
  return `${card.rank}${SUIT_LETTERS[card.suit]}`;
}

/**
 * the same card, for display: the rank plus its suit's Unicode glyph
 * (`A♥`) rather than `cardKey`'s ASCII letter (`Ah`) — a label is read, a
 * key is compared, and the two diverge here the way `./rank-pair.ts`'s
 * `RankPairKey`/label pair does not need to (see that module's own doc
 * comment for why).
 */
export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}
