import { z } from 'zod';

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

/**
 * the stored shape's own schema — a stored column is a SQLite `text` value
 * this app itself wrote, but "wrote by a version of this app" is not a
 * runtime guarantee: an older bundle, a hand-edited row, or a stored shape a
 * later migration changes the meaning of can all produce a string that still
 * parses as JSON but no longer matches `StoredPlayer`/`StoredHolding`. Per
 * `application-security`'s Data Layer rule and `zod-schema`'s Data Store
 * Boundaries reference, a data-access function reading a JSON-encoded column
 * validates the parsed shape before trusting it, rather than casting
 * `JSON.parse`'s `unknown` result straight to the stored type. Declared as
 * `z.ZodType<...>` against the hand-written `Stored*` types above (rather
 * than inferring the types from the schemas) so the two can never drift
 * silently — a schema edit that stops matching `StoredHolding`/`StoredPlayer`
 * is a type error here, not a runtime surprise at decode time.
 */
const storedHoldingSchema: z.ZodType<StoredHolding> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('holeCards'), holeCards: z.tuple([z.string(), z.string()]) }),
  z.object({ kind: z.literal('handRange'), rankPairs: z.array(z.string()) }),
]);

const storedResultSchema: z.ZodType<HistoryEntryResult> = z.object({
  win: z.number(),
  tie: z.number(),
  equity: z.number(),
});

const storedPlayerSchema: z.ZodType<StoredPlayer> = z.object({
  holding: storedHoldingSchema,
  result: storedResultSchema,
});

const storedBoardSchema = z.array(z.string());
const storedPlayersSchema = z.array(storedPlayerSchema);

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

/**
 * the inverse of `encodeHistoryEntryBoard`. validates the parsed JSON against
 * `storedBoardSchema` before trusting its shape — the stored column is
 * outside this app's own static types once it round-trips through SQLite —
 * and, like `parseCard` itself, throws rather than silently producing a
 * wrong value on anything that fails to parse or validate. this project's
 * established parse idiom (`parseCard`/`parseRank`/`parseSuit`,
 * `@/shared/model/card.ts`) already throws on malformed input, so a thrown
 * schema error here is consistent with the calls this function's own body
 * makes, not a second error style; see `history-entries-store.ts`'s
 * `listHistoryEntries`, which is where a thrown error from either decode
 * function is actually caught and isolated to the one offending row.
 */
export function decodeHistoryEntryBoard(value: string): readonly Card[] {
  const cardKeys = storedBoardSchema.parse(JSON.parse(value));
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

/**
 * the inverse of `encodeHistoryEntryPlayers`. validates the parsed JSON
 * against `storedPlayersSchema` before trusting its shape, for the same
 * reason and with the same throwing behavior `decodeHistoryEntryBoard`
 * above documents.
 */
export function decodeHistoryEntryPlayers(value: string): readonly HistoryEntryPlayer[] {
  const stored = storedPlayersSchema.parse(JSON.parse(value));
  return stored.map((player) => ({
    holding: decodeHolding(player.holding),
    result: player.result,
  }));
}
