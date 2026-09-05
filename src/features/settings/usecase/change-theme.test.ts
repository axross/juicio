import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { writeStoredTheme } from '../adapter/settings-storage';
import type { ThemeInstruction, ThemePreference } from '../model/theme';
import { changeTheme } from './change-theme';

// per docs/conventions/product-analytics.md's "Testing a New Call Site"
// section, asserts the `Theme` user property `changeTheme()` reports.
// `apply-theme-instruction` is mocked rather than exercised, since it stays
// untested at its own layer for the Unistyles-native reason its own doc
// comment gives; `THEME_ANALYTICS_LABELS` is this module's own private
// table, so the expected labels and `ThemeInstruction` shapes below are
// hardcoded literals rather than re-derived from `resolveThemeInstruction()`.
jest.mock('@/core/instrumentation/analytics', () => ({ identifyUserProperty: jest.fn() }));
jest.mock('../adapter/apply-theme-instruction', () => ({ applyThemeInstruction: jest.fn() }));
jest.mock('../adapter/settings-storage', () => ({ writeStoredTheme: jest.fn() }));

const mockedIdentifyUserProperty = jest.mocked(identifyUserProperty);
const mockedApplyThemeInstruction = jest.mocked(applyThemeInstruction);
const mockedWriteStoredTheme = jest.mocked(writeStoredTheme);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('changeTheme()', () => {
  it.each<[ThemePreference, string, ThemeInstruction]>([
    ['system', 'System', { adaptive: true }],
    ['light', 'Light', { adaptive: false, theme: 'light' }],
    ['dark', 'Dark', { adaptive: false, theme: 'dark' }],
  ])(
    'applies %s, persists it, and identifies the Theme user property as %s',
    async (theme, label, instruction) => {
      await changeTheme(theme);

      expect(mockedApplyThemeInstruction).toHaveBeenCalledWith(instruction);
      expect(mockedIdentifyUserProperty).toHaveBeenCalledWith('theme', label);
      expect(mockedWriteStoredTheme).toHaveBeenCalledWith(theme);
    },
  );
});
