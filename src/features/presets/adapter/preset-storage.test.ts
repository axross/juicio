import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { presets, presetTags, tags } from '@/core/db/schema';

import { PresetNotFoundError, type PresetTags } from '../model/preset';
import { createPreset, deletePreset, getPreset, listPresets, updatePreset } from './preset-storage';

const NO_TAGS: PresetTags = { position: [], players: [], stack: [], action: [] };

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
    const [tagRow] = db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.axis, axis), eq(tags.value, value)))
      .all();
    db.insert(presetTags).values({ presetId: id, tagId: tagRow.id }).run();
  }

  return id;
}

describe('preset-storage', () => {
  afterEach(() => {
    // only `preset_tags` and `presets` — the two tables this file writes
    // to. `tags` is fixed reference data this issue's own migration seeds
    // once and no test here inserts, updates, or deletes.
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
      // input order (`BTN` then `CO`) deliberately does not match
      // `TAG_AXIS_VALUES.position`'s own declared order (`CO` before
      // `BTN`) — proving the round trip normalizes to the fixed order
      // rather than merely echoing insertion order back.
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
