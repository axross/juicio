import i18next from '@/core/i18n';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { readStoredLanguage, readStoredTheme } from '../adapter/settings-storage';
import { resolveThemeInstruction } from '../model/theme';

/**
 * Reads both persisted settings and applies them before the first frame
 * paints. A persisted language overrides `@/core/i18n`'s device-locale
 * default; a persisted theme (or its `system` default) is applied through
 * Unistyles. The root layout's readiness gate awaits this and holds the
 * splash screen for exactly as long as it takes — see
 * docs/decisions/2026-08-26-store-user-settings-in-async-storage.md for why
 * that ordering exists at all.
 *
 * The two settings are applied independently, on purpose: `changeLanguage`
 * is the one call here that can reject (a corrupt i18next backend, for
 * instance), and it previously sat ahead of the theme application in an
 * `await` chain, so a rejection there would throw out of this function
 * before the theme instruction ever ran — silently falling a perfectly good
 * persisted theme back to `system`. Applying the theme synchronously, ahead
 * of awaiting the language change, means a language failure can no longer
 * suppress it.
 */
export async function applyPersistedSettings(): Promise<void> {
  const [storedLanguage, storedTheme] = await Promise.all([
    readStoredLanguage(),
    readStoredTheme(),
  ]);

  applyThemeInstruction(resolveThemeInstruction(storedTheme));

  if (storedLanguage) {
    try {
      await i18next.changeLanguage(storedLanguage);
    } catch (error) {
      if (__DEV__) {
        console.error('Failed to apply the persisted language override:', error);
      }
    }
  }
}
