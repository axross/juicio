import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { useThemePreferenceStore } from '../adapter/use-theme-preference';
import { changeTheme } from '../usecase/change-theme';
import { ThemeScreen } from './theme-screen';

// same reasoning as the pre-existing `settings-screen.test.tsx` had for
// this pair, before this screen's own radio rows moved out of that file
// (issue #76): a factory mock keeps the real module — and the native
// `UnistylesRuntime` and Sentry SDK it reaches — out of this test entirely.
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
  // runtime state issue #20's defect needs, since the mock's own
  // `setAdaptiveThemes`/`setTheme` are no-ops that never notify
  // `useUnistyles()`.
  it('starts with Dark selected, per the mocked runtime default and no stored preference', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-theme-dark')).toBeChecked();
    expect(screen.getByTestId('settings-theme-system')).not.toBeChecked();
    expect(screen.getByTestId('settings-theme-light')).not.toBeChecked();
  });

  // this is the #20 regression itself, moved here from the old
  // `settings-screen.test.tsx`: `Dark` → `System` is a same-theme
  // transition against the mocked runtime (both resolve to `dark`), so
  // Unistyles' own notification never fires and only the store this
  // screen writes on tap can move the selection.
  it('moves the selection to System on a same-theme transition', () => {
    render(<ThemeScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-theme-system'));

    expect(screen.getByTestId('settings-theme-system')).toBeChecked();
    expect(screen.getByTestId('settings-theme-dark')).not.toBeChecked();
    expect(mockedChangeTheme).toHaveBeenCalledWith('system');
  });

  // pins the cross-theme path, which already worked before #20's fix and
  // must keep working: a real Unistyles runtime would notify here too, but
  // the store this screen writes is what this test observes either way.
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
