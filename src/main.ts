// Declared as package.json's "main". See docs/conventions/directory-structure.md
// for why this file's import order is load-bearing. The invariant this file
// holds is no longer "the router-entry import stays
// first" — it is that every module-scope side effect a route module could
// depend on (Unistyles' `StyleSheet.configure` below, Sentry's
// `initSentry()` further down) has already run before expo-router evaluates
// any route module. A route module is never a safe place to do that: expo-
// router discovers and evaluates `src/app/**` lazily, through
// `require.context`, during the root navigator's render, walking that
// context's keys in sorted order. `(` (0x28) sorts before `_` (0x5F), so
// `src/app/(tabs)/_layout.tsx` — and everything it imports, down to the
// themed `StyleSheet.create` in `tab-bar-item.tsx` — evaluates before
// `src/app/_layout.tsx` itself. A theme configured from that root layout
// crashes on the sorted-earlier route, which is exactly what shipped in
// release 0.1.0-pr-11 (Sentry event JUICIO-1: "no theme has been selected
// yet"). This entry file is the only place guaranteed to run before every
// route module, which is why the theme and Sentry imports below live here.
import '@/core/theme/unistyles';

// Imported purely for its side effect, and placed ahead of both
// `expo-router/entry` and `@/core/i18n` below for the same reason as the
// theme import above: nothing else in this file's import graph is
// guaranteed to run before a route module, so initializing Sentry this
// early widens the window in which a startup crash — including one inside
// expo-router's own module evaluation, or in the theme import above it —
// still gets reported instead of lost. Moving only the `initSentry()`
// *call* would not achieve that: every import in this file already runs
// before any of its statements do, call site notwithstanding, which is
// exactly what let an ordering bug through once already. Initializing
// Sentry as this import's own side effect is what actually moves it this
// early. See `sentry-boot.ts` for the full reasoning, and keep this import
// ahead of `@/core/i18n` — reordering the two silently reintroduces the gap.
import '@/core/instrumentation/sentry-boot';

// No longer required to be first in this file: what has to precede it is the
// module-scope work above, and now does. ES module imports are evaluated
// depth-first in source order, before any statement in this file's body runs
// — so both side-effect imports above complete before expo-router/entry's own
// module evaluation begins, and long before the root navigator's render
// discovers and evaluates the route modules under src/app/.
import 'expo-router/entry';

import { preventAutoHideAsync } from 'expo-splash-screen';

// Imported for its side effect: `@/core/i18n` runs `i18next.init` at its
// own module scope, with the device-locale default already resolved
// synchronously from `expo-localization`. Importing it here — before the
// root layout ever mounts — is what makes every string translatable from
// the first render, with no async gate of its own. The root layout's
// readiness gate (`src/app/_layout.tsx`) is the async step: it applies a
// *persisted* language override on top of this device default.
import '@/core/i18n';

// Per Expo's own guidance, called at global scope without awaiting, so it
// can never run after the splash screen's automatic hide already fired.
// Released in src/app/_layout.tsx once the root layout's readiness gate —
// database migrations and the persisted settings read — has settled, on
// every terminating path including failure.
preventAutoHideAsync();
