import { appThemes } from '@/core/theme/tokens';

import { deriveNavigationTheme } from './navigation-theme';

// the four Innovator Grotesk faces this app bundles, mapped onto React
// Navigation's own `regular`/`medium`/`bold`/`heavy` slots — see
// `navigation-theme.ts`'s own doc comment for why each slot takes the face
// it does, and `fontFaces`'s doc comment (`../theme/tokens.ts`) for why a
// face is never paired with a mismatching `fontWeight`. Identical in both
// themes, since `theme.fontFaces` carries no per-theme variation.
const EXPECTED_FONTS = {
  regular: { fontFamily: appThemes.dark.fontFaces.regular, fontWeight: '400' },
  medium: { fontFamily: appThemes.dark.fontFaces.medium, fontWeight: '500' },
  bold: { fontFamily: appThemes.dark.fontFaces.semiBold, fontWeight: '600' },
  heavy: { fontFamily: appThemes.dark.fontFaces.bold, fontWeight: '700' },
};

describe('deriveNavigationTheme', () => {
  it('maps the dark Unistyles theme to a dark React Navigation theme', () => {
    expect(deriveNavigationTheme('dark')).toEqual({
      dark: true,
      colors: {
        primary: appThemes.dark.colors.text.accent.brand,
        background: appThemes.dark.colors.background.neutral.app,
        card: appThemes.dark.colors.background.neutral.subtle,
        text: appThemes.dark.colors.text.neutral.high,
        border: appThemes.dark.colors.border.neutral.subtle,
        notification: appThemes.dark.colors.solid.destructive.rest,
      },
      fonts: EXPECTED_FONTS,
    });
  });

  it('maps the light Unistyles theme to a light React Navigation theme', () => {
    expect(deriveNavigationTheme('light')).toEqual({
      dark: false,
      colors: {
        primary: appThemes.light.colors.text.accent.brand,
        background: appThemes.light.colors.background.neutral.app,
        card: appThemes.light.colors.background.neutral.subtle,
        text: appThemes.light.colors.text.neutral.high,
        border: appThemes.light.colors.border.neutral.subtle,
        notification: appThemes.light.colors.solid.destructive.rest,
      },
      fonts: EXPECTED_FONTS,
    });
  });

  it('the two themes resolve to different colours, so a wrong mapping cannot pass both assertions above', () => {
    const dark = deriveNavigationTheme('dark');
    const light = deriveNavigationTheme('light');

    expect(dark.colors.background).not.toBe(light.colors.background);
    expect(dark.colors.card).not.toBe(light.colors.card);
  });

  it('defaults an unresolved theme name to dark, the same fallback the Settings screen uses', () => {
    expect(deriveNavigationTheme(undefined)).toEqual(deriveNavigationTheme('dark'));
  });
});
