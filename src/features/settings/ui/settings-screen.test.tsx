import { fireEvent, render, screen } from '@testing-library/react-native';

import { changeLanguage } from '../usecase/change-language';
import { changeTheme } from '../usecase/change-theme';
import { SettingsScreen } from './settings-screen';

// the narrowest boundary that gets the screen mounted: both use cases carry
// a native-module concern past this point (`changeTheme` reaches
// `UnistylesRuntime`, `changeLanguage` reaches `AsyncStorage` through
// `writeStoredLanguage`), and this test's job is the screen's own selection
// state, not what either use case does once called. an automock
// (`jest.mock('../usecase/change-theme')` with no factory) still requires
// the real module once to introspect its exports, which would pull in
// `AsyncStorage` regardless — a factory is what keeps the real module,
// and its native import, out of this test entirely.
jest.mock('../usecase/change-theme', () => ({ changeTheme: jest.fn() }));
jest.mock('../usecase/change-language', () => ({ changeLanguage: jest.fn() }));

// same reasoning, for the screen's own `fireAndForget` failure path: the
// real module reaches `@sentry/react-native`, which starts a real
// `setInterval` under Jest that nothing ever clears — a factory keeps that
// native SDK out of this test entirely, same as the two use cases above.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedChangeTheme = jest.mocked(changeTheme);
const mockedChangeLanguage = jest.mocked(changeLanguage);

beforeEach(() => {
  mockedChangeTheme.mockResolvedValue(undefined);
  mockedChangeLanguage.mockResolvedValue(undefined);
});

describe('<SettingsScreen />', () => {
  // the mocked Unistyles runtime (`react-native-unistyles/mocks`, wired in
  // `jest.setup.ts`) reports `hasAdaptiveThemes: false` and no `themeName`,
  // which `resolveThemePreferenceFromRuntime` maps to `dark` — the exact
  // runtime state issue #20's defect needs, since the mock's own
  // `setAdaptiveThemes`/`setTheme` are no-ops that never notify
  // `useUnistyles()`.
  it('starts with Dark selected, per the mocked runtime default', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-theme-dark')).toBeChecked();
    expect(screen.getByTestId('settings-theme-system')).not.toBeChecked();
    expect(screen.getByTestId('settings-theme-light')).not.toBeChecked();
  });

  // this is the #20 regression itself: `Dark` → `System` is a same-theme
  // transition against the mocked runtime (both resolve to `dark`), so
  // Unistyles' own notification never fires and only the screen's own tap
  // state can move the selection. reverting the `settings-screen.tsx` fix
  // locally makes this fail — see the receipt for both runs.
  it('moves the selection to System on a same-theme transition', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-theme-system'));

    expect(screen.getByTestId('settings-theme-system')).toBeChecked();
    expect(screen.getByTestId('settings-theme-dark')).not.toBeChecked();
    expect(mockedChangeTheme).toHaveBeenCalledWith('system');
  });

  // pins the cross-theme path, which already worked before #20's fix and
  // must keep working: a real Unistyles runtime would notify here too, but
  // the screen's own state is what this test observes either way.
  it('moves the selection on a cross-theme press', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-theme-light'));

    expect(screen.getByTestId('settings-theme-light')).toBeChecked();
    expect(screen.getByTestId('settings-theme-dark')).not.toBeChecked();
    expect(mockedChangeTheme).toHaveBeenCalledWith('light');
  });

  // pins the untouched `Language` path's selection-tracking half: the
  // standalone i18next instance `jest.setup.ts` registers starts at `en`,
  // so this is the state the screen actually renders before any press —
  // not a post-press transition, since `changeLanguage` is mocked below and
  // never moves `i18n.language` itself.
  it('renders the active language as checked', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-language-en')).toBeChecked();
    expect(screen.getByTestId('settings-language-ja')).not.toBeChecked();
  });

  // pins the untouched `Language` path's other half — the press-wiring —
  // without claiming to cover selection-tracking: `changeLanguage` is
  // mocked, so pressing `ja` here does not and cannot move the selection.
  it('calls changeLanguage when a Language row is pressed', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-language-ja'));

    expect(mockedChangeLanguage).toHaveBeenCalledWith('ja');
  });
});
