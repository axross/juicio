import type { ThemePreference } from '../model/theme';

/**
 * shared between the Settings screen (to show the active preference's own
 * label on its `Theme` disclosure row) and the `Theme` child screen (to
 * list all three as radio rows) — one definition so the two never drift
 * apart.
 */
export const THEME_LABEL_KEYS = {
  system: 'theme.optionSystem',
  light: 'theme.optionLight',
  dark: 'theme.optionDark',
} as const;

export const THEME_OPTIONS: readonly { value: ThemePreference; testID: string }[] = [
  { value: 'system', testID: 'settings-theme-system' },
  { value: 'light', testID: 'settings-theme-light' },
  { value: 'dark', testID: 'settings-theme-dark' },
];
