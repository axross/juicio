import { asc, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { presets, presetTags, tags } from '@/core/db/schema';
import type { HandRange } from '@/shared/model/hand-range';
import type { RankPairKey } from '@/shared/model/rank-pair';

import {
  PresetNotFoundError,
  TAG_AXIS_VALUES,
  type Preset,
  type PresetInput,
  type PresetTags,
  type TagAxis,
} from '../model/preset';

const TAG_AXES = Object.keys(TAG_AXIS_VALUES) as TagAxis[];

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
 * groups `(axis, value)` rows — already joined against the shared `tags`
 * table — into a `PresetTags`, seeding every axis with an empty array first
 * so an axis with no selected value is still present rather than missing.
 * trusts each `axis` string is one of `TagAxis`'s own values, since every
 * row here was itself read back from the `tags` table this issue's own
 * migration seeds with exactly those axes.
 */
function groupTagRows(rows: readonly { axis: string; value: string }[]): PresetTags {
  const grouped = emptyPresetTags();
  for (const row of rows) {
    grouped[row.axis as TagAxis].push(row.value);
  }
  return grouped as PresetTags;
}

/**
 * resolves a `PresetTags` selection into the `tags.id` rows it names,
 * against the fixed 17-row index `loadTagIndex` below reads. Throws if a
 * given `(axis, value)` pair has no seeded `tags` row — this project's
 * migration pre-seeds every combination `TAG_AXIS_VALUES` fixes, so this
 * only fires if a caller passes a value outside that fixed set, which is
 * out of this issue's own scope (issue #175's Assumptions).
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

/** `(axis, value)` → the seeded `tags.id` it resolves to, read fresh so a test's own truncate/reseed is always reflected. */
function loadTagIndex(): Map<string, number> {
  const rows = db.select({ id: tags.id, axis: tags.axis, value: tags.value }).from(tags).all();
  return new Map(rows.map((row) => [`${row.axis}:${row.value}`, row.id]));
}

/**
 * reads one stored Preset by id, or `undefined` if none matches — the
 * shared read both `getPreset` and every write below (to return the state
 * they just persisted) build on. Orders a multi-select axis's own values by
 * `tags.id` ascending, which this issue's own migration seeds in
 * `TAG_AXIS_VALUES`'s declared order, so two selected values on one axis
 * come back in that same fixed order rather than in whatever order SQLite's
 * join happened to produce.
 */
function readPreset(id: number): Preset | undefined {
  const presetRow = db.select().from(presets).where(eq(presets.id, id)).all()[0];
  if (!presetRow) {
    return undefined;
  }

  const tagRows = db
    .select({ axis: tags.axis, value: tags.value })
    .from(presetTags)
    .innerJoin(tags, eq(presetTags.tagId, tags.id))
    .where(eq(presetTags.presetId, id))
    .orderBy(asc(tags.id))
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

  const [{ id }] = db
    .insert(presets)
    .values({ name: input.name, handRange: serializeHandRange(input.handRange) })
    .returning({ id: presets.id })
    .all();

  if (tagIds.length > 0) {
    db.insert(presetTags)
      .values(tagIds.map((tagId) => ({ presetId: id, tagId })))
      .run();
  }

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
    .select({ presetId: presetTags.presetId, axis: tags.axis, value: tags.value })
    .from(presetTags)
    .innerJoin(tags, eq(presetTags.tagId, tags.id))
    .orderBy(asc(tags.id))
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
 * stored Preset, the same way `getPreset` does, rather than creating one —
 * this issue's own plan settles no upsert behaviour, only a replace of an
 * already-existing Preset.
 *
 * checks the Preset exists and resolves every tag id — both able to throw
 * — before writing anything, for the same reason `createPreset` resolves
 * its own tag ids first.
 */
export async function updatePreset(id: number, input: PresetInput): Promise<Preset> {
  const existing = db.select({ id: presets.id }).from(presets).where(eq(presets.id, id)).all()[0];
  if (!existing) {
    throw new PresetNotFoundError(id);
  }
  const tagIds = resolveTagIds(input.tags, loadTagIndex());

  db.update(presets)
    .set({ name: input.name, handRange: serializeHandRange(input.handRange) })
    .where(eq(presets.id, id))
    .run();

  db.delete(presetTags).where(eq(presetTags.presetId, id)).run();

  if (tagIds.length > 0) {
    db.insert(presetTags)
      .values(tagIds.map((tagId) => ({ presetId: id, tagId })))
      .run();
  }

  return getPreset(id);
}

/**
 * hard-deletes a Preset by its id, along with its own tag associations —
 * `preset_tags` join rows are deleted explicitly here, rather than left to
 * `preset_tags.preset_id`'s foreign-key cascade: SQLite only enforces a
 * foreign key at all once a connection runs `PRAGMA foreign_keys = ON`,
 * which nothing in this project's Drizzle client (`@/core/db/client.ts`) or
 * its Jest mock does, so relying on the cascade alone would silently leave
 * orphaned join rows behind. Deleting an id with no matching Preset is a
 * no-op, not an error — this issue's own plan requires `getPreset` and
 * `updatePreset` to raise for a missing id, but states nothing that asks a
 * repeat or no-op delete to.
 */
export async function deletePreset(id: number): Promise<void> {
  db.delete(presetTags).where(eq(presetTags.presetId, id)).run();
  db.delete(presets).where(eq(presets.id, id)).run();
}
