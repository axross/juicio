import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './client';
import migrationsModule from './migrations/migrations';

/**
 * drizzle-kit's `expo` driver output (on the current 1.0.0-rc line) exports
 * only `{ migrations }`, but drizzle-orm's `useMigrations` type still wants
 * a `journal`. The journal is derivable from the migration keys themselves
 * (each is a `<14-digit-timestamp>_<name>` tag), so we build it here instead
 * of hand-maintaining a file that would drift from what drizzle-kit
 * regenerates.
 */
const journal = {
  entries: Object.keys(migrationsModule.migrations)
    .sort()
    .map((tag, idx) => ({
      idx,
      when: Number(tag.slice(0, 14)),
      tag,
      breakpoints: true,
    })),
};

/**
 * Runs the committed Drizzle migrations against the on-device SQLite
 * database and reports readiness. Intended to be called once, near the
 * app root.
 */
export function useDatabaseMigrations() {
  return useMigrations(db, { ...migrationsModule, journal });
}
