import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { useKeyboardVisible } from '../adapter/use-keyboard-visible';
import { sendFeedback } from '../usecase/send-feedback';
import { FeedbackForm } from './feedback-form';

// `SubmitBar` renders the real, byte-identical `Button`, which fires a
// haptic on press and, through it, reaches `@/core/instrumentation/
// report-error` and `@sentry/react-native` — the same native-SDK
// `setInterval` hazard `button.test.tsx` and `settings-screen.test.tsx`
// mock away. mocked here for the same reason.
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// this test's job is the form's own three-state rendering and its
// submit-bar visibility, not what `sendFeedback` or `useKeyboardVisible` do
// internally — both are mocked so each test drives them directly.
jest.mock('../usecase/send-feedback');
jest.mock('../adapter/use-keyboard-visible');

const mockedSendFeedback = jest.mocked(sendFeedback);
const mockedUseKeyboardVisible = jest.mocked(useKeyboardVisible);

beforeEach(() => {
  mockedSendFeedback.mockReset();
  mockedUseKeyboardVisible.mockReset();
  mockedUseKeyboardVisible.mockReturnValue(false);
});

describe('<FeedbackForm />', () => {
  // the two props below are the entire keyboard-dismissal mechanism the
  // form's own header comment describes (dragging the scroll view, or
  // tapping outside the focused field) — `keyboardShouldPersistTaps`
  // defaults to `"never"` regardless, but asserting it here pins that
  // default explicitly, exactly as the component's own comment does.
  it('carries the keyboard-dismissal props on its scroll view', () => {
    render(<FeedbackForm />);

    const scrollView = screen.getByTestId('feedback-scroll');
    expect(scrollView.props.keyboardDismissMode).toBe('on-drag');
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('never');
  });

  // Send validates on press, not on every keystroke — see
  // docs/specs/settings.md and the high-fidelity-ui-design skill's
  // disabled-vs-validate-on-press rule — so it stays pressable with the
  // message field still empty, unlike the disabled-until-typed control this
  // replaced.
  it('is pressable while the message is empty', () => {
    render(<FeedbackForm />);

    expect(screen.getByTestId('feedback-submit-bar')).not.toBeDisabled();
  });

  it('shows the message-required error and sends nothing on a blank message', () => {
    mockedSendFeedback.mockReturnValue({ status: 'invalid', reason: 'emptyMessage' });
    render(<FeedbackForm />);

    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.getByTestId('feedback-message-input-error')).toBeVisible();
    expect(screen.queryByTestId('feedback-error-banner')).toBeNull();
  });

  it('clears the message-required error once the draft is valid on the next press', () => {
    mockedSendFeedback.mockReturnValueOnce({ status: 'invalid', reason: 'emptyMessage' });
    render(<FeedbackForm />);

    fireEvent.press(screen.getByTestId('feedback-submit-bar'));
    expect(screen.getByTestId('feedback-message-input-error')).toBeVisible();

    // the draft now passes validation (only Sentry's own availability check
    // fails), so the message-required error should clear even though this
    // second press does not reach the completion state either.
    mockedSendFeedback.mockReturnValueOnce({ status: 'unavailable' });
    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.queryByTestId('feedback-message-input-error')).toBeNull();
  });

  it('hides the submit bar entirely while the keyboard is visible', () => {
    mockedUseKeyboardVisible.mockReturnValue(true);

    render(<FeedbackForm />);

    expect(screen.queryByTestId('feedback-submit-bar')).toBeNull();
  });

  it('shows the submit bar again once the keyboard closes', () => {
    mockedUseKeyboardVisible.mockReturnValue(false);

    render(<FeedbackForm />);

    expect(screen.getByTestId('feedback-submit-bar')).toBeVisible();
  });

  it('shows an inline email error and sends nothing on an invalid email', () => {
    mockedSendFeedback.mockReturnValue({ status: 'invalid', reason: 'invalidEmail' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.changeText(screen.getByTestId('feedback-email-input'), 'not-an-email');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.getByTestId('feedback-email-input-error')).toBeVisible();
    expect(screen.queryByTestId('feedback-error-banner')).toBeNull();
  });

  it('shows the unavailable banner and preserves the typed message', () => {
    mockedSendFeedback.mockReturnValue({ status: 'unavailable' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.getByTestId('feedback-error-banner')).toBeVisible();
    expect(screen.getByTestId('feedback-message-input').props.value).toBe('Great app');
  });

  it('shows the sendFailed banner and preserves the typed message', () => {
    mockedSendFeedback.mockReturnValue({ status: 'failed' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.getByTestId('feedback-error-banner')).toBeVisible();
    expect(screen.getByTestId('feedback-message-input').props.value).toBe('Great app');
  });

  it('replaces the form and the submit bar with the completion state on success', () => {
    mockedSendFeedback.mockReturnValue({ status: 'sent' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(screen.getByTestId('feedback-sent')).toBeVisible();
    expect(screen.queryByTestId('feedback-scroll')).toBeNull();
    expect(screen.queryByTestId('feedback-submit-bar')).toBeNull();
  });
});
