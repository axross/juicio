import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { writeStoredTheme } from '../adapter/settings-storage';
import { resolveThemeInstruction, type ThemePreference } from '../model/theme';

/**
 * changes the app's theme immediately (every screen styled through
 * Unistyles re-renders) and persists the choice so it survives a restart.
 */
export async function changeTheme(theme: ThemePreference): Promise<void> {
  applyThemeInstruction(resolveThemeInstruction(theme));
  await writeStoredTheme(theme);
}
