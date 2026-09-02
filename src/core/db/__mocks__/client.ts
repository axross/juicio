import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

// this project's own Jest manual mock for `../client` (see
// https://jestjs.io/docs/manual-mocks#mocking-user-modules), registered
// globally by `jest.mock('@/core/db/client')` in jest.setup.ts. it is a real
// database, not a stub: `node:sqlite`'s `DatabaseSync` backs an in-memory
// SQLite file, and `migrate` below replays this project's own *committed*
// migration files against it — the same files `use-database-migrations.ts`
// replays on a device, through `drizzle-orm/node-sqlite`'s Node-side
// migrator rather than the `expo-sqlite` one the real client uses, since
// `expo-sqlite`'s native module has nothing to load against under Jest.
// running the committed SQL, rather than deriving tables from `schema.ts`,
// is what keeps a test's schema from drifting out of step with what a real
// device's database actually has. see
// docs/decisions/2026-09-02-back-the-jest-database-with-node-sqlite.md for
// why `node:sqlite` won out over `@libsql/client` and `better-sqlite3` —
// mainly, no native dependency and no shared-cache workaround needed to
// isolate `:memory:` databases between test files.
//
// isolation between test files is structural, not something this module
// enforces: Jest gives every test file its own module registry, so each
// file importing this mock evaluates it fresh and gets its own private
// `:memory:` database that no other test file can see.
const sqliteDatabase = new DatabaseSync(':memory:');

export const db = drizzle({ client: sqliteDatabase });

migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') });
