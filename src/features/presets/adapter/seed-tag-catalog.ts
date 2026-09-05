import { eq } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { tagAxes, tagValues } from '@/core/db/schema';

import type { TagAxis } from '../model/preset';

/**
 * the canonical `(axis, value)` catalog docs/specs/hand-ranges.md's Preset
 * section table fixes — the 4 axes and their 17 values, in the order each
 * axis's own values are declared. This is the **one** place this catalog is
 * spelled out; nothing else in this project — no migration SQL, no second
 * TypeScript constant — holds a second copy of it, per issue #175's revised
 * plan. `seedTagCatalog` below reads it to seed the database;
 * `@/features/presets/adapter/filter-presets.ts` (issue #176) also reads it
 * directly, to list every value a per-axis filter picker offers, rather than
 * querying it back out of the seeded `tag_axes`/`tag_values` tables — both
 * readers see the identical, single-sourced list either way.
 */
export const TAG_CATALOG: { readonly [Axis in TagAxis]: readonly string[] } = {
  position: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  players: ['Heads-up', '6max', '9max'],
  stack: ['200BB', '150BB', '100BB', '75BB'],
  action: ['Open', 'Call', '3bet', '4bet'],
};

/**
 * idempotently seeds `tag_axes` and `tag_values` with `TAG_CATALOG`'s 4
 * axes and 17 values — insert-if-missing, via each table's own unique
 * constraint (`tag_axes.axis`, `tag_values (axis_id, value)`), so a repeat
 * call against an already-seeded database makes no duplicate inserts and
 * leaves the existing rows unchanged. Runs once, at app bootstrap, once
 * migrations have succeeded (see `use-seed-tag-catalog.ts`) — the migration
 * itself creates only the (empty) table shape, never seed rows, per issue
 * #175's revised plan.
 *
 * one transaction for the whole catalog: each axis's own row is inserted
 * (or left alone, on conflict), re-read for its id either way, and that id
 * is what its values insert against — a fresh axis and a pre-existing one
 * are handled by the same read-after-write, so this needs no separate
 * first-run/repeat-run branch.
 */
export async function seedTagCatalog(): Promise<void> {
  db.transaction((tx) => {
    for (const axis of Object.keys(TAG_CATALOG) as TagAxis[]) {
      tx.insert(tagAxes).values({ axis }).onConflictDoNothing().run();

      const [axisRow] = tx
        .select({ id: tagAxes.id })
        .from(tagAxes)
        .where(eq(tagAxes.axis, axis))
        .all();

      tx.insert(tagValues)
        .values(TAG_CATALOG[axis].map((value) => ({ axisId: axisRow.id, value })))
        .onConflictDoNothing()
        .run();
    }
  });
}
