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
 */
export async function applyPersistedSettings(): Promise<void> {
  const [storedLanguage, storedTheme] = await Promise.all([
    readStoredLanguage(),
    readStoredTheme(),
  ]);

  if (storedLanguage) {
    await i18next.changeLanguage(storedLanguage);
  }

  applyThemeInstruction(resolveThemeInstruction(storedTheme));
}
