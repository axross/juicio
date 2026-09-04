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
 * one row per fixed `(axis, value)` pair across the four tag axes
 * docs/specs/hand-ranges.md's Preset section fixes (Position, # of
 * Players, Depth, Action) — the 17 combinations this migration seeds and
 * nothing else creates or removes.
 */
export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    axis: text('axis').notNull(),
    value: text('value').notNull(),
  },
  (table) => [unique('tags_axis_value_unique').on(table.axis, table.value)],
);

/**
 * associates a `presets` row with the `tags` rows it carries — however
 * many join rows a given Preset has, from zero up to one per selected
 * value across the four axes. `presetId` cascades on delete so a Preset's
 * own tag associations never outlive it; `tagId` carries no cascade action,
 * since `tags` rows are fixed reference data this table only ever points
 * at, never deletes.
 */
export const presetTags = sqliteTable(
  'preset_tags',
  {
    presetId: integer('preset_id')
      .notNull()
      .references(() => presets.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.presetId, table.tagId] })],
);
