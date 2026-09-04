import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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

/**
 * a Preset (docs/glossary.md, docs/specs/hand-ranges.md's Preset section):
 * a named, reusable hand range. `handRange` stores the app's rank-pair set
 * (`@/shared/model/hand-range`'s `HandRange`) JSON-encoded as an array of
 * `RankPairKey` strings, e.g. `["AA","AKs","72o"]` — denormalized, unlike
 * the tag axes below, per issue #175's Alternatives-considered subsection.
 */
export const presets = sqliteTable('presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  handRange: text('hand_range').notNull(),
});

/**
 * one row per fixed tag axis docs/specs/hand-ranges.md's Preset section
 * fixes (Position, # of Players, Depth, Action) — the 4 axis keys
 * (`position`/`players`/`stack`/`action`), each with its own identity
 * separate from the values it owns, so a later axis-level property (a
 * display label, a sort order) has somewhere to live without becoming a
 * column repeated on every one of that axis's `tag_values` rows. Neither
 * this table nor `tag_values` below is seeded by this table's own
 * migration — issue #175's revised plan moves seeding to idempotent
 * application-bootstrap code (`@/features/presets/adapter/seed-tag-catalog`)
 * instead, so the migration only creates the table shape.
 */
export const tagAxes = sqliteTable('tag_axes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  axis: text('axis').notNull().unique(),
});

/**
 * one row per fixed value belonging to a `tag_axes` row — the 17
 * `(axis, value)` combinations docs/specs/hand-ranges.md's Preset section
 * table fixes, normalized here rather than folded into a single shared
 * `(axis, value)` table so a value's owning axis is a foreign key, not a
 * repeated string column. Bootstrap-seeded, not migration-seeded — see
 * `tagAxes`'s own doc comment above.
 */
export const tagValues = sqliteTable(
  'tag_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    axisId: integer('axis_id')
      .notNull()
      .references(() => tagAxes.id),
    value: text('value').notNull(),
  },
  (table) => [unique('tag_values_axis_id_value_unique').on(table.axisId, table.value)],
);

/**
 * associates a `presets` row with the `tag_values` rows it carries —
 * however many join rows a given Preset has, from zero up to one per
 * selected value across the four axes. `presetId` cascades on delete so a
 * Preset's own tag associations never outlive it; `tagValueId` carries no
 * cascade action, since `tag_values` rows are fixed reference data this
 * table only ever points at, never deletes.
 */
export const presetTags = sqliteTable(
  'preset_tags',
  {
    presetId: integer('preset_id')
      .notNull()
      .references(() => presets.id, { onDelete: 'cascade' }),
    tagValueId: integer('tag_value_id')
      .notNull()
      .references(() => tagValues.id),
  },
  (table) => [primaryKey({ columns: [table.presetId, table.tagValueId] })],
);
