// declared as package.json's "main". see docs/conventions/directory-structure.md
// for why this file's import order is load-bearing.
//
// `expo-router/entry` must be the first import in this module (see the
// `expo-app-development` skill's project-layout.md), and nothing about the
// crash below required breaking that: expo-router discovers and evaluates
// `src/app/**` lazily, through `require.context`, during the root
// navigator's own render pass — a pass that only begins once every import in
// this file, expo-router/entry included, has already finished evaluating.
// so the theme and Sentry imports below are just as fully resolved before
// any route module runs whether they sit ahead of expo-router/entry or
// after it; only their position relative to the route modules matters, and
// that position is "in this entry module" either way.
import 'expo-router/entry';

// imported for its side effect: Unistyles' `StyleSheet.configure`, called at
// this module's own scope. it has to run from here rather than from a route
// module: `require.context` walks `src/app/**` in sorted key order, and `(`
// (0x28) sorts before `_` (0x5F), so `src/app/(tabs)/_layout.tsx` — and
// everything it imports, down to the themed `StyleSheet.create` in
// `tab-bar-item.tsx` — evaluates before `src/app/_layout.tsx` itself.
// configuring the theme from that root layout, as it once was, crashed on
// launch the moment some other route sorted ahead of it and evaluated first
// (`StyleSheet.create` needs a theme already selected) — exactly what
// release 0.1.0-pr-11 shipped (Sentry event JUICIO-1: "no theme has been
// selected yet"). this entry module is the only place guaranteed to run
// before every route module, which is why this import lives here instead.
import '@/core/theme/unistyles';

// imported purely for its side effect, and placed ahead of `@/core/i18n`
// below so that initializing Sentry happens before anything else in this
// file's import graph that could itself throw. `@/core/i18n` runs
// `i18next.init` and `expo-localization`'s `getLocales()` at its own module
// scope; a throw there has to be reportable, which means Sentry must already
// be initialized by the time it runs. moving only the `initSentry()` *call*
// would not achieve that: every import in this file already runs before any
// of its statements do, call site notwithstanding, which is exactly what
// let an ordering bug through once already (fixed in 12dd457). initializing
// Sentry as this import's own side effect is what actually moves it this
// early. see `sentry-boot.ts` for the full reasoning, and keep this import
// ahead of `@/core/i18n` — reordering the two silently reintroduces the gap.
import '@/core/instrumentation/sentry-boot';

import { preventAutoHideAsync } from 'expo-splash-screen';

// imported for its side effect: `@/core/i18n` runs `i18next.init` at its
// own module scope, with the device-locale default already resolved
// synchronously from `expo-localization`. importing it here — before the
// root layout ever mounts — is what makes every string translatable from
// the first render, with no async gate of its own. the root layout's
// readiness gate (`src/app/_layout.tsx`) is the async step: it applies a
// *persisted* language override on top of this device default.
import '@/core/i18n';

// per Expo's own guidance, called at global scope without awaiting, so it
// can never run after the splash screen's automatic hide already fired.
// released in src/app/_layout.tsx once the root layout's readiness gate —
// database migrations and the persisted settings read — has settled, on
// every terminating path including failure.
preventAutoHideAsync();
