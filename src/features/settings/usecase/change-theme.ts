import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { writeStoredTheme } from '../adapter/settings-storage';
import { resolveThemeInstruction, type ThemePreference } from '../model/theme';

/**
 * this project's own fixed label for each `ThemePreference`, sent as the
 * `Theme` user property — deliberately not the live-translated
 * `THEME_LABEL_KEYS` value `../ui/theme-options.ts` renders on screen
 * (`t(THEME_LABEL_KEYS[theme])`, "システム"/"ライト"/"ダーク" in Japanese):
 * an analytics user property is a dimension a dashboard slices by, and
 * `@/core/instrumentation/analytics.ts`'s `Events`/`UserProperties` naming
 * convention already settles the same tension for `Screen Name` — "this
 * project's own [name], unchanged" regardless of device language — which
 * this table applies the same way for `Theme`, so the same person's
 * preference doesn't fragment into two dashboard values depending on which
 * language their device happens to be set to.
 */
const THEME_ANALYTICS_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * changes the app's theme immediately (every screen styled through
 * Unistyles re-renders) and persists the choice so it survives a restart.
 * also records the new preference as an ongoing `Theme` user property
 * rather than a one-off event — see `THEME_ANALYTICS_LABELS` above for why
 * its value is this project's own fixed label, not the live-translated one
 * the Theme screen itself renders.
 */
export async function changeTheme(theme: ThemePreference): Promise<void> {
  applyThemeInstruction(resolveThemeInstruction(theme));
  identifyUserProperty('theme', THEME_ANALYTICS_LABELS[theme]);
  await writeStoredTheme(theme);
}
