import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * minimal table proving the Drizzle + expo-sqlite migration path runs.
 * this is not the application's data model — later stages own that.
 */
export const appMeta = sqliteTable('app_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});

/**
 * one saved History Entry (issue #178) — a record of one past equity
 * calculation, saved automatically the instant a running evaluation reaches
 * its successful result
 * (`@/features/evaluations/adapter/use-equity-evaluation.ts`). `id` is this
 * table's own autoincrement primary key, not a counter this app generates
 * itself: unlike `@/features/evaluations/model/player.ts`'s in-memory
 * `createPlayerId` (a module-scope counter that resets every fresh JS
 * context, fine for state that lives only as long as one app session), a
 * saved entry's identifier has to stay unique across every session the app
 * has ever run, which SQLite's own `AUTOINCREMENT` already guarantees for
 * free. `calculatedAt` is indexed nowhere of its own — `@/features/history/
 * adapter/history-entries-store.ts`'s `listHistoryEntries` orders by it
 * directly, and this table is never expected to grow large enough (no
 * entry cap or pruning policy — issue #178's own stated non-goal) for that
 * to need a dedicated index. `board` and `players` are each a JSON-encoded
 * string — `@/features/history/model/history-entry-codec.ts`'s
 * `encodeHistoryEntryBoard`/`encodeHistoryEntryPlayers` produce them, and
 * their own decode counterparts read them back — rather than normalized
 * child rows: nothing in this feature's own functional requirements queries
 * into a board's individual cards or a player's individual result, so a
 * single encoded column per saved entry is the simplest layout that
 * satisfies them.
 */
export const historyEntries = sqliteTable('history_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  calculatedAt: integer('calculated_at').notNull(),
  board: text('board').notNull(),
  players: text('players').notNull(),
});
