import { initAnalytics } from './analytics';

/**
 * imported purely for its side effect, mirroring `sentry-boot.ts` exactly —
 * see that module's own doc comment for why triggering `initAnalytics()`
 * from an import, rather than a call in `main.ts`'s own body, is what
 * actually moves it this early. Placed in `main.ts` after `sentry-boot`:
 * unlike Sentry, nothing else in this file's import graph can throw in a
 * way analytics needs to observe, so there is no ordering requirement
 * against `@/core/i18n` the way Sentry's initialization has — this import
 * only needs to run before the root layout's first render, and every
 * import in `main.ts` already does.
 *
 * `initAnalytics()` is idempotent (guarded by its own `initialized` flag in
 * `analytics.ts`), so this being the sole call site changes nothing about
 * correctness if something else ever calls it too.
 */
initAnalytics();
