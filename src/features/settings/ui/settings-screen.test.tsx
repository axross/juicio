import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { setThemePreference, useThemePreferenceStore } from '../adapter/use-theme-preference';
import { SettingsScreen } from './settings-screen';

// the Settings screen no longer calls either use case directly — both moved
// onto their own child screens (issue #76) — but it still imports
// `expo-router`'s `router` to push into them, and calling the real
// implementation with no navigator mounted queues rather than throws,
// which would leave `toHaveBeenCalledWith` nothing to assert against. a
// factory mock is what makes the call observable.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedPush = jest.mocked(router.push);

// the store is a module-level singleton (see `use-theme-preference.ts`), so
// a preference set in one test would otherwise leak into the next.
afterEach(() => {
  useThemePreferenceStore.setState({ preference: undefined });
  mockedPush.mockClear();
});

describe('<SettingsScreen />', () => {
  it('shows one row for Language and one row for Theme, with no radio row on the screen itself', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-language-row')).toBeVisible();
    expect(screen.getByTestId('settings-theme-row')).toBeVisible();
    expect(screen.queryByTestId('settings-language-en')).toBeNull();
    expect(screen.queryByTestId('settings-language-ja')).toBeNull();
    expect(screen.queryByTestId('settings-theme-system')).toBeNull();
    expect(screen.queryByTestId('settings-theme-light')).toBeNull();
    expect(screen.queryByTestId('settings-theme-dark')).toBeNull();
  });

  // the standalone i18next instance `jest.setup.ts` registers starts at
  // `en`, with no resources loaded — `t()` falls back to returning the key
  // itself, which is what this asserts against rather than real English
  // copy (see that file's own comment).
  it("shows the active language's own value on the Language row", () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-language-row-value')).toHaveTextContent(
      'language.optionEnglish',
    );
  });

  // the mocked Unistyles runtime (wired in `jest.setup.ts`) reports
  // `hasAdaptiveThemes: false` and no `themeName`, which
  // `resolveThemePreferenceFromRuntime` maps to `dark` — the same runtime
  // state `theme-screen.test.tsx` pins its own "starts with Dark selected"
  // case against.
  it('shows the current theme preference on the Theme row, from the mocked runtime default', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-theme-row-value')).toHaveTextContent('theme.optionDark');
  });

  // this is the extension of issue #20 this change makes: the Theme
  // screen's own tap now writes a store both screens read, so the
  // Settings screen's Theme row updates even though it never re-derives
  // from the Unistyles runtime itself.
  it('reflects a theme preference the Theme screen sets, without the Settings screen re-mounting', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-theme-row-value')).toHaveTextContent('theme.optionDark');

    act(() => {
      setThemePreference('system');
    });

    expect(screen.getByTestId('settings-theme-row-value')).toHaveTextContent('theme.optionSystem');
  });

  it('navigates to /settings-language when the Language row is pressed', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-language-row'));

    expect(mockedPush).toHaveBeenCalledWith('/settings-language');
  });

  it('navigates to /settings-theme when the Theme row is pressed', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-theme-row'));

    expect(mockedPush).toHaveBeenCalledWith('/settings-theme');
  });

  it("keeps the About section's Feedback row navigating to /feedback", () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-about-feedback'));

    expect(mockedPush).toHaveBeenCalledWith('/feedback');
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `SettingsScreen`'s own root `View`, not merely type-level.
describe('<SettingsScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(<SettingsScreen style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('settings-screen');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this screen's own `flex: 1`, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('flex', 1);
  });
});
