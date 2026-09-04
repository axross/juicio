import { sql } from 'drizzle-orm';

import { db } from './client';
import { tags } from './schema';

// the 17 `(axis, value)` rows docs/specs/hand-ranges.md's Preset section
// table fixes, spelled out independently here rather than imported from
// `@/features/presets/model/preset`'s own `TAG_AXIS_VALUES` — `core/`
// imports from none of the other tiers
// (docs/conventions/directory-structure.md), and importing that constant
// here would also make this test tautological: a wrong seed and a wrong
// `TAG_AXIS_VALUES` copied from the same typo would still agree.
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

// `db` here is the in-memory client from `__mocks__/client.ts`
// (`jest.mock('@/core/db/client')` in jest.setup.ts) — a real SQLite
// database that has replayed every one of this project's committed
// migrations, including this issue's own. Nothing in this file writes to
// any table, so it needs no `afterEach` truncation — see
// docs/conventions/testing.md's Database-Backed Tests section.
describe('the presets/tags/preset_tags migration', () => {
  it('creates presets with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('presets')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'name', 'hand_range']);
  });

  it('creates tags with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('tags')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'axis', 'value']);
  });

  it('creates preset_tags with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('preset_tags')`);

    expect(columns.map((column) => column.name)).toEqual(['preset_id', 'tag_id']);
  });

  it('seeds tags with exactly the 17 (axis, value) rows docs/specs/hand-ranges.md fixes', () => {
    const rows = db.select({ axis: tags.axis, value: tags.value }).from(tags).all();

    expect(rows).toHaveLength(17);
    expect(rows).toEqual(expect.arrayContaining(FIXED_TAG_ROWS));
  });
});
