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
 * `fonts` is not derived from `theme.typography`, since that object has no
 * `regular`/`medium`/`bold`/`heavy` shape to read the four slots off of —
 * it is built directly from `theme.fontFaces` (`../theme/tokens.ts`)
 * instead, the same four Innovator Grotesk faces every typography role
 * draws from: `regular`→Regular, `medium`→Medium, `bold`→Semi Bold, and
 * `heavy`→Bold, matching how the app's own roles use each face (`heading`
 * and `rowLabel` are Semi Bold; nothing in this app's own roles reaches for
 * Bold, but React Navigation's own `heavy` slot needs a fourth, heavier
 * face, and Bold is the one left). React Navigation's `FontStyle` type
 * requires a `fontWeight` alongside `fontFamily`, unlike this app's own
 * typography roles, which carry no numeric weight because the weight is
 * already the face (`../theme/tokens.ts`'s `fontFaces` doc comment) — each
 * value below is the weight that actually matches its paired face
 * (`400`/`500`/`600`/`700`), not left at the type's own placeholder
 * default, so it can't invite the platform to synthesise a mismatched
 * weight on top of the named face.
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
    fonts: {
      regular: { fontFamily: theme.fontFaces.regular, fontWeight: '400' },
      medium: { fontFamily: theme.fontFaces.medium, fontWeight: '500' },
      bold: { fontFamily: theme.fontFaces.semiBold, fontWeight: '600' },
      heavy: { fontFamily: theme.fontFaces.bold, fontWeight: '700' },
    },
  };
}
