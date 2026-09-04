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
 * whole players column is a plain JSON value — an array of these, precisely
 * what `@/core/db/schema.ts`'s `historyEntries.players` column (declared
 * `{ mode: 'json' }`) itself stores and returns; this module no longer calls
 * `JSON.stringify`/`JSON.parse` anywhere, Drizzle's own column mapping does.
 */
type StoredHolding =
  | { readonly kind: 'holeCards'; readonly holeCards: readonly [string, string] }
  | { readonly kind: 'handRange'; readonly rankPairs: readonly string[] };

type StoredPlayer = {
  /** this player's own `Player.number` — see `HistoryEntryPlayer`'s own
   * `number` field doc comment (`./history-entry.ts`) for why it is stored
   * at all. */
  readonly number: number;
  readonly holding: StoredHolding;
  readonly result: HistoryEntryResult;
};

/**
 * the stored shape's own schema — a stored column is a value Drizzle's own
 * `{ mode: 'json' }` column mapping has already run through `JSON.parse`
 * (`@/core/db/schema.ts`'s `historyEntries` doc comment), typed `unknown`
 * there for exactly this reason, but "already valid JSON" is not "matches
 * `StoredPlayer`/`StoredHolding`": an older bundle, a hand-edited row, or a
 * stored shape a later migration changes the meaning of can all produce a
 * value that parses fine as JSON yet no longer matches either type. Per
 * `application-security`'s Data Layer rule and `zod-schema`'s Data Store
 * Boundaries reference, a data-access function reading a JSON-encoded
 * column validates the parsed shape before trusting it, rather than casting
 * the driver's `unknown` result straight to the stored type. Declared as
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
  number: z.number().int().positive(),
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
 * builds a History Entry's board's own stored column value — the
 * dealing-order card keys (`cardKey`, `@/shared/model/card`) — for
 * `@/core/db/schema.ts`'s `historyEntries.board` column (`{ mode: 'json' }`)
 * to serialize. an empty board (a preflop calculation) encodes as `[]`, a
 * valid stored value like every other length this function accepts (0, 3,
 * 4, or 5 — the caller's own responsibility per `history-entry.ts`'s doc
 * comment, not re-validated here). validates the encoded shape against
 * `storedBoardSchema` before returning it, per `zod-schema`'s Data Store
 * Boundaries rule to validate on write as well as on read.
 */
export function encodeHistoryEntryBoard(board: readonly Card[]): readonly string[] {
  const cardKeys = board.map(cardKey);
  return storedBoardSchema.parse(cardKeys);
}

/**
 * the inverse of `encodeHistoryEntryBoard`. `value` is whatever
 * `@/core/db/schema.ts`'s `historyEntries.board` column (`{ mode: 'json' }`)
 * already ran through `JSON.parse` — typed `unknown` there for exactly this
 * reason. validates it against `storedBoardSchema` before trusting its
 * shape — the stored column is outside this app's own static types once it
 * round-trips through SQLite — and, like `parseCard` itself, throws rather
 * than silently producing a wrong value on anything that fails to validate.
 * this project's established parse idiom (`parseCard`/`parseRank`/
 * `parseSuit`, `@/shared/model/card.ts`) already throws on malformed input,
 * so a thrown schema error here is consistent with the calls this
 * function's own body makes, not a second error style; see
 * `history-entries-store.ts`'s `listHistoryEntries`, which is where a
 * thrown error from either decode function is actually caught and isolated
 * to the one offending row — a shape-mismatch, that is: a row whose stored
 * text isn't even valid JSON fails inside Drizzle's own column mapping,
 * before this function or `listHistoryEntries`'s own per-row try/catch ever
 * runs, and is not isolated the same way. See that module's own doc
 * comment.
 */
export function decodeHistoryEntryBoard(value: unknown): readonly Card[] {
  const cardKeys = storedBoardSchema.parse(value);
  return cardKeys.map(parseCard);
}

/**
 * builds a History Entry's players' (seat order) own stored column value —
 * each player's own `number`, holding kind (hole cards or rank pairs), and
 * computed result — for `@/core/db/schema.ts`'s `historyEntries.players`
 * column (`{ mode: 'json' }`) to serialize. validates the built shape
 * against `storedPlayersSchema` before returning it, per `zod-schema`'s
 * Data Store Boundaries rule to validate on write as well as on read.
 */
export function encodeHistoryEntryPlayers(
  players: readonly HistoryEntryPlayer[],
): readonly StoredPlayer[] {
  const stored: readonly StoredPlayer[] = players.map((player) => ({
    number: player.number,
    holding: encodeHolding(player.holding),
    result: player.result,
  }));
  return storedPlayersSchema.parse(stored);
}

/**
 * the inverse of `encodeHistoryEntryPlayers`. `value` is whatever
 * `@/core/db/schema.ts`'s `historyEntries.players` column (`{ mode: 'json' }`)
 * already ran through `JSON.parse` — typed `unknown` there for exactly this
 * reason. validates it against `storedPlayersSchema` before trusting its
 * shape, for the same reason and with the same throwing behavior
 * `decodeHistoryEntryBoard` above documents.
 */
export function decodeHistoryEntryPlayers(value: unknown): readonly HistoryEntryPlayer[] {
  const stored = storedPlayersSchema.parse(value);
  return stored.map((player) => ({
    number: player.number,
    holding: decodeHolding(player.holding),
    result: player.result,
  }));
}
