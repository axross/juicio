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
  readonly holding: StoredHolding;
  readonly result: HistoryEntryResult;
  /** `HistoryEntryPlayer.name`'s own stored form — a plain string, no
   * further folding needed the way `holding` needs (that field's own doc
   * comment on `StoredHolding` above). */
  readonly name: string;
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
  holding: storedHoldingSchema,
  result: storedResultSchema,
  // `.min(1)` rather than a bare `z.string()`: `name` is always machine-
  // generated from the `Player {{number}}` template
  // (`history-entry.ts`'s own doc comment on `HistoryEntryPlayer.name`),
  // never empty by construction, so an empty stored value is exactly the
  // kind of shape drift this schema already exists to catch, not a valid
  // stored shape merely too short.
  name: z.string().min(1),
});

const storedBoardSchema = z.array(z.string());
const storedPlayersSchema = z.array(storedPlayerSchema);

/**
 * the outcome of decoding one History Entry's `board` or `players` column —
 * `success`/`data`/`error` deliberately mirrors Zod's own `safeParse()`
 * result shape (`z.ZodType.safeParse`), since a stored row failing to decode
 * is exactly the kind of expected, caller-handled outcome `zod-schema`'s
 * Parsing reference reserves `.safeParse()` for, not a defect to throw on:
 * `history-entries-store.ts`'s `listHistoryEntries()` — the only caller of
 * either decode function below — treats a decode failure as one row to
 * isolate and report, not as a reason to fail the whole list. `error` is
 * `unknown` rather than `z.ZodError` because a stored column can also fail
 * to decode *after* its shape already matches — `parseCard`/`cardPair`
 * (`@/shared/model/card(-pair).ts`) throw plain `Error`s on a schema-valid
 * but not-actually-a-card string, e.g. `["zz"]` passes `storedBoardSchema`
 * (an array of strings) yet isn't a card `parseCard` accepts.
 */
type DecodeResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: unknown };

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
 * reason. validates it against `storedBoardSchema` with `.safeParse()`
 * rather than `.parse()` — the stored column is outside this app's own
 * static types once it round-trips through SQLite, and a row that no longer
 * matches is an expected outcome `listHistoryEntries()` (`../adapter/
 * history-entries-store.ts`, this function's only caller) must isolate and
 * report per row, not a defect to let escape as a thrown `ZodError` — see
 * `DecodeResult`'s own doc comment above for why `.safeParse()` is the right
 * call here per `zod-schema`'s Parsing reference. a schema-valid card key
 * that `parseCard` (`@/shared/model/card.ts`) still rejects (`storedBoardSchema`
 * only checks "an array of strings", not "an array of real card keys") is
 * caught the same way, folded into the same failure result: a row whose
 * stored text isn't even valid JSON fails earlier still, inside Drizzle's
 * own column mapping, before this function or `listHistoryEntries()`'s own
 * per-row handling ever runs, and is not isolated the same way. See that
 * module's own doc comment.
 */
export function decodeHistoryEntryBoard(value: unknown): DecodeResult<readonly Card[]> {
  const parsed = storedBoardSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }
  try {
    return { success: true, data: parsed.data.map(parseCard) };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * builds a History Entry's players' (seat order) own stored column value —
 * each player's holding kind (hole cards or rank pairs) and computed result
 * — for `@/core/db/schema.ts`'s `historyEntries.players` column
 * (`{ mode: 'json' }`) to serialize. validates the built shape against
 * `storedPlayersSchema` before returning it, per `zod-schema`'s Data Store
 * Boundaries rule to validate on write as well as on read.
 */
export function encodeHistoryEntryPlayers(
  players: readonly HistoryEntryPlayer[],
): readonly StoredPlayer[] {
  const stored: readonly StoredPlayer[] = players.map((player) => ({
    holding: encodeHolding(player.holding),
    result: player.result,
    name: player.name,
  }));
  return storedPlayersSchema.parse(stored);
}

/**
 * the inverse of `encodeHistoryEntryPlayers`. `value` is whatever
 * `@/core/db/schema.ts`'s `historyEntries.players` column (`{ mode: 'json' }`)
 * already ran through `JSON.parse` — typed `unknown` there for exactly this
 * reason. validates it against `storedPlayersSchema` with `.safeParse()`,
 * for the same reason and with the same non-throwing `DecodeResult`
 * `decodeHistoryEntryBoard` above documents and returns.
 */
export function decodeHistoryEntryPlayers(
  value: unknown,
): DecodeResult<readonly HistoryEntryPlayer[]> {
  const parsed = storedPlayersSchema.safeParse(value);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }
  try {
    return {
      success: true,
      data: parsed.data.map((player) => ({
        holding: decodeHolding(player.holding),
        result: player.result,
        name: player.name,
      })),
    };
  } catch (error) {
    return { success: false, error };
  }
}
