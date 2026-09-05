import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { useThemePreferenceStore } from '../adapter/use-theme-preference';
import { changeTheme } from '../usecase/change-theme';
import { ThemeScreen } from './theme-screen';

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

// a factory mock keeps the real module — and the native `UnistylesRuntime`
// and Sentry SDK it reaches — out of this test entirely.
jest.mock('../usecase/change-theme', () => ({ changeTheme: jest.fn() }));
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedChangeTheme = jest.mocked(changeTheme);

beforeEach(() => {
  mockedChangeTheme.mockResolvedValue(undefined);
});

// the store is a module-level singleton (see `use-theme-preference.ts`), so
// a preference set in one test would otherwise leak into the next.
afterEach(() => {
  useThemePreferenceStore.setState({ preference: undefined });
});

describe('<ThemeScreen />', () => {
  it('renders its own nav bar, titled with the theme section heading', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    const navBar = screen.getByTestId('settings-theme-nav-bar');
    expect(navBar).toBeVisible();
    // `title` is a non-root child's local testID (docs/conventions/
    // component-contracts.md's "A Non-Root Child Gets Its Own Local
    // testID"), no longer unique across the tree — scoped through the nav
    // bar's own testID.
    expect(within(navBar).getByTestId('title')).toHaveTextContent('theme.sectionTitle');
    // issue #260's pre-flight review, finding 1: this screen's own half of
    // `NavBar`'s scroll-linked blur contract (`scrollOffset={scrollOffset}`,
    // `./theme-screen.tsx`) had no assertion of its own anywhere.
    expect(within(navBar).getByTestId('nav-bar-blur')).toBeTruthy();
    expect(within(navBar).getByTestId('nav-bar-scroll-tint')).toBeTruthy();
  });

  it('calls onBack when the nav bar back affordance is pressed', () => {
    const onBack = jest.fn();
    render(<ThemeScreen onBack={onBack} />);

    fireEvent.press(within(screen.getByTestId('settings-theme-nav-bar')).getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a description below the options card', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    // `description` is a non-root child's local testID, scoped under this
    // screen's own `settings-theme` section — see `language-screen.test.tsx`'s
    // "shows no description" case for the absence counterpart.
    expect(
      within(screen.getByTestId('settings-theme')).getByTestId('description'),
    ).toHaveTextContent('theme.description');
  });

  // the mocked Unistyles runtime (`react-native-unistyles/mocks`, wired in
  // `jest.setup.ts`) reports `hasAdaptiveThemes: false` and no `themeName`,
  // which `resolveThemePreferenceFromRuntime` maps to `dark` — the exact
  // runtime state a same-theme transition needs, since the mock's own
  // `setAdaptiveThemes`/`setTheme` are no-ops that never notify
  // `useUnistyles()`.
  it('starts with Dark selected, per the mocked runtime default and no stored preference', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-theme-dark')).toBeChecked();
    expect(screen.getByTestId('settings-theme-system')).not.toBeChecked();
    expect(screen.getByTestId('settings-theme-light')).not.toBeChecked();
  });

  // `Dark` → `System` is a same-theme transition against the mocked
  // runtime (both resolve to `dark`), so Unistyles' own notification never
  // fires and only the store this screen writes on tap can move the
  // selection.
  it('moves the selection to System on a same-theme transition', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-theme-system'));

    expect(screen.getByTestId('settings-theme-system')).toBeChecked();
    expect(screen.getByTestId('settings-theme-dark')).not.toBeChecked();
    expect(mockedChangeTheme).toHaveBeenCalledWith('system');
  });

  // pins the cross-theme path: a real Unistyles runtime would notify here
  // too, but the store this screen writes is what this test observes
  // either way.
  it('moves the selection on a cross-theme press', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-theme-light'));

    expect(screen.getByTestId('settings-theme-light')).toBeChecked();
    expect(screen.getByTestId('settings-theme-dark')).not.toBeChecked();
    expect(mockedChangeTheme).toHaveBeenCalledWith('light');
  });

  it('writes the tapped preference to the shared store, for the Settings screen to read', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-theme-light'));

    expect(useThemePreferenceStore.getState().preference).toBe('light');
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `ThemeScreen`'s own root `View`, not merely type-level.
describe('<ThemeScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(<ThemeScreen onBack={jest.fn()} style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('settings-theme-screen');
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
