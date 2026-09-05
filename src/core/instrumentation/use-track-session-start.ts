import { useEffect } from 'react';

import { trackEvent } from './analytics';

/**
 * fires one `Session Started` event per app launch (issue #211), mounted
 * once from the root layout (`src/app/_layout.tsx`) rather than inlined
 * there directly — extracted so this call site can carry the test
 * `docs/conventions/product-analytics.md`'s "Testing a New Call Site" MUST
 * rule requires; a route module under `src/app/` can never colocate one
 * (`docs/conventions/directory-structure.md`'s own "No file with `.test.`
 * in its name may live under `src/app/`" rule, and PR #93's release-bundle
 * incident behind it), so the event had no way to be tested until it moved
 * into a hook of its own.
 *
 * `ready` gates this the same way it gates `use-track-screen-views.ts`'s own
 * `Screen Viewed` effect — see that hook's own doc comment for the full
 * race: `@/core/instrumentation/analytics.ts`'s `enabled` flag isn't the
 * real, persisted analytics preference until `ready` is `true`, so firing
 * any earlier — from `initAnalytics()` itself, which runs synchronously at
 * import time — would race ahead of a user who had actually opted out.
 *
 * a plain `useEffect` keyed on `[ready]`, with no ref guard, is enough to
 * keep this to once per launch: every readiness source `ready` folds
 * together in `_layout.tsx` (`useDatabaseMigrations`, `useSeedTagCatalog`,
 * `usePersistedSettings`) only ever moves its own state from `false` to
 * `true`, never back — none of their effects has a path that resets it —
 * so `ready` itself is monotonic for the life of one mount. React's
 * dependency-array comparison therefore sees at most one `false` → `true`
 * transition, and this effect fires at most once.
 */
export function useTrackSessionStart(ready: boolean): void {
  useEffect(() => {
    if (ready) {
      trackEvent('Session Started', {});
    }
  }, [ready]);
}
