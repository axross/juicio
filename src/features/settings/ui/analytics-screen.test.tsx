import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { useAnalyticsPreferenceStore } from '../adapter/use-analytics-preference';
import { changeAnalyticsPreference } from '../usecase/change-analytics-preference';
import { AnalyticsScreen } from './analytics-screen';

// same reasoning as `theme-screen.test.tsx`'s own `change-theme` mock: a
// factory mock keeps the real module — and the AsyncStorage write and the
// native Amplitude SDK it reaches, transitively, through
// `@/core/instrumentation/analytics.ts` — out of this test entirely.
jest.mock('../usecase/change-analytics-preference', () => ({
  changeAnalyticsPreference: jest.fn(),
}));
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedChangeAnalyticsPreference = jest.mocked(changeAnalyticsPreference);

beforeEach(() => {
  mockedChangeAnalyticsPreference.mockResolvedValue(undefined);
});

// the store is a module-level singleton (see `use-analytics-preference.ts`),
// so a preference set in one test would otherwise leak into the next.
afterEach(() => {
  useAnalyticsPreferenceStore.setState({ enabled: true });
});

describe('<AnalyticsScreen />', () => {
  it('renders its own nav bar, titled with the Analytics row label', () => {
    render(<AnalyticsScreen onBack={jest.fn()} />);

    const navBar = screen.getByTestId('settings-analytics-nav-bar');
    expect(navBar).toBeVisible();
    expect(within(navBar).getByTestId('title')).toHaveTextContent('about.analytics');
  });

  it('calls onBack when the nav bar back affordance is pressed', () => {
    const onBack = jest.fn();
    render(<AnalyticsScreen onBack={onBack} />);

    fireEvent.press(within(screen.getByTestId('settings-analytics-nav-bar')).getByTestId('back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a description below the switch card', () => {
    render(<AnalyticsScreen onBack={jest.fn()} />);

    expect(
      within(screen.getByTestId('settings-analytics')).getByTestId('description'),
    ).toHaveTextContent('analytics.description');
  });

  it('starts with the switch on, per the default preference', () => {
    render(<AnalyticsScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-analytics-switch')).toBeChecked();
  });

  // `changeAnalyticsPreference` is mocked (see the module mock above), the
  // same reason `language-screen.test.tsx`'s own "calls changeLanguage when
  // a language row is pressed" case stops at asserting the call rather than
  // a live UI transition: the mock never touches the real store this
  // screen's own switch reads, so nothing here would move on-screen either
  // way — `use-analytics-preference.test.ts` is what proves the real
  // `setAnalyticsPreference` call this usecase makes actually updates it.
  it('calls changeAnalyticsPreference(false) when the switch is pressed while on', () => {
    render(<AnalyticsScreen onBack={jest.fn()} />);

    fireEvent.press(screen.getByTestId('settings-analytics-switch'));

    expect(mockedChangeAnalyticsPreference).toHaveBeenCalledWith(false);
  });

  it('reflects a preference the store already holds, e.g. set by a previous session', () => {
    useAnalyticsPreferenceStore.setState({ enabled: false });

    render(<AnalyticsScreen onBack={jest.fn()} />);

    expect(screen.getByTestId('settings-analytics-switch')).not.toBeChecked();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `AnalyticsScreen`'s own root `View`, not merely type-level.
describe('<AnalyticsScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', () => {
    render(<AnalyticsScreen onBack={jest.fn()} style={{ marginTop: 10 }} />);

    const root = screen.getByTestId('settings-analytics-screen');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    expect(flattenedStyle).toHaveProperty('flex', 1);
  });
});
