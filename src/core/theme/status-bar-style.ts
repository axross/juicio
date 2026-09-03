import { appThemes } from './tokens';

type ThemeName = keyof typeof appThemes;

/**
 * maps the active Unistyles theme to `expo-status-bar`'s `style` prop, so the
 * OS status bar's icon colour reads against its own background rather than
 * against it (see issue #151).
 *
 * `themeName` mirrors `UnistylesRuntime.themeName`'s own optional type, per
 * `deriveNavigationTheme`'s own doc comment (`../navigation/navigation-theme.ts`).
 * This function's fallback deliberately matches that function's: both treat
 * `'light'` as the one branch tested for and fall unresolved values to
 * `'dark'`. Testing for `'dark'` instead — the opposite polarity — would
 * fall an unresolved theme to dark icons while `deriveNavigationTheme`
 * still resolves the same value to a dark background, reproducing the
 * unreadable-icon defect issue #151 reports, just inverted.
 */
export function deriveStatusBarStyle(themeName: ThemeName | undefined): 'light' | 'dark' {
  return themeName === 'light' ? 'dark' : 'light';
}
