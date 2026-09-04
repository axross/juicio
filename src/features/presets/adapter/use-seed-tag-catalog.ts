import { useEffect, useState } from 'react';

import { normalizeError } from '@/core/instrumentation/normalize-error';
import { reportError } from '@/core/instrumentation/report-error';

import { seedTagCatalog } from './seed-tag-catalog';

export type SeedTagCatalogState = {
  /** true once `seedTagCatalog` has settled — successfully or not. */
  ready: boolean;
  error: Error | null;
};

/**
 * runs `seedTagCatalog` once `migrationsSucceeded` turns true, and reports
 * whether it has settled — the same readiness-hook shape
 * `use-database-migrations.ts` and
 * `@/features/settings/adapter/use-persisted-settings`'s `usePersistedSettings`
 * already use, so the root layout folds this into the same `ready`
 * computation. `migrationsSucceeded` is taken as an argument rather than
 * read from `useDatabaseMigrations` itself, since seeding only makes sense
 * once the `tag_axes`/`tag_values` tables that migration creates actually
 * exist — issue #175's revised plan requires this step to run "gated to run
 * only once migrations have succeeded."
 *
 * a seeding failure is reported to the error tracker but still resolves
 * `ready: true`: this project's local database has no other Preset data
 * depending on the catalog yet (no screen reads or writes a Preset today —
 * see issue #175's own Non-goals), so there is nothing this failure would
 * leave the launch stuck behind, the same reasoning `usePersistedSettings`
 * already applies to its own failure path.
 */
export function useSeedTagCatalog(migrationsSucceeded: boolean): SeedTagCatalogState {
  const [state, setState] = useState<SeedTagCatalogState>({ ready: false, error: null });

  useEffect(() => {
    if (!migrationsSucceeded) {
      return;
    }

    let cancelled = false;

    seedTagCatalog()
      .then(() => {
        if (!cancelled) {
          setState({ ready: true, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const normalizedError = normalizeError(error);
          reportError(normalizedError, {
            tags: { module: 'presets' },
            extra: { operation: 'seedTagCatalog' },
          });
          setState({ ready: true, error: normalizedError });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [migrationsSucceeded]);

  return state;
}
