import { DefaultTheme } from 'expo-router';

import { appThemes } from '@/core/theme/tokens';

import { deriveNavigationTheme } from './navigation-theme';

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
      fonts: DefaultTheme.fonts,
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
      fonts: DefaultTheme.fonts,
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
