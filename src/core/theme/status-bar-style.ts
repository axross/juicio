import { appThemes } from './tokens';

type ThemeName = keyof typeof appThemes;

/**
 * maps the active Unistyles theme to `expo-status-bar`'s `style` prop, so the
 * OS status bar's icon colour reads legibly against its own background,
 * instead of staying at the fixed default colour that made it unreadable
 * against the light theme (see issue #151).
 *
 * `themeName` mirrors `UnistylesRuntime.themeName`'s own optional type, per
 * `deriveNavigationTheme`'s own doc comment (`../navigation/navigation-theme.ts`).
 * This function's fallback deliberately matches that function's assumption,
 * not its return value: both treat `'light'` as the one branch tested for
 * and assume the dark theme otherwise, so `deriveNavigationTheme` resolves
 * an unresolved `themeName` to its `'dark'` Theme object while this function
 * resolves the same case to `'light'` icons — the colour that reads against
 * that dark background. Testing for `'dark'` instead — the opposite
 * polarity — would fall an unresolved theme to dark icons while
 * `deriveNavigationTheme` still resolves it to a dark background,
 * reproducing the unreadable-icon defect issue #151 reports, just inverted.
 */
export function deriveStatusBarStyle(themeName: ThemeName | undefined): 'light' | 'dark' {
  return themeName === 'light' ? 'dark' : 'light';
}
