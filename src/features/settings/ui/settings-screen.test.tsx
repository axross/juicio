import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAnalyticsPreferenceStore } from '../adapter/use-analytics-preference';
import { setThemePreference, useThemePreferenceStore } from '../adapter/use-theme-preference';
import { SettingsScreen } from './settings-screen';

// this screen now reaches into `react-native-reanimated` directly (its own
// scroll view's `useAnimatedScrollHandler`, for issue #260's scroll-linked
// nav-bar contract), which reaches into `react-native-worklets`'s native
// module on init — this project's own established pair of mocks for that
// (see `@/shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s identical pair
// and its own comment for why `require()` inside the factory, not a
// same-file `import`, is what gets the load order right).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// the library's own published Jest mock, since nothing here needs to
// assert a resolved scroll-linked value (docs/conventions/testing.md).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// the Settings screen imports `expo-router`'s `router` to push into its
// child screens, and calling the real implementation with no navigator
// mounted queues rather than throws, which would leave
// `toHaveBeenCalledWith` nothing to assert against. a factory mock is what
// makes the call observable.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedPush = jest.mocked(router.push);

// the store is a module-level singleton (see `use-theme-preference.ts`), so
// a preference set in one test would otherwise leak into the next.
afterEach(() => {
  useThemePreferenceStore.setState({ preference: undefined });
  useAnalyticsPreferenceStore.setState({ enabled: true });
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

  // the Theme screen's own tap writes a store both screens read, so the
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

  it('navigates to /settings-analytics when the Analytics row is pressed', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-about-analytics'));

    expect(mockedPush).toHaveBeenCalledWith('/settings-analytics');
  });

  it("shows the analytics preference's current value on the Analytics row, defaulting to On", () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('settings-about-analytics-value')).toHaveTextContent(
      'analytics.onValue',
    );
  });

  it('reflects an analytics preference the Analytics screen sets, without the Settings screen re-mounting', () => {
    render(<SettingsScreen />);

    act(() => {
      useAnalyticsPreferenceStore.setState({ enabled: false });
    });

    expect(screen.getByTestId('settings-about-analytics-value')).toHaveTextContent(
      'analytics.offValue',
    );
  });
});

// issue #260's pre-flight review, finding 1: this screen's own half of
// `NavBar`'s scroll-linked blur contract (`scrollOffset={scrollOffset}`,
// `./settings-screen.tsx`) had no assertion of its own anywhere — mirrors
// `@/features/evaluations/ui/analyze-screen/analyze-screen.test.tsx`'s own
// identically-shaped test for its own precedent case.
describe('<SettingsScreen /> nav bar scroll wiring (issue #260)', () => {
  it('wires its own scroll offset into NavBar, mounting the scroll-linked blur overlay', () => {
    render(<SettingsScreen />);

    const navBar = within(screen.getByTestId('settings-nav-bar'));
    expect(navBar.getByTestId('nav-bar-blur')).toBeTruthy();
    expect(navBar.getByTestId('nav-bar-scroll-tint')).toBeTruthy();
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
