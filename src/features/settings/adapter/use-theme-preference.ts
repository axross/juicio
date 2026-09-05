import { useUnistyles } from 'react-native-unistyles';
import { create } from 'zustand';

import { resolveThemePreferenceFromRuntime, type ThemePreference } from '../model/theme';

type ThemePreferenceState = {
  /** the tapped preference, once tapped; `undefined` before either child
   * screen has ever set it, which is when `useThemePreference` falls back
   * to `resolveThemePreferenceFromRuntime`. */
  preference: ThemePreference | undefined;
};

/**
 * shared client state for the tapped theme preference, read by both the
 * `Theme` screen (to check the right radio) and the Settings screen (to
 * show the current value on its disclosure row) — see
 * docs/decisions/2026-09-05-share-the-theme-preference-through-a-store-not-local-state.md
 * for why this is a store rather than either screen's own local state.
 *
 * exported (not just the hook below) so a test can reset it between cases —
 * see `settings-screen.test.tsx`.
 */
export const useThemePreferenceStore = create<ThemePreferenceState>(() => ({
  preference: undefined,
}));

/** the `Theme` screen's own write path: called alongside the existing
 * `changeTheme` use case and its `fireAndForget` error reporting, which
 * this leaves unchanged — see `theme-screen.tsx`. */
export function setThemePreference(preference: ThemePreference): void {
  useThemePreferenceStore.setState({ preference });
}

/**
 * the current theme preference: the stored, tapped preference once one
 * exists, otherwise `resolveThemePreferenceFromRuntime(rt.hasAdaptiveThemes,
 * rt.themeName)`. Read by both the `Theme` screen (to check the right
 * radio) and the Settings screen (to show the current value).
 */
export function useThemePreference(): ThemePreference {
  const stored = useThemePreferenceStore((state) => state.preference);
  const { rt } = useUnistyles();

  return stored ?? resolveThemePreferenceFromRuntime(rt.hasAdaptiveThemes, rt.themeName);
}
