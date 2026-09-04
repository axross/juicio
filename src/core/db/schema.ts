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
