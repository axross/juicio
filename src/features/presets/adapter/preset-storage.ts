import { asc, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { presets, presetTags, tagAxes, tagValues } from '@/core/db/schema';
import type { HandRange } from '@/shared/model/hand-range';
import type { RankPairKey } from '@/shared/model/rank-pair';

import {
  PresetNotFoundError,
  type Preset,
  type PresetInput,
  type PresetTags,
  type TagAxis,
} from '../model/preset';

/**
 * the four axis keys `TagAxis` fixes, spelled out again here since
 * `TagAxis` moved to a plain literal union and no longer derives from a
 * runtime catalog object to read keys off of. This
 * is not a second copy of the tag *catalog* — the 17 values themselves live
 * in exactly one place, `@/features/presets/adapter/seed-tag-catalog` — only
 * the 4 axis names, which the spec fixes structurally and `TagAxis` already
 * pins at the type level; `satisfies` keeps the two from drifting apart.
 */
const TAG_AXES = ['position', 'players', 'stack', 'action'] as const satisfies readonly TagAxis[];

function serializeHandRange(handRange: HandRange): string {
  return JSON.stringify(Array.from(handRange));
}

function deserializeHandRange(raw: string): HandRange {
  return new Set(JSON.parse(raw) as RankPairKey[]);
}

function emptyPresetTags(): { -readonly [Axis in TagAxis]: string[] } {
  return { position: [], players: [], stack: [], action: [] };
}

/**
 * groups `(axis, value)` rows — already joined across `tag_values` and its
 * owning `tag_axes` row — into a `PresetTags`, seeding every axis with an
 * empty array first so an axis with no selected value is still present
 * rather than missing. trusts each `axis` string is one of `TagAxis`'s own
 * values, since every row here was itself read back from `tag_axes`, which
 * `seed-tag-catalog.ts`'s bootstrap step seeds with exactly those axes.
 */
function groupTagRows(rows: readonly { axis: string; value: string }[]): PresetTags {
  const grouped = emptyPresetTags();
  for (const row of rows) {
    grouped[row.axis as TagAxis].push(row.value);
  }
  return grouped as PresetTags;
}

/**
 * resolves a `PresetTags` selection into the `tag_values.id` rows it names,
 * against the fixed index `loadTagIndex` below reads. Throws if a given
 * `(axis, value)` pair has no seeded `tag_values` row — this project's
 * bootstrap step (`seed-tag-catalog.ts`) seeds every combination its own
 * canonical catalog fixes, so this only fires if a caller passes a value
 * outside that fixed set, or if bootstrap seeding has not yet run.
 */
function resolveTagIds(
  presetTagsValue: PresetTags,
  tagIndex: ReadonlyMap<string, number>,
): number[] {
  const ids: number[] = [];
  for (const axis of TAG_AXES) {
    for (const value of presetTagsValue[axis]) {
      const id = tagIndex.get(`${axis}:${value}`);
      if (id === undefined) {
        throw new Error(`No seeded tag row for (${axis}, ${value}).`);
      }
      ids.push(id);
    }
  }
  return ids;
}

/** `(axis, value)` → the seeded `tag_values.id` it resolves to, read fresh so a test's own truncate/reseed is always reflected. */
function loadTagIndex(): Map<string, number> {
  const rows = db
    .select({ id: tagValues.id, axis: tagAxes.axis, value: tagValues.value })
    .from(tagValues)
    .innerJoin(tagAxes, eq(tagValues.axisId, tagAxes.id))
    .all();
  return new Map(rows.map((row) => [`${row.axis}:${row.value}`, row.id]));
}

/**
 * reads one stored Preset by id, or `undefined` if none matches — the
 * shared read both `getPreset` and every write below (to return the state
 * they just persisted) build on. Orders a multi-select axis's own values by
 * `tag_values.id` ascending, which `seed-tag-catalog.ts`'s bootstrap step
 * seeds in its own canonical catalog's declared order, so two selected
 * values on one axis come back in that same fixed order rather than in
 * whatever order SQLite's join happened to produce.
 */
function readPreset(id: number): Preset | undefined {
  const presetRow = db.select().from(presets).where(eq(presets.id, id)).all()[0];
  if (!presetRow) {
    return undefined;
  }

  const tagRows = db
    .select({ axis: tagAxes.axis, value: tagValues.value })
    .from(presetTags)
    .innerJoin(tagValues, eq(presetTags.tagValueId, tagValues.id))
    .innerJoin(tagAxes, eq(tagValues.axisId, tagAxes.id))
    .where(eq(presetTags.presetId, id))
    .orderBy(asc(tagValues.id))
    .all();

  return {
    id: presetRow.id,
    name: presetRow.name,
    handRange: deserializeHandRange(presetRow.handRange),
    tags: groupTagRows(tagRows),
  };
}

/**
 * creates a new Preset from a name, a hand range (which may be empty), and
 * a selection (zero or more values) for each of the four tag axes;
 * immediately retrievable, unchanged, by the returned `Preset`'s `id`.
 *
 * resolves every tag id — the one step able to throw, per
 * `resolveTagIds`'s own doc comment — before writing anything, so a bad
 * `(axis, value)` pair never leaves a `presets` row without its tags.
 */
export async function createPreset(input: PresetInput): Promise<Preset> {
  const tagIds = resolveTagIds(input.tags, loadTagIndex());

  const id = db.transaction((tx) => {
    const [{ id: insertedId }] = tx
      .insert(presets)
      .values({ name: input.name, handRange: serializeHandRange(input.handRange) })
      .returning({ id: presets.id })
      .all();

    if (tagIds.length > 0) {
      tx.insert(presetTags)
        .values(tagIds.map((tagValueId) => ({ presetId: insertedId, tagValueId })))
        .run();
    }

    return insertedId;
  });

  // re-reads what was just written rather than echoing `input` back, so a
  // caller's "immediately retrievable, unchanged" guarantee is proven by
  // the same code path `getPreset` uses, not merely assumed.
  return getPreset(id);
}

/** retrieves a single Preset by its id; throws `PresetNotFoundError` when no stored Preset has that id. */
export async function getPreset(id: number): Promise<Preset> {
  const preset = readPreset(id);
  if (!preset) {
    throw new PresetNotFoundError(id);
  }
  return preset;
}

/** retrieves every stored Preset, each with its full name, hand range, and tags. */
export async function listPresets(): Promise<Preset[]> {
  const presetRows = db.select().from(presets).all();

  const tagRows = db
    .select({ presetId: presetTags.presetId, axis: tagAxes.axis, value: tagValues.value })
    .from(presetTags)
    .innerJoin(tagValues, eq(presetTags.tagValueId, tagValues.id))
    .innerJoin(tagAxes, eq(tagValues.axisId, tagAxes.id))
    .orderBy(asc(tagValues.id))
    .all();

  const tagRowsByPresetId = new Map<number, { axis: string; value: string }[]>();
  for (const row of tagRows) {
    const rowsForPreset = tagRowsByPresetId.get(row.presetId) ?? [];
    rowsForPreset.push({ axis: row.axis, value: row.value });
    tagRowsByPresetId.set(row.presetId, rowsForPreset);
  }

  return presetRows.map((presetRow) => ({
    id: presetRow.id,
    name: presetRow.name,
    handRange: deserializeHandRange(presetRow.handRange),
    tags: groupTagRows(tagRowsByPresetId.get(presetRow.id) ?? []),
  }));
}

/**
 * replaces an existing Preset's full state (name, hand range, and all four
 * tag axes) given its id; throws `PresetNotFoundError` for an id with no
 * stored Preset, the same way `getPreset` does, rather than creating one.
 *
 * resolves every tag id — able to throw — before writing anything, for
 * the same reason `createPreset` resolves its own tag ids first. Runs the
 * existence check together with every write in one transaction, so a
 * process interrupted partway through never leaves the Preset's `presets`
 * row and its `preset_tags` rows out of step with each other.
 */
export async function updatePreset(id: number, input: PresetInput): Promise<Preset> {
  const tagIds = resolveTagIds(input.tags, loadTagIndex());

  db.transaction((tx) => {
    const existing = tx.select({ id: presets.id }).from(presets).where(eq(presets.id, id)).all()[0];
    if (!existing) {
      throw new PresetNotFoundError(id);
    }

    tx.update(presets)
      .set({ name: input.name, handRange: serializeHandRange(input.handRange) })
      .where(eq(presets.id, id))
      .run();

    tx.delete(presetTags).where(eq(presetTags.presetId, id)).run();

    if (tagIds.length > 0) {
      tx.insert(presetTags)
        .values(tagIds.map((tagValueId) => ({ presetId: id, tagValueId })))
        .run();
    }
  });

  return getPreset(id);
}

/**
 * hard-deletes a Preset by its id, along with its own tag associations —
 * `preset_tags` join rows are deleted explicitly here, rather than left to
 * `preset_tags.preset_id`'s foreign-key cascade: SQLite only enforces a
 * foreign key at all once a connection runs `PRAGMA foreign_keys = ON`,
 * which nothing in this project's Drizzle client (`@/core/db/client.ts`) or
 * its Jest mock does, so relying on the cascade alone would silently leave
 * orphaned join rows behind. deleting an id with no matching Preset is a
 * no-op, not an error, unlike `getPreset` and `updatePreset`, which both
 * raise for a missing id. Both deletes run in one transaction, so a
 * process interrupted between them never leaves the `presets` row deleted
 * with its `preset_tags` rows still behind, or the reverse.
 */
export async function deletePreset(id: number): Promise<void> {
  db.transaction((tx) => {
    tx.delete(presetTags).where(eq(presetTags.presetId, id)).run();
    tx.delete(presets).where(eq(presets.id, id)).run();
  });
}
