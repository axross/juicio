// Declared as package.json's "main". The router-entry import must stay
// first and uninterrupted by any other statement with a side effect — ES
// module imports are hoisted, so this ordering does not make initialization
// run before the router's own module evaluation, only before the app's own
// modules evaluate and before the first render. See
// docs/conventions/directory-structure.md for why this file lives at the
// repository root rather than under src/.
import 'expo-router/entry';

import { preventAutoHideAsync } from 'expo-splash-screen';

// Imported purely for its side effect, and deliberately ahead of
// `@/core/i18n` below: ES module imports execute in source order before any
// statement in this file's body runs, so `@/core/i18n`'s own module-scope
// work (i18next.init, `expo-localization`'s getLocales()) would otherwise
// run — and could throw — before Sentry is initialized to report it.
// Moving only the `initSentry()` *call* below this line would not fix that:
// every import in this file already runs before any of its statements do,
// call site notwithstanding, which is exactly what let this ordering bug
// through once already. Initializing Sentry as this import's side effect,
// ahead of every import whose own module-scope code can fail, is what
// actually moves it earlier. See `sentry-boot.ts` for the full reasoning,
// and keep this import above `@/core/i18n` — reordering the two silently
// reintroduces the gap.
import '@/core/instrumentation/sentry-boot';

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
