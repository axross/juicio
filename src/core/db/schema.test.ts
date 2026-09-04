import { sql } from 'drizzle-orm';

import { db } from './client';

// `db` here is the in-memory client from `__mocks__/client.ts`
// (`jest.mock('@/core/db/client')` in jest.setup.ts) — a real SQLite
// database that has replayed every one of this project's committed
// migrations, including this issue's own. Nothing in this file writes to
// any table, so it needs no `afterEach` truncation — see
// docs/conventions/testing.md's Database-Backed Tests section.
//
// this migration seeds no rows — issue #175's revised plan moves seeding
// of the fixed tag catalog into idempotent application-bootstrap code
// (`@/features/presets/adapter/seed-tag-catalog`, tested in its own
// colocated `seed-tag-catalog.test.ts`) rather than into migration SQL, so
// this file only proves the table shapes the migration itself declares.
describe('the presets/tag_axes/tag_values/preset_tags migration', () => {
  it('creates presets with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('presets')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'name', 'hand_range']);
  });

  it('creates tag_axes with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('tag_axes')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'axis']);
  });

  it('creates tag_values with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('tag_values')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'axis_id', 'value']);
  });

  it('creates preset_tags with the columns the committed migration declares', () => {
    const columns = db.all<{ name: string }>(sql`pragma table_info('preset_tags')`);

    expect(columns.map((column) => column.name)).toEqual(['preset_id', 'tag_value_id']);
  });
});
