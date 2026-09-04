import { usePathname } from 'expo-router';
import { useEffect } from 'react';

import { trackEvent } from '@/core/instrumentation/analytics';

import { resolveScreenName } from './screen-name';

/**
 * fires one `Screen Viewed` event per navigation to a recognized screen —
 * one router-level subscription, mounted once from the root layout
 * (`src/app/_layout.tsx`), rather than one call duplicated across every
 * screen component (issue #211's own system design). see `screen-name.ts`
 * for which pathnames this app recognizes and why the property it sends is
 * a fixed screen name rather than a live-translated title; a pathname that
 * resolves to no screen name — an intermediate value during a route
 * transition, or a route this mapping hasn't been extended for — is
 * skipped rather than tracked as `undefined`.
 *
 * `ready` gates the effect for the same reason it gates `_layout.tsx`'s own
 * `Session Started` effect: `@/core/instrumentation/analytics.ts`'s `enabled`
 * flag isn't the real, persisted analytics preference until `ready` is
 * `true`, so no event may fire before then — a user who opted out in a
 * previous session must not get one `Screen Viewed` for the launch route
 * while the module's optimistic default is still in effect. Once `ready`
 * flips to `true`, this effect re-runs against whatever `pathname` already
 * is, firing the initial `Screen Viewed` for the launch route at that point
 * rather than before it.
 *
 * `usePathname()` re-renders this hook's caller on every navigation, so a
 * plain `useEffect` keyed on its return value (and `ready`) is enough:
 * React's own dependency-array comparison is what keeps a render that
 * leaves both unchanged from firing a second time.
 */
export function useTrackScreenViews(ready: boolean): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) {
      return;
    }

    const screenName = resolveScreenName(pathname);

    if (screenName === undefined) {
      return;
    }

    trackEvent('Screen Viewed', { screenName });
  }, [pathname, ready]);
}
