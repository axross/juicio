import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { changeLanguage } from '../usecase/change-language';
import { LanguageScreen } from './language-screen';

// a factory mock keeps the real modules — and the native AsyncStorage and
// Sentry SDKs they reach — out of this test entirely.
jest.mock('../usecase/change-language', () => ({ changeLanguage: jest.fn() }));
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedChangeLanguage = jest.mocked(changeLanguage);

beforeEach(() => {
  mockedChangeLanguage.mockResolvedValue(undefined);
});

describe('<LanguageScreen />', () => {
  it('renders its own nav bar, titled with the language section heading', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    const navBar = screen.getByTestId('settings-language-nav-bar');
    expect(navBar).toBeVisible();
    // `title` is a non-root child's local testID (docs/conventions/
    // component-contracts.md's "A Non-Root Child Gets Its Own Local
    // testID"), no longer unique across the tree — scoped through the nav
    // bar's own testID.
    expect(within(navBar).getByTestId('title')).toHaveTextContent('language.sectionTitle');
  });

  it('calls onBack when the nav bar back affordance is pressed', () => {
    const onBack = jest.fn();
    render(<LanguageScreen onBack={onBack} />);

    fireEvent.press(within(screen.getByTestId('settings-language-nav-bar')).getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // the standalone i18next instance `jest.setup.ts` registers starts at
  // `en`, so this is the state actually rendered before any press — not a
  // post-press transition, since `changeLanguage` is mocked and never
  // moves `i18n.language` itself.
  it('renders the active language as checked', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-language-en')).toBeChecked();
    expect(screen.getByTestId('settings-language-ja')).not.toBeChecked();
  });

  it('calls changeLanguage when a language row is pressed', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-language-ja'));

    expect(mockedChangeLanguage).toHaveBeenCalledWith('ja');
  });

  // `SettingsSection`'s description carries the local testID `description`
  // only when it actually renders one, scoped under `LanguageScreen`'s own
  // `testID="settings-language"` section — so this fails the moment
  // `LanguageScreen` ever grows a real description of its own, unlike
  // asserting the absence of `ThemeScreen`'s unrelated `description`
  // scoped under `settings-theme`, which no `LanguageScreen` change could
  // ever render.
  it('shows no description below the options card', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    expect(within(screen.getByTestId('settings-language')).queryByTestId('description')).toBeNull();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `LanguageScreen`'s own root `View`, not merely type-level.
describe('<LanguageScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(<LanguageScreen onBack={jest.fn()} style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('settings-language-screen');
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
