import { DefaultTheme } from 'expo-router';
import type { Theme } from 'expo-router';

import { appThemes } from '@/core/theme/tokens';

type ThemeName = keyof typeof appThemes;

/**
 * maps the active Unistyles theme to a React Navigation `Theme`, so the
 * navigators expo-router mounts read this app's own colours instead of
 * falling back to React Navigation's light `DefaultTheme` — nothing wires a
 * theme into them today (see docs/specs/navigation.md and issue #68). No
 * screen currently reads these colours: every screen and both the tab bar
 * and nav bar are custom-drawn with their own Unistyles styles, so this
 * closes a latent gap rather than a visible defect.
 *
 * `themeName` mirrors `UnistylesRuntime.themeName`'s own optional type: it
 * reads `undefined` only while adaptive theming is off and no explicit
 * theme has been set yet, a transient state this project's own runtime does
 * not leave unresolved in practice. It is defensively resolved to `dark` —
 * this project's own default theme — the same fallback
 * `resolveThemePreferenceFromRuntime` already uses for the same signal (see
 * `src/features/settings/model/theme.ts`).
 *
 * `fonts` is not derived from `theme.typography`: React Navigation's
 * `Theme` wants a `regular`/`medium`/`bold`/`heavy` set of
 * `fontFamily`/`fontWeight` pairs, and this project does not bundle the
 * Inter font files yet (see `../theme/tokens.ts`), so both themes reuse
 * `DefaultTheme.fonts` — `DarkTheme.fonts` is the identical object, so which
 * of the two is read here makes no difference.
 */
export function deriveNavigationTheme(themeName: ThemeName | undefined): Theme {
  const resolvedName: ThemeName = themeName === 'light' ? 'light' : 'dark';
  const theme = appThemes[resolvedName];

  return {
    dark: resolvedName === 'dark',
    colors: {
      primary: theme.colors.text.accent.brand,
      background: theme.colors.background.neutral.app,
      card: theme.colors.background.neutral.subtle,
      text: theme.colors.text.neutral.high,
      border: theme.colors.border.neutral.subtle,
      notification: theme.colors.solid.destructive.rest,
    },
    fonts: DefaultTheme.fonts,
  };
}
