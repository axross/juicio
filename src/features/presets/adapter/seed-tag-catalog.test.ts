import { asc, eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { tagAxes, tagValues } from '@/core/db/schema';

import { seedTagCatalog } from './seed-tag-catalog';

// the 4 axes and their 17 values docs/specs/hand-ranges.md's Preset section
// table fixes, spelled out independently here rather than imported from
// `./seed-tag-catalog`'s own `TAG_CATALOG` — a wrong seed and a wrong
// catalog copied from the same typo would still agree, the same reasoning
// `@/core/db/schema.test.ts` (this issue's predecessor) already applied to
// its own fixture. This file's own subject is `seedTagCatalog`'s
// insert-if-missing behaviour, not the catalog's contents.
const FIXED_AXES = ['position', 'players', 'stack', 'action'];
const FIXED_VALUES_BY_AXIS: Readonly<Record<string, readonly string[]>> = {
  position: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  players: ['Heads-up', '6max', '9max'],
  stack: ['200BB', '150BB', '100BB', '75BB'],
  action: ['Open', 'Call', '3bet', '4bet'],
};

describe('seedTagCatalog()', () => {
  afterEach(() => {
    // this file's own subject writes to `tag_values` and `tag_axes`, so
    // both are truncated here — the two tables this file's tests write to,
    // per docs/conventions/testing.md's Database-Backed Tests section.
    db.delete(tagValues).run();
    db.delete(tagAxes).run();
  });

  it('inserts exactly 4 tag_axes rows and 17 tag_values rows against a freshly migrated (empty) database', async () => {
    await seedTagCatalog();

    const axisRows = db.select({ axis: tagAxes.axis }).from(tagAxes).all();
    const valueRows = db.select({ value: tagValues.value }).from(tagValues).all();

    expect(axisRows).toHaveLength(4);
    expect(axisRows.map((row) => row.axis).sort()).toEqual([...FIXED_AXES].sort());
    expect(valueRows).toHaveLength(17);
  });

  it("seeds every axis with exactly its own fixed values, in that axis's own declared order", async () => {
    await seedTagCatalog();

    for (const axis of FIXED_AXES) {
      const [axisRow] = db
        .select({ id: tagAxes.id })
        .from(tagAxes)
        .where(eq(tagAxes.axis, axis))
        .all();
      const values = db
        .select({ value: tagValues.value })
        .from(tagValues)
        .where(eq(tagValues.axisId, axisRow.id))
        .orderBy(asc(tagValues.id))
        .all();

      expect(values.map((row) => row.value)).toEqual(FIXED_VALUES_BY_AXIS[axis]);
    }
  });

  it('makes no duplicate inserts and leaves existing rows unchanged when run again against an already-seeded database', async () => {
    await seedTagCatalog();
    const firstAxisRows = db.select().from(tagAxes).all();
    const firstValueRows = db.select().from(tagValues).all();

    await seedTagCatalog();
    const secondAxisRows = db.select().from(tagAxes).all();
    const secondValueRows = db.select().from(tagValues).all();

    expect(secondAxisRows).toHaveLength(4);
    expect(secondValueRows).toHaveLength(17);
    expect(secondAxisRows).toEqual(firstAxisRows);
    expect(secondValueRows).toEqual(firstValueRows);
  });
});
