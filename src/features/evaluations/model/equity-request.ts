import type { Holding } from '@/features/hand-ranges/model/holding';
import { cardKey } from '@/shared/model/card';

import type { Board } from './board';

/**
 * serializes a `Board` into the space-separated card-code string
 * `espada-engine`'s `startEquity` expects (`modules/espada-engine/src/
 * specs/espada-engine.nitro.ts`'s own `startEquity` comment: `"Ah Kd 2c"`
 * for a flop, `""` for preflop). `cardKey` (`@/shared/model/card`) already
 * produces the exact two-character code that side of the boundary expects —
 * see that function's own doc comment for the byte-for-byte match — so this
 * is nothing but joining one board's worth of them with a space.
 */
export function boardToEquityBoardString(board: Board): string {
  return board.map(cardKey).join(' ');
}

/**
 * serializes one player's `Holding` into the range string `startEquity`
 * expects, one entry per player in `players: string[]` (seat order).
 *
 * **an exact holding serializes as a bare 4-character rank+suit
 * concatenation, with no separator** — `cardKey(first) + cardKey(second)`,
 * e.g. `"AhKd"` — never a comma-joined range of one. This is a verified
 * grammar, not a guess: `modules/espada-engine/lib/espada-internal/src/
 * hand_range/hand_range_token.rs`'s `HandRangeToken::from_str`, via its own
 * `single_card_pair_regex` (`^([AKQJT98765432][shdc]){2}(:[01](\.[0-9]+)?)?$`)
 * and `CardPair::from_str` (`card_pair.rs`), accepts exactly this shape —
 * confirmed by that file's own unit tests (`it_parses_str_ace_spade_king_spade`
 * parsing `"AsKs"`, `it_parses_str_askc` parsing `"AsKc"`).
 *
 * **a hand range serializes as its rank-pair keys, comma-joined** —
 * `rankPairs` (`@/shared/model/rank-pair`'s `RankPairKey`) is already in
 * this project's own shorthand (`"AA"`, `"AKs"`, `"72o"`), which is also
 * espada's own range-notation token (docs/specs/hand-ranges.md), so this is
 * nothing but joining the set with a comma — `"22+,A2s+,AJo+"`-shaped
 * output is `HandRangeShorthand`'s job (`./hand-range-shorthand.ts`), not
 * this function's: a rank-pair `Set` has no shorthand folding of its own,
 * and espada's own grammar accepts the fully-expanded, comma-joined form
 * just as well.
 */
export function holdingToEquityRangeString(holding: Holding): string {
  if (holding.kind === 'holeCards') {
    return cardKey(holding.holeCards.first) + cardKey(holding.holeCards.second);
  }
  return Array.from(holding.rankPairs).join(',');
}
