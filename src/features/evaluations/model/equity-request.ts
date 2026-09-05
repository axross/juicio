import type { Holding } from '@/features/hand-ranges/model/holding';
import { cardKey } from '@/shared/model/card';

import type { Board } from './board';
import type { Player } from './player';

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
 * e.g. `"AhKd"` — never a comma-joined range of one:
 * `modules/espada-engine/lib/espada-internal/src/
 * hand_range/hand_range_token.rs`'s `HandRangeToken::from_str`, via its own
 * `single_card_pair_regex` (`^([AKQJT98765432][shdc]){2}(:[01](\.[0-9]+)?)?$`)
 * and `CardPair::from_str` (`card_pair.rs`), accepts exactly this shape.
 *
 * **a hand range serializes as its rank-pair keys, comma-joined** —
 * `rankPairs` (`@/shared/model/rank-pair`'s `RankPairKey`) is already in
 * this project's own shorthand (`"AA"`, `"AKs"`, `"72o"`), which is also the
 * shape `hand_range_token.rs`'s own `single_pocket_pair_regex` and
 * `single_rank_pair_regex` accept, so this is nothing but joining the set
 * with a comma — `"22+,A2s+,AJo+"`-shaped output is `HandRangeShorthand`'s
 * (`@/shared/model/hand-range-shorthand`) job, not this function's: a
 * rank-pair `Set` has no shorthand folding of its own, and espada's own
 * grammar accepts the fully-expanded, comma-joined form just as well.
 */
export function holdingToEquityRangeString(holding: Holding): string {
  if (holding.kind === 'holeCards') {
    return cardKey(holding.holeCards.first) + cardKey(holding.holeCards.second);
  }
  return Array.from(holding.rankPairs).join(',');
}

/**
 * an order-independent identity for one board-and-players situation — equal
 * for two calls whenever they name the same board and the same set of
 * `{player id, holding}` pairs, no matter which order `players` currently
 * lists them in: the equity engine's own win/tie/equity figures depend only
 * on that set, never on a seat position. `../adapter/use-equity-evaluation.ts`'s
 * `startEquityEvaluation` compares this against the key its own currently
 * active or most recently settled job was started for, to tell a
 * reorder-only players-list change (same key) apart from a genuine one (a
 * different key) before deciding whether to restart. Reuses
 * `boardToEquityBoardString`/`holdingToEquityRangeString` above for each
 * half rather than a second serialization; each player contributes its own
 * `[id, holding]` pair (an array, not a joined string) specifically so
 * neither field's own separators — a hand range's comma-joined rank pairs
 * among them — can ever be misread as part of the other, and sorting those
 * pairs by `id` (every `id` is already unique — `../model/player.ts`'s
 * `createPlayerId`) before `JSON.stringify`-ing the whole structure is what
 * makes the same set of players compare equal regardless of which order
 * `players` currently lists them in.
 */
export function equitySituationKey(board: Board, players: readonly Player[]): string {
  const playerKeys = players
    .map((player): [string, string] => [player.id, holdingToEquityRangeString(player.holding)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([boardToEquityBoardString(board), playerKeys]);
}
