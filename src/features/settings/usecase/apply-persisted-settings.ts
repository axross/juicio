import i18next from '@/core/i18n';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import {
  readStoredAnalyticsPreference,
  readStoredLanguage,
  readStoredTheme,
} from '../adapter/settings-storage';
import { setAnalyticsPreference } from '../adapter/use-analytics-preference';
import { resolveThemeInstruction } from '../model/theme';

/**
 * reads all three persisted settings and applies them before the first
 * frame paints. a persisted language overrides `@/core/i18n`'s
 * device-locale default; a persisted theme (or its `system` default) is
 * applied through Unistyles; the persisted analytics preference (issue
 * #211) gates `@/core/instrumentation/analytics.ts`'s own `trackEvent`. the
 * root layout's readiness gate awaits this and holds the splash screen for
 * exactly as long as it takes — see
 * docs/decisions/2026-08-26-store-user-settings-in-async-storage.md for why
 * that ordering exists at all.
 *
 * the three reads are combined with `Promise.allSettled`, not `Promise.all`,
 * and deliberately not so much as awaited together in a way that would let
 * one reject before the other two's outcomes are read: each of
 * `readStoredLanguage`/`readStoredTheme`/`readStoredAnalyticsPreference`
 * does a real `AsyncStorage.getItem` (`../adapter/settings-storage.ts`) that
 * can reject on a genuine device storage failure, independently of the
 * other two, and `Promise.all` would let any single one of those failures
 * throw before any of the three settings are ever applied — most severely,
 * it could leave `setAnalyticsPreference` never called even though the
 * analytics read itself had succeeded, reporting a session for a user who
 * had genuinely opted out (a real regression this function once had: a
 * failing theme or language read silently discarded an already-successful
 * analytics read). Reading `themeSettled`/`analyticsSettled` off the
 * settled array and applying each independently of the other's outcome is
 * what closes that: a failure in either one can no longer suppress the
 * other, or the language handling below.
 *
 * a `changeLanguage` rejection is deliberately left uncaught here rather
 * than swallowed: the theme and analytics preference are already applied by
 * the time it can happen (see below), so there is nothing left for a local
 * `catch` to protect, and `usePersistedSettings`'s own `.catch` is the root
 * call site for this operation — it exists specifically to report the
 * failure and to resolve `ready: true` regardless, so the splash screen is
 * still released either way. a `readStoredLanguage`/`readStoredTheme`
 * rejection (as opposed to `changeLanguage`'s) is treated the same way, for
 * the same reason, once the other two settings have already been applied —
 * thrown from here so it still reaches that same `.catch` and gets
 * reported, rather than silently leaving the app on a fallback (`system`
 * theme, device-locale language) with nothing recorded about why.
 *
 * `readStoredAnalyticsPreference()` rejecting is handled differently, on
 * purpose: it is left unreported, `enabled` simply staying at
 * `analytics.ts`'s own module-scope default (`true`). Unlike a theme or
 * language read failure, which leaves the app on a fallback that is a real,
 * user-visible substitution for whatever was actually persisted, that
 * default is *already* the exact value `resolveStoredAnalyticsPreference`
 * itself returns for "nothing stored yet" — so a failed read and a
 * successful-but-empty read are indistinguishable in their effect, and
 * there is nothing wrong to report. (should either default ever drift from
 * the other, this call deserves the same `throw`-and-report treatment the
 * theme and language reads get above.)
 */
export async function applyPersistedSettings(): Promise<void> {
  const [themeSettled, analyticsSettled, languageSettled] = await Promise.allSettled([
    readStoredTheme(),
    readStoredAnalyticsPreference(),
    readStoredLanguage(),
  ]);

  if (themeSettled.status === 'fulfilled') {
    applyThemeInstruction(resolveThemeInstruction(themeSettled.value));
  }

  if (analyticsSettled.status === 'fulfilled') {
    setAnalyticsPreference(analyticsSettled.value);
  }

  if (themeSettled.status === 'rejected') {
    throw themeSettled.reason;
  }

  if (languageSettled.status === 'rejected') {
    throw languageSettled.reason;
  }

  if (languageSettled.value) {
    await i18next.changeLanguage(languageSettled.value);
  }
}
