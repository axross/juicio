import { fireEvent, render, screen } from '@testing-library/react-native';

import { changeLanguage } from '../usecase/change-language';
import { LanguageScreen } from './language-screen';

// same reasoning as the pre-existing `settings-screen.test.tsx` had for
// this pair, before this screen's own content moved out of that file
// (issue #76): a factory mock keeps the real modules — and the native
// AsyncStorage and Sentry SDKs they reach — out of this test entirely.
jest.mock('../usecase/change-language', () => ({ changeLanguage: jest.fn() }));
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedChangeLanguage = jest.mocked(changeLanguage);

beforeEach(() => {
  mockedChangeLanguage.mockResolvedValue(undefined);
});

describe('<LanguageScreen />', () => {
  it('renders its own nav bar, titled with the language section heading', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-language-nav-bar')).toBeVisible();
    expect(screen.getByTestId('settings-language-nav-bar-title')).toHaveTextContent(
      'language.sectionTitle',
    );
  });

  it('calls onBack when the nav bar back affordance is pressed', () => {
    const onBack = jest.fn();
    render(<LanguageScreen onBack={onBack} />);

    fireEvent.press(screen.getByTestId('settings-language-nav-bar-back'));

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

  it('shows no description below the options card', () => {
    render(<LanguageScreen onBack={jest.fn()} />);

    expect(screen.queryByTestId('settings-theme-description')).toBeNull();
  });
});
