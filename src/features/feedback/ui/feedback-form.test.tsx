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
  it('disables Send while the message is empty, and enables it once typed', () => {
    render(<FeedbackForm />);

    expect(screen.getByTestId('feedback-submit-bar')).toBeDisabled();

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');

    expect(screen.getByTestId('feedback-submit-bar')).not.toBeDisabled();
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
