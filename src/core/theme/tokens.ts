/**
 * Theme and breakpoint tokens for react-native-unistyles.
 *
 * This is intentionally minimal: it exists to prove Unistyles is wired end
 * to end (both themes resolve, breakpoints are registered) and is not a
 * product design decision.
 */

const palette = {
  white: '#ffffff',
  slate900: '#0f172a',
  slate100: '#f1f5f9',
  blue600: '#2563eb',
  blue400: '#60a5fa',
} as const;

export const lightTheme = {
  colors: {
    background: palette.white,
    text: palette.slate900,
    accent: palette.blue600,
  },
} as const;

export const darkTheme = {
  colors: {
    background: palette.slate900,
    text: palette.slate100,
    accent: palette.blue400,
  },
} as const;

export const appThemes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export const breakpoints = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
} as const;
