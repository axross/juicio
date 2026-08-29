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

  // pins the untouched `Language` path: its selection is driven by
  // `i18n.language`, not by this screen's own state, so this only asserts
  // the row still wires its press through to the use case.
  it('calls changeLanguage when a Language row is pressed', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-language-ja'));

    expect(mockedChangeLanguage).toHaveBeenCalledWith('ja');
  });
});
