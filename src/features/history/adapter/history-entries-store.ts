import { desc, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { historyEntries } from '@/core/db/schema';
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
 * exposes — issue #178's plan requires no update operation, only save,
 * list, and delete. called from exactly one place today:
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
 */
export function listHistoryEntries(): readonly HistoryEntry[] {
  const rows = db
    .select()
    .from(historyEntries)
    .orderBy(desc(historyEntries.calculatedAt), desc(historyEntries.id))
    .all();

  return rows.map((row) => ({
    id: String(row.id),
    calculatedAt: row.calculatedAt,
    board: decodeHistoryEntryBoard(row.board),
    players: decodeHistoryEntryPlayers(row.players),
  }));
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
