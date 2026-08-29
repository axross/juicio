import {
  resolveForcedThemeFromColorScheme,
  resolveStoredTheme,
  resolveThemeInstruction,
  resolveThemePreferenceFromRuntime,
} from './theme';

describe('resolveStoredTheme', () => {
  it('resolves a stored "system" to system', () => {
    expect(resolveStoredTheme('system')).toBe('system');
  });

  it('resolves a stored "light" to light', () => {
    expect(resolveStoredTheme('light')).toBe('light');
  });

  it('resolves a stored "dark" to dark', () => {
    expect(resolveStoredTheme('dark')).toBe('dark');
  });

  it('resolves null (nothing ever stored) to the system default', () => {
    expect(resolveStoredTheme(null)).toBe('system');
  });

  it('resolves undefined to the system default', () => {
    expect(resolveStoredTheme(undefined)).toBe('system');
  });

  it('resolves an unrecognised value to the system default rather than crashing', () => {
    expect(resolveStoredTheme('solarized')).toBe('system');
  });

  it('resolves corrupt (non-theme) stored data to the system default rather than crashing', () => {
    expect(resolveStoredTheme('{"not":"a theme"}')).toBe('system');
  });
});

describe('resolveThemeInstruction', () => {
  it('resolves system to the adaptive instruction', () => {
    expect(resolveThemeInstruction('system')).toEqual({ adaptive: true });
  });

  it('resolves light to the pinned light instruction', () => {
    expect(resolveThemeInstruction('light')).toEqual({ adaptive: false, theme: 'light' });
  });

  it('resolves dark to the pinned dark instruction', () => {
    expect(resolveThemeInstruction('dark')).toEqual({ adaptive: false, theme: 'dark' });
  });
});

describe('resolveThemePreferenceFromRuntime', () => {
  it('resolves to system whenever adaptive theming is on, regardless of the current theme name', () => {
    expect(resolveThemePreferenceFromRuntime(true, 'light')).toBe('system');
    expect(resolveThemePreferenceFromRuntime(true, 'dark')).toBe('system');
    expect(resolveThemePreferenceFromRuntime(true, undefined)).toBe('system');
  });

  it('resolves to light when adaptive theming is off and the theme name is light', () => {
    expect(resolveThemePreferenceFromRuntime(false, 'light')).toBe('light');
  });

  it('resolves to dark when adaptive theming is off and the theme name is dark', () => {
    expect(resolveThemePreferenceFromRuntime(false, 'dark')).toBe('dark');
  });

  it('resolves to dark when adaptive theming is off and the theme name is missing, rather than undefined', () => {
    expect(resolveThemePreferenceFromRuntime(false, undefined)).toBe('dark');
  });
});

describe('resolveForcedThemeFromColorScheme', () => {
  it('returns undefined when adaptive theming is off, regardless of the reported scheme', () => {
    expect(resolveForcedThemeFromColorScheme(false, 'dark', 'light')).toBeUndefined();
    expect(resolveForcedThemeFromColorScheme(false, 'light', 'dark')).toBeUndefined();
  });

  it('returns undefined when the reported scheme is null', () => {
    expect(resolveForcedThemeFromColorScheme(true, 'dark', null)).toBeUndefined();
  });

  it('returns undefined when the reported scheme is undefined', () => {
    expect(resolveForcedThemeFromColorScheme(true, 'dark', undefined)).toBeUndefined();
  });

  it("returns undefined when the runtime's theme name already matches the reported scheme", () => {
    expect(resolveForcedThemeFromColorScheme(true, 'dark', 'dark')).toBeUndefined();
    expect(resolveForcedThemeFromColorScheme(true, 'light', 'light')).toBeUndefined();
  });

  it('returns the reported scheme when adaptive theming is on and it differs from the current theme name', () => {
    expect(resolveForcedThemeFromColorScheme(true, 'dark', 'light')).toBe('light');
    expect(resolveForcedThemeFromColorScheme(true, 'light', 'dark')).toBe('dark');
  });

  it('returns the reported scheme when the runtime reports no current theme name at all', () => {
    expect(resolveForcedThemeFromColorScheme(true, undefined, 'dark')).toBe('dark');
  });
});
