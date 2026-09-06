import { desc, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { historyEntries } from '@/core/db/schema';
import { reportError } from '@/core/instrumentation/report-error';
import type { Card } from '@/shared/model/card';

import type { HistoryEntry, HistoryEntryPlayer } from '../model/history-entry';
import {
  decodeHistoryEntryBoard,
  decodeHistoryEntryPlayers,
  encodeHistoryEntryBoard,
  encodeHistoryEntryPlayers,
} from '../model/history-entry-codec';

/**
 * what a caller supplies to save a new History Entry — every `HistoryEntry`
 * field except `id`, which `saveHistoryEntry` below leaves to the
 * `history_entries` table's own autoincrement primary key (see
 * `@/core/db/schema.ts`'s doc comment on `historyEntries`).
 */
export type NewHistoryEntry = {
  readonly calculatedAt: number;
  readonly board: readonly Card[];
  readonly players: readonly HistoryEntryPlayer[];
};

/**
 * saves `entry` as a new History Entry. the sole write path this feature
 * exposes — no update operation, only save, list, and delete. called from
 * exactly one place today:
 * `@/features/evaluations/adapter/use-equity-evaluation.ts`'s success
 * branch, the instant a running equity evaluation reaches its result, with
 * no explicit save action of the player's own.
 */
export function saveHistoryEntry(entry: NewHistoryEntry): void {
  db.insert(historyEntries)
    .values({
      calculatedAt: entry.calculatedAt,
      board: encodeHistoryEntryBoard(entry.board),
      players: encodeHistoryEntryPlayers(entry.players),
    })
    .run();
}

/**
 * every saved History Entry, most-recently-calculated first. `calculatedAt`
 * ties break on `id` descending — the most recently *saved* of two entries
 * calculated in the same millisecond sorts first — rather than left to
 * SQLite's own unspecified tie order.
 *
 * a row whose `board`/`players` column, once parsed, fails
 * `history-entry-codec.ts`'s schema validation (see its own doc comments) —
 * a shape an older bundle or a hand-edited row could have written — is
 * reported via `reportError` and skipped, rather than thrown, so one
 * shape-mismatched row can never take the whole list down for every other,
 * valid entry: `decodeHistoryEntryBoard`/`decodeHistoryEntryPlayers` each
 * return a `DecodeResult` (`history-entry-codec.ts`'s own doc comment) below
 * rather than throwing, and this function branches on `.success` per row —
 * per `zod-schema`'s Parsing rule against wrapping a throwing parse in a
 * swallowing `try`/`catch` to emulate `.safeParse()`. **that isolation
 * covers only a shape mismatch, not a stored column that isn't even valid
 * JSON.** `board`/`players` are `{ mode: 'json' }` columns
 * (`@/core/db/schema.ts`), so Drizzle's own column mapping already runs
 * `JSON.parse` on every row *inside* the `.all()` call below, before this
 * function's own per-row decoding ever starts — a row whose raw stored text
 * fails to parse as JSON at all (reachable only by writing directly to the
 * SQLite file outside this app's own write path, which always goes through
 * `saveHistoryEntry` below) throws out of `.all()` itself and takes the
 * whole list down, same as any other query error — Drizzle's own row
 * mapping maps every row's every column eagerly, in one pass, before
 * `.all()` returns.
 */
export function listHistoryEntries(): readonly HistoryEntry[] {
  const rows = db
    .select()
    .from(historyEntries)
    .orderBy(desc(historyEntries.calculatedAt), desc(historyEntries.id))
    .all();

  const entries: HistoryEntry[] = [];
  for (const row of rows) {
    const board = decodeHistoryEntryBoard(row.board);
    if (!board.success) {
      reportError(board.error, { tags: { feature: 'history' }, extra: { historyEntryId: row.id } });
      continue;
    }

    const players = decodeHistoryEntryPlayers(row.players);
    if (!players.success) {
      reportError(players.error, {
        tags: { feature: 'history' },
        extra: { historyEntryId: row.id },
      });
      continue;
    }

    entries.push({
      id: String(row.id),
      calculatedAt: row.calculatedAt,
      board: board.data,
      players: players.data,
    });
  }
  return entries;
}

/**
 * removes the History Entry identified by `id`, leaving every other saved
 * entry unaffected — a no-op if `id` isn't found (SQLite's own `DELETE`
 * already treats a no-match `WHERE` this way; nothing extra to do here).
 */
export function deleteHistoryEntry(id: string): void {
  db.delete(historyEntries)
    .where(eq(historyEntries.id, Number(id)))
    .run();
}
