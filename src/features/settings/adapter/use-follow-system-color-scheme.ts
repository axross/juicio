import { useEffect } from 'react';
import { Appearance } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';

import { resolveForcedThemeFromColorScheme } from '../model/theme';

/**
 * subscribes to React Native's own `Appearance` module for the app's
 * lifetime and, on every OS colour-scheme change, forces the Unistyles
 * runtime to match it whenever `resolveForcedThemeFromColorScheme` says to
 * — see #19. `Appearance.addChangeListener`'s reported scheme includes
 * `'unspecified'`, which this hook folds into "no scheme" before handing it
 * to the resolver, matching the resolver's own `undefined`-means-absent
 * contract.
 *
 * a candidate fix, not a diagnosis: this run could not reproduce the defect
 * without a device (no Android device or emulator in this environment), so
 * whether Unistyles' own native listener ever notifies JS at all in the
 * first place is still unconfirmed. this hook only helps if it does.
 *
 * the write, when the resolver says to make one, is exactly this sequence
 * and no other order works:
 *
 * 1. `setAdaptiveThemes(false)` — `setTheme()` throws while adaptive
 *    themes are enabled
 *    (`node_modules/react-native-unistyles/cxx/hybridObjects/HybridUnistylesRuntime.cpp:84-87`).
 *    disabling first keeps the currently-applied theme rather than
 *    reverting to a default, so there is no flash.
 * 2. `setTheme(target)` — pins the runtime to the OS-reported scheme.
 * 3. `setAdaptiveThemes(true)` — re-enabled, not left off: this is what
 *    keeps `hasAdaptiveThemes` true, which is what
 *    `resolveThemePreferenceFromRuntime` (`../model/theme.ts`) reads to
 *    keep reporting `System` as the selected Settings preference. leaving
 *    adaptive theming disabled here would make the radio read `Light` or
 *    `Dark` after an OS scheme change, even though the user never touched
 *    Settings.
 *
 * never calls `Appearance.setColorScheme`: that sets an app-level override
 * Unistyles does not read, and would not carry out this app's own theme
 * instruction at all.
 */
export function useFollowSystemColorScheme(): void {
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      const target = resolveForcedThemeFromColorScheme(
        UnistylesRuntime.hasAdaptiveThemes,
        UnistylesRuntime.themeName,
        colorScheme === 'unspecified' ? undefined : colorScheme,
      );

      if (target === undefined) {
        return;
      }

      UnistylesRuntime.setAdaptiveThemes(false);
      UnistylesRuntime.setTheme(target);
      UnistylesRuntime.setAdaptiveThemes(true);
    });

    return () => subscription.remove();
  }, []);
}
