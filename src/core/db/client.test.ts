import { DrizzleQueryError, eq, sql } from 'drizzle-orm';

import { db } from './client';
import { appMeta } from './schema';

// `db` here is the in-memory client from `__mocks__/client.ts`
// (`jest.mock('@/core/db/client')` in jest.setup.ts), so every assertion
// below runs against a real SQLite database that has replayed this
// project's committed migration, not a stub.
describe('app_meta', () => {
  afterEach(() => {
    // only `app_meta` — the one table this file writes to.
    db.delete(appMeta).run();
  });

  it('creates app_meta with the columns the committed migration declares', () => {
    // reads SQLite's own catalog rather than going through `appMeta`, so this
    // proves the *migration SQL* created the table with these columns — a
    // `schema.ts` typo that renamed or dropped a column would still pass a
    // test that only round-tripped through the schema object below.
    const columns = db.all<{ name: string }>(sql`pragma table_info('app_meta')`);

    expect(columns.map((column) => column.name)).toEqual(['id', 'key', 'value']);
  });

  it('round-trips a row through the schema object the migration and schema.ts agree on', () => {
    db.insert(appMeta).values({ key: 'schema-version', value: '1' }).run();

    // selects only `key`/`value` — `id` is SQLite's own AUTOINCREMENT
    // sequence, shared across every test in this file's lifetime, so
    // asserting it here would couple this test to declaration order rather
    // than to the round-trip property it is named for.
    const rows = db
      .select({ key: appMeta.key, value: appMeta.value })
      .from(appMeta)
      .where(eq(appMeta.key, 'schema-version'))
      .all();

    expect(rows).toEqual([{ key: 'schema-version', value: '1' }]);
  });

  it('rejects a second row with a duplicate key, per the migration UNIQUE constraint', () => {
    // the UNIQUE constraint on `key` exists only in the migration SQL —
    // nothing in `schema.ts`'s own types would catch a duplicate insert on
    // its own. drizzle-orm wraps the underlying `node:sqlite` error in a
    // `DrizzleQueryError`, putting the message that actually proves the
    // constraint reached the database on `.cause` rather than on the thrown
    // error's own `.message` — so a bare `toThrow()` here would pass for any
    // thrown error, not only this one.
    db.insert(appMeta).values({ key: 'k', value: 'a' }).run();

    let caught: DrizzleQueryError | undefined;

    try {
      db.insert(appMeta).values({ key: 'k', value: 'b' }).run();
    } catch (error) {
      caught = error as DrizzleQueryError;
    }

    expect(caught).toBeInstanceOf(DrizzleQueryError);
    expect(caught?.cause?.message).toBe('UNIQUE constraint failed: app_meta.key');
  });

  it('starts from an empty table, proving the afterEach truncation above works', () => {
    expect(db.select().from(appMeta).all()).toEqual([]);
  });
});
