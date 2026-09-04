import { cardKey, parseCard, type Card } from '@/shared/model/card';
import { cardPair } from '@/shared/model/card-pair';

import type { HistoryEntryHolding, HistoryEntryPlayer, HistoryEntryResult } from './history-entry';

/**
 * the JSON-safe intermediate shape one player's `holding` round-trips
 * through — a `HistoryEntryHolding`'s `rankPairs` is a `ReadonlySet`, which
 * `JSON.stringify` renders as `{}`, and its `holeCards` is a `CardPair`
 * whose two cards are plain `Card` objects, not the two-character strings
 * `cardKey`/`parseCard` round-trip. Both are folded to strings here so the
 * whole players column is one `JSON.stringify` call away from storable text.
 */
type StoredHolding =
  | { readonly kind: 'holeCards'; readonly holeCards: readonly [string, string] }
  | { readonly kind: 'handRange'; readonly rankPairs: readonly string[] };

type StoredPlayer = {
  readonly holding: StoredHolding;
  readonly result: HistoryEntryResult;
};

function encodeHolding(holding: HistoryEntryHolding): StoredHolding {
  if (holding.kind === 'holeCards') {
    return {
      kind: 'holeCards',
      holeCards: [cardKey(holding.holeCards.first), cardKey(holding.holeCards.second)],
    };
  }
  return { kind: 'handRange', rankPairs: Array.from(holding.rankPairs) };
}

function decodeHolding(stored: StoredHolding): HistoryEntryHolding {
  if (stored.kind === 'holeCards') {
    const [first, second] = stored.holeCards;
    return { kind: 'holeCards', holeCards: cardPair(parseCard(first), parseCard(second)) };
  }
  return { kind: 'handRange', rankPairs: new Set(stored.rankPairs) };
}

/**
 * serializes a History Entry's board into its stored column value — the
 * dealing-order card keys (`cardKey`, `@/shared/model/card`), JSON-encoded.
 * an empty board (a preflop calculation) encodes as `"[]"`, a valid stored
 * value like every other length this function accepts (0, 3, 4, or 5 — the
 * caller's own responsibility per `history-entry.ts`'s doc comment, not
 * re-validated here).
 */
export function encodeHistoryEntryBoard(board: readonly Card[]): string {
  return JSON.stringify(board.map(cardKey));
}

/** the inverse of `encodeHistoryEntryBoard` — trusts a value that function produced. */
export function decodeHistoryEntryBoard(value: string): readonly Card[] {
  const cardKeys = JSON.parse(value) as readonly string[];
  return cardKeys.map(parseCard);
}

/**
 * serializes a History Entry's players (seat order) into its stored column
 * value — each player's holding kind, hole cards or rank pairs, and
 * computed result, JSON-encoded.
 */
export function encodeHistoryEntryPlayers(players: readonly HistoryEntryPlayer[]): string {
  const stored: readonly StoredPlayer[] = players.map((player) => ({
    holding: encodeHolding(player.holding),
    result: player.result,
  }));
  return JSON.stringify(stored);
}

/** the inverse of `encodeHistoryEntryPlayers` — trusts a value that function produced. */
export function decodeHistoryEntryPlayers(value: string): readonly HistoryEntryPlayer[] {
  const stored = JSON.parse(value) as readonly StoredPlayer[];
  return stored.map((player) => ({
    holding: decodeHolding(player.holding),
    result: player.result,
  }));
}
