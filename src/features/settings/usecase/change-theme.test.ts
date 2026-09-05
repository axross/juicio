import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { applyThemeInstruction } from '../adapter/apply-theme-instruction';
import { writeStoredTheme } from '../adapter/settings-storage';
import type { ThemeInstruction, ThemePreference } from '../model/theme';
import { changeTheme } from './change-theme';

// the same "Testing a New Call Site" rule `change-language.test.ts` follows
// applies here identically: `identifyUserProperty('theme', …)` is this
// module's own call site for the `Theme` user property (issue #211), and it
// carries no test of its own yet. Mocked the same way
// `apply-persisted-settings.test.ts` mocks `apply-theme-instruction.ts` and
// `settings-storage.ts` in this same directory — `apply-theme-instruction`
// itself stays untested at its own layer for the Unistyles-native reason its
// own doc comment gives, so its mock here only has to record what
// `changeTheme()` handed it. `THEME_ANALYTICS_LABELS` is this module's own
// private table, not exported, so the expected labels and the
// `ThemeInstruction` shapes below are hardcoded literals rather than
// re-derived from `resolveThemeInstruction()` — the same literal-assertion
// convention `apply-persisted-settings.test.ts` already uses for those same
// shapes.
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
