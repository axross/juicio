/**
 * a playing card: one of the 52 cards a hole-card selection or the board
 * draws from. `Rank` and `Suit` are closed string unions, each derived from
 * its own array below (`RANKS`, `SUITS`) rather than declared by hand a
 * second time, so a card renders and compares without a lookup table at
 * every call site and the thirteen ranks / four suits are written once.
 */
export type Card = {
  readonly rank: Rank;
  readonly suit: Suit;
};

/**
 * ascending, `2` low through `A` high — the order docs/specs/hand-ranges.md
 * itself states for the grid's own diagonal (`AA` down to `22`), and the
 * order every rank-ordered surface in this feature reads off.
 *
 * `T` (ten) is this project's own choice, matching standard hold'em
 * shorthand (`TT`, `AKs`, `72o` — docs/glossary.md's Rank Pair entry)
 * rather than the digits `10`, which would break every two-character
 * rank-pair key `../ui/card-fan-geometry.ts` and `./rank-pair.ts` build
 * off a single rank character. this also happens to be exactly
 * espada-internal's own rank glyph
 * (`modules/espada-engine/lib/espada-internal/src/card/rank.rs`'s
 * `From<&Rank> for char` — `T` for ten, one uppercase ASCII letter or
 * digit for every other rank) — see `cardKey`'s own doc comment for why
 * that agreement is asserted by a test, not merely assumed.
 */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Rank = (typeof RANKS)[number];

/**
 * the named strength comparison every rank-ordering caller in this feature
 * uses, rather than each one leaning on `RANKS`'s own index directly:
 * negative when `a` is the weaker rank, positive when `a` is the stronger
 * one, zero when the two ranks are equal — an `Array.prototype.sort`-
 * compatible comparator over `RANKS`'s own ascending, `2`-low-`A`-high
 * order.
 *
 * espada-internal's own `Rank` enum is declared the other way around —
 * `Ace` first, `Deuce` last
 * (`modules/espada-engine/lib/espada-internal/src/card/rank.rs`) — so its
 * derived `Ord` makes `Ace` the *smallest* rank, and every bitmask and
 * `u8` conversion in that crate (`card.rs`'s `ACE_MASK`/`DEUCE_MASK`
 * pair, `rank.rs`'s `From<&Rank> for u8`) is built on that same
 * declaration order. that ordering is an implementation artifact of how
 * the enum was declared and which table it happens to feed, not a domain
 * fact about which rank is strategically stronger — so this project does
 * not copy it. this comparator is where "ascending, Ace-high" is named
 * explicitly, so no caller has to rediscover it by reading `RANKS`'s own
 * declaration, and so the divergence from espada-internal's Ace-low `Ord`
 * reads as a deliberate choice rather than a bug once the two are wired
 * together.
 */
export function compareRankStrength(a: Rank, b: Rank): number {
  return RANKS.indexOf(a) - RANKS.indexOf(b);
}

/**
 * spades, hearts, diamonds, clubs — the order the design's own card picker
 * stacks its four fanned arcs in (`../ui/card-fan-geometry.ts`'s
 * `fan-geometry.ts` source: "four arcs, spades to clubs"), and the order
 * `theme.suits` exposes them in (`src/core/theme/tokens.ts`). also,
 * unlike `RANKS`'s own order (see `compareRankStrength`'s doc comment),
 * this happens to already agree with espada-internal's own `Suit` enum
 * declaration (`modules/espada-engine/lib/espada-internal/src/card/suit.rs`)
 * — nothing here relies on that agreement, but it is why `./card-pair.ts`'s
 * ordering normalisation needs no separate suit-order table of its own.
 *
 * each suit's own value is its single lowercase letter — `s`, `h`, `d`,
 * `c` — rather than its full English name: that letter is already this
 * project's target-user-facing shorthand (`AKs`, `72o`), it is what every
 * suit-bearing string this module produces (`cardKey`, `parseCard`)
 * already needs, and it is byte-identical to espada-internal's own `Suit`
 * `Display` impl (same source file as above). a suit is never drawn from
 * this value directly — every suit-bearing surface renders an icon
 * (`../ui/playing-card/icons/suit-icon.tsx`) instead — so there is no display string
 * for this type to carry.
 */
export const SUITS = ['s', 'h', 'd', 'c'] as const;

export type Suit = (typeof SUITS)[number];

/** the full 52-card deck, ranks outer / suits inner, so the four cards of one rank stay adjacent. */
export const DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));

export function cardsEqual(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/**
 * the inverse of a rank's own glyph — parses `A`, `K`, ..., `T`, ..., `2`
 * back into a `Rank`. throws on anything else.
 */
export function parseRank(glyph: string): Rank {
  if (!RANKS.includes(glyph as Rank)) {
    throw new Error(`${glyph} is not a valid rank glyph.`);
  }
  return glyph as Rank;
}

/**
 * the inverse of a suit's own letter — parses `s`, `h`, `d`, `c` back into
 * a `Suit`. throws on anything else, the same way espada-internal's own
 * `Suit::from_str` returns an `Err` for an unrecognised letter.
 */
export function parseSuit(letter: string): Suit {
  if (!SUITS.includes(letter as Suit)) {
    throw new Error(`${letter} is not a valid suit letter.`);
  }
  return letter as Suit;
}

/**
 * a stable, ASCII, `Set`/`Map`-safe identity for a card — `rank` plus the
 * suit letter (`Ah`, `Td`, `2c`), the same shorthand poker notation
 * already uses. `Card` is a plain object, so two values that describe the
 * same card are never the same reference; this is what a caller reaches
 * for to dedupe cards or key a `Map` by one, in place of a linear
 * `cardsEqual` scan.
 *
 * this is also, byte-for-byte, what espada-internal's own `Card` renders
 * (`modules/espada-engine/lib/espada-internal/src/card/card.rs`'s
 * `Display` impl: `"{rank}{suit}"`, rank glyph uppercase with ten as `T`,
 * suit letter lowercase) — `card.test.ts`'s round-trip tests assert that
 * agreement over the full 52-card deck, rather than leaving it to be
 * noticed only once the two are actually wired together.
 */
export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

/**
 * the inverse of `cardKey` — parses a two-character card string (`Ah`,
 * `Td`, `2c`) back into a `Card`. throws on anything that is not exactly
 * two characters or whose characters do not each parse, matching
 * espada-internal's own `Card::from_str`, which returns an `Err` under
 * the same conditions.
 */
export function parseCard(value: string): Card {
  if (value.length !== 2) {
    throw new Error(`${value} is not a valid card string.`);
  }
  return { rank: parseRank(value[0]), suit: parseSuit(value[1]) };
}
