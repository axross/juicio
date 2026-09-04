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
 * to need a dedicated index. `board` and `players` are each a `text` column
 * declared with Drizzle's own `{ mode: 'json' }` (verified against the
 * `drizzle-orm@1.0.0-rc.5-ab785fc` `package.json` pins, in that version's
 * own `sqlite-core/columns/text.d.ts`) rather than normalized child rows:
 * nothing in this feature's own functional requirements queries into a
 * board's individual cards or a player's individual result, so a single
 * encoded column per saved entry is the simplest layout that satisfies
 * them. `{ mode: 'json' }` is what owns the `JSON.stringify`/`JSON.parse`
 * round trip now — `@/features/history/model/history-entry-codec.ts`'s
 * `encodeHistoryEntryBoard`/`encodeHistoryEntryPlayers` (and their own
 * decode counterparts) only build and validate the JSON-safe intermediate
 * shape a driver value already is or will become; neither calls
 * `JSON.stringify`/`JSON.parse` itself any more. No `.$type<...>()`
 * override is applied here: Drizzle's own `data: unknown` for a
 * `json`-mode column already reads as "not yet trusted," which matches
 * this project's own Data Store Boundaries rule that a stored column is
 * validated, not cast, before its shape is trusted — see that codec
 * module's own doc comment for the schema that does the validating.
 */
export const historyEntries = sqliteTable('history_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  calculatedAt: integer('calculated_at').notNull(),
  board: text('board', { mode: 'json' }).notNull(),
  players: text('players', { mode: 'json' }).notNull(),
});
