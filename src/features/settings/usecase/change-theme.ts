import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { writeStoredTheme } from '../adapter/settings-storage';
import { resolveThemeInstruction, type ThemePreference } from '../model/theme';

/**
 * Changes the app's theme immediately (every screen styled through
 * Unistyles re-renders) and persists the choice so it survives a restart.
 * Exposed for the Settings UI phase 2 builds — nothing in this repository
 * calls it yet.
 */
export async function changeTheme(theme: ThemePreference): Promise<void> {
  applyThemeInstruction(resolveThemeInstruction(theme));
  await writeStoredTheme(theme);
}
