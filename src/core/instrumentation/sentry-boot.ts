import { initSentry } from './sentry';

/**
 * imported purely for its side effect. `main.ts` imports this module ahead
 * of `@/core/i18n` on purpose: ES module imports execute in source order
 * before any statement in the importing module's own body runs, so the only
 * way to make `initSentry()` run before another module's own import-time
 * code is to trigger it from an import that itself resolves first — calling
 * `initSentry()` later in `main.ts`'s body cannot do that, no matter where
 * the call sits textually. this module's position relative to
 * `expo-router/entry` is not what matters here — expo-router/entry must
 * come first in `main.ts` regardless, and every import in that file still
 * finishes before any route module evaluates. see `main.ts`'s own comment
 * for why this ordering relative to `@/core/i18n` is load-bearing and what
 * breaks if a later edit moves this import down.
 *
 * `initSentry()` is idempotent (guarded by its own `initialized` flag in
 * `sentry.ts`), so this being the sole call site changes nothing about
 * correctness if something else ever calls it too.
 */
initSentry();
