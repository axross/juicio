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
 * reads both persisted settings and applies them before the first frame
 * paints. a persisted language overrides `@/core/i18n`'s device-locale
 * default; a persisted theme (or its `system` default) is applied through
 * Unistyles. the root layout's readiness gate awaits this and holds the
 * splash screen for exactly as long as it takes — see
 * docs/decisions/2026-08-26-store-user-settings-in-async-storage.md for why
 * that ordering exists at all.
 *
 * the two settings are applied independently, on purpose: `changeLanguage`
 * is the one call here that can reject (a corrupt i18next backend, for
 * instance), and it previously sat ahead of the theme application in an
 * `await` chain, so a rejection there would throw out of this function
 * before the theme instruction ever ran — silently falling a perfectly good
 * persisted theme back to `system`. applying the theme synchronously, ahead
 * of awaiting the language change, means a language failure can no longer
 * suppress it.
 *
 * a `changeLanguage` rejection is deliberately left uncaught here rather
 * than swallowed: the theme is already applied by the time it can happen
 * (see above), so there is nothing left for a local `catch` to protect, and
 * `usePersistedSettings`'s own `.catch` is the root call site for this
 * operation — it exists specifically to report the failure and to resolve
 * `ready: true` regardless, so the splash screen is still released either
 * way.
 *
 * the persisted analytics preference (issue #211) is applied synchronously
 * alongside the theme, ahead of the awaited language change, for the same
 * reason: `setAnalyticsPreference` cannot itself reject, but keeping it
 * beside the theme application rather than after the `await` below is what
 * guarantees it has already run by the time `src/app/_layout.tsx` fires its
 * own `Session Started` event on `ready` — firing that event before this
 * has run could report a session for a user who had actually opted out.
 */
export async function applyPersistedSettings(): Promise<void> {
  const [storedLanguage, storedTheme, storedAnalyticsPreference] = await Promise.all([
    readStoredLanguage(),
    readStoredTheme(),
    readStoredAnalyticsPreference(),
  ]);

  applyThemeInstruction(resolveThemeInstruction(storedTheme));
  setAnalyticsPreference(storedAnalyticsPreference);

  if (storedLanguage) {
    await i18next.changeLanguage(storedLanguage);
  }
}
