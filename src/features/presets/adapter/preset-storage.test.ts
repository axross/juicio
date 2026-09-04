import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { presets, presetTags, tagAxes, tagValues } from '@/core/db/schema';

import { PresetNotFoundError, type PresetTags } from '../model/preset';
import { createPreset, deletePreset, getPreset, listPresets, updatePreset } from './preset-storage';

const NO_TAGS: PresetTags = { position: [], players: [], stack: [], action: [] };

// the 4 axes and their 17 values docs/specs/hand-ranges.md's Preset section
// table fixes, spelled out independently here — as `@/core/db/schema.test.ts`
// and `seed-tag-catalog.test.ts` each do for their own fixtures — rather
// than seeded through `seedTagCatalog` itself: that function is not the
// unit this file tests, but calling it here would still make its own write
// path (`tag_axes`/`tag_values`) part of what this file depends on to seed
// its fixtures, which docs/conventions/testing.md's Database-Backed Tests
// section reserves for direct Drizzle primitives.
const FIXED_TAG_ROWS = [
  { axis: 'position', value: 'UTG' },
  { axis: 'position', value: 'HJ' },
  { axis: 'position', value: 'CO' },
  { axis: 'position', value: 'BTN' },
  { axis: 'position', value: 'SB' },
  { axis: 'position', value: 'BB' },
  { axis: 'players', value: 'Heads-up' },
  { axis: 'players', value: '6max' },
  { axis: 'players', value: '9max' },
  { axis: 'stack', value: '200BB' },
  { axis: 'stack', value: '150BB' },
  { axis: 'stack', value: '100BB' },
  { axis: 'stack', value: '75BB' },
  { axis: 'action', value: 'Open' },
  { axis: 'action', value: 'Call' },
  { axis: 'action', value: '3bet' },
  { axis: 'action', value: '4bet' },
];

/**
 * seeds an already-persisted Preset directly through Drizzle primitives,
 * never through the adapter functions this file tests —
 * docs/conventions/testing.md's Database-Backed Tests section: pre-existing
 * state a test needs must be seeded this way, not by calling the unit
 * under test, so a defect in `createPreset` can never mask itself by also
 * producing the seed a later assertion reads back.
 */
function seedPreset(
  name: string,
  handRange: readonly string[],
  tagSelections: readonly { axis: string; value: string }[],
): number {
  const [{ id }] = db
    .insert(presets)
    .values({ name, handRange: JSON.stringify(handRange) })
    .returning({ id: presets.id })
    .all();

  for (const { axis, value } of tagSelections) {
    const [tagValueRow] = db
      .select({ id: tagValues.id })
      .from(tagValues)
      .innerJoin(tagAxes, eq(tagValues.axisId, tagAxes.id))
      .where(and(eq(tagAxes.axis, axis), eq(tagValues.value, value)))
      .all();
    db.insert(presetTags).values({ presetId: id, tagValueId: tagValueRow.id }).run();
  }

  return id;
}

