import { deriveStatusBarStyle } from './status-bar-style';

describe('deriveStatusBarStyle', () => {
  it('gives the light theme dark icons, readable against its light background', () => {
    expect(deriveStatusBarStyle('light')).toBe('dark');
  });

  it('gives the dark theme light icons, readable against its dark background', () => {
    expect(deriveStatusBarStyle('dark')).toBe('light');
  });

  it('defaults an unresolved theme name to light icons, matching deriveNavigationTheme resolving the same value to a dark background', () => {
    expect(deriveStatusBarStyle(undefined)).toBe('light');
  });
});