describe('preset-storage', () => {
  beforeAll(() => {
    // `tag_axes`/`tag_values` are fixed reference data this whole file
    // reads but never writes — seeded once, up front, via direct Drizzle
    // primitives (see `FIXED_TAG_ROWS`'s own comment above) rather than by
    // `seedTagCatalog`, the app's own bootstrap step this project runs at
    // launch, not from a test.
    for (const axis of ['position', 'players', 'stack', 'action']) {
      db.insert(tagAxes).values({ axis }).run();
    }
    for (const { axis, value } of FIXED_TAG_ROWS) {
      const [axisRow] = db
        .select({ id: tagAxes.id })
        .from(tagAxes)
        .where(eq(tagAxes.axis, axis))
        .all();
      db.insert(tagValues).values({ axisId: axisRow.id, value }).run();
    }
  });

  afterEach(() => {
    // only `preset_tags` and `presets` — the two tables this file writes
    // to. `tag_axes`/`tag_values` are the fixed reference data `beforeAll`
    // above seeds once for the whole file; no test here inserts, updates,
    // or deletes either one.
    db.delete(presetTags).run();
    db.delete(presets).run();
  });

  describe('createPreset()', () => {
    it('persists a Preset with a name, a hand range, and a tag selection such that getPreset returns it unchanged', async () => {
      const created = await createPreset({
        name: 'HJ Call against CO 4bet',
        handRange: new Set(['AA', 'AKs', '72o']),
        tags: { position: ['HJ'], players: ['6max'], stack: ['100BB'], action: ['Call'] },
      });

      expect(created).toEqual({
        id: created.id,
        name: 'HJ Call against CO 4bet',
        handRange: new Set(['AA', 'AKs', '72o']),
        tags: { position: ['HJ'], players: ['6max'], stack: ['100BB'], action: ['Call'] },
      });
      expect(await getPreset(created.id)).toEqual(created);
    });

    it('persists a Preset with an empty hand range and every tag axis left with no selected value', async () => {
      const created = await createPreset({
        name: 'Untitled',
        handRange: new Set(),
        tags: NO_TAGS,
      });

      expect(await getPreset(created.id)).toEqual({
        id: created.id,
        name: 'Untitled',
        handRange: new Set(),
        tags: NO_TAGS,
      });
    });

    it("persists a Preset carrying more than one selected value on the same tag axis, read back in that axis's own fixed order", async () => {
      // input order (`BTN` then `CO`) deliberately does not match this
      // file's own `beforeAll`, which seeds `position` in the fixed order
      // `FIXED_TAG_ROWS` declares (`CO` before `BTN`) — proving the round
      // trip normalizes to that seeded order rather than merely echoing
      // insertion order back.
      const created = await createPreset({
        name: 'Multi-position',
        handRange: new Set(['AA']),
        tags: { position: ['BTN', 'CO'], players: [], stack: [], action: [] },
      });

      expect(await getPreset(created.id)).toEqual({
        id: created.id,
        name: 'Multi-position',
        handRange: new Set(['AA']),
        tags: { position: ['CO', 'BTN'], players: [], stack: [], action: [] },
      });
    });

    it('persists two Presets that share the same name, each independently retrievable by its own id — presets.name carries no UNIQUE constraint, unlike app_meta.key (src/core/db/client.test.ts)', async () => {
      const first = await createPreset({
        name: 'Duplicate name',
        handRange: new Set(['AA']),
        tags: NO_TAGS,
      });
      const second = await createPreset({
        name: 'Duplicate name',
        handRange: new Set(['KK']),
        tags: NO_TAGS,
      });

      expect(first.id).not.toBe(second.id);
      expect(await getPreset(first.id)).toEqual(first);
      expect(await getPreset(second.id)).toEqual(second);
    });

    it('rejects a tag value with no matching seeded tag_values row', async () => {
      await expect(
        createPreset({
          name: 'Bad tag',
          handRange: new Set(),
          tags: { ...NO_TAGS, position: ['Not-a-real-position'] } as unknown as PresetTags,
        }),
      ).rejects.toThrow('No seeded tag row for (position, Not-a-real-position).');
    });
  });

  describe('getPreset()', () => {
    it('raises a PresetNotFoundError for an id with no stored Preset', async () => {
      await expect(getPreset(999_999)).rejects.toBeInstanceOf(PresetNotFoundError);
    });
  });

  describe('listPresets()', () => {
    it('returns every stored Preset, each with its full name, hand range, and tags', async () => {
      const idA = seedPreset('Preset A', ['AA'], [{ axis: 'position', value: 'BTN' }]);
      const idB = seedPreset('Preset B', [], []);

      const list = await listPresets();

      expect(list).toHaveLength(2);
      expect(list).toEqual(
        expect.arrayContaining([
          {
            id: idA,
            name: 'Preset A',
            handRange: new Set(['AA']),
            tags: { ...NO_TAGS, position: ['BTN'] },
          },
          { id: idB, name: 'Preset B', handRange: new Set(), tags: NO_TAGS },
        ]),
      );
    });

    it('reflects an update and a deletion made since the last list call', async () => {
      const kept = seedPreset('Kept', ['22'], [{ axis: 'action', value: 'Open' }]);
      const removed = seedPreset('Removed', [], []);

      await updatePreset(kept, {
        name: 'Kept, renamed',
        handRange: new Set(['AKs']),
        tags: { ...NO_TAGS, action: ['4bet'] },
      });
      await deletePreset(removed);

      const list = await listPresets();

      expect(list).toEqual([
        {
          id: kept,
          name: 'Kept, renamed',
          handRange: new Set(['AKs']),
          tags: { ...NO_TAGS, action: ['4bet'] },
        },
      ]);
    });

    it('returns an empty list when no Preset is stored', async () => {
      expect(await listPresets()).toEqual([]);
    });
  });

  describe('updatePreset()', () => {
    it("replaces an existing Preset's full state — name, hand range, and all four tag axes — reflected by a subsequent getPreset", async () => {
      const id = seedPreset('Old name', ['22'], [{ axis: 'action', value: 'Open' }]);

      const updated = await updatePreset(id, {
        name: 'New name',
        handRange: new Set(['AKs']),
        tags: { position: ['BTN'], players: [], stack: ['200BB'], action: [] },
      });

      const expected = {
        id,
        name: 'New name',
        handRange: new Set(['AKs']),
        tags: { position: ['BTN'], players: [], stack: ['200BB'], action: [] },
      };
      expect(updated).toEqual(expected);
      expect(await getPreset(id)).toEqual(expected);
    });

    it('raises a PresetNotFoundError for an id with no stored Preset', async () => {
      await expect(
        updatePreset(999_999, { name: 'x', handRange: new Set(), tags: NO_TAGS }),
      ).rejects.toBeInstanceOf(PresetNotFoundError);
    });
  });

  describe('deletePreset()', () => {
    it('removes a Preset so a subsequent list and get-by-id no longer return it, and get-by-id then raises the same not-found error an unused id would', async () => {
      const id = seedPreset('To delete', ['AA'], [{ axis: 'stack', value: '75BB' }]);

      await deletePreset(id);

      expect(await listPresets()).toEqual([]);
      await expect(getPreset(id)).rejects.toBeInstanceOf(PresetNotFoundError);
    });

    it('is a no-op for an id with no stored Preset', async () => {
      await expect(deletePreset(999_999)).resolves.toBeUndefined();
    });
  });
});
