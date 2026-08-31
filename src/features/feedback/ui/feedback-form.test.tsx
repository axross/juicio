import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

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
// `@react-native/jest-preset` already replaces `AccessibilityInfo` with an
// all-`jest.fn()` mock (see docs/conventions/accessibility.md for why the
// form calls `announceForAccessibility` at all) — `jest.mocked` here just
// gives this file a typed handle onto that existing mock, no further
// `jest.mock` call needed.
const mockedAnnounce = jest.mocked(AccessibilityInfo.announceForAccessibility);

beforeEach(() => {
  mockedSendFeedback.mockReset();
  mockedUseKeyboardVisible.mockReset();
  mockedUseKeyboardVisible.mockReturnValue(false);
  mockedAnnounce.mockReset();
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

    const errorText = screen.getByTestId('feedback-message-input-error');
    expect(errorText).toBeVisible();
    expect(screen.queryByTestId('feedback-error-banner')).toBeNull();
    // the announcement is this project's stand-in for `aria-describedby` —
    // see docs/conventions/accessibility.md — so someone whose focus is
    // still on the just-pressed Send button learns the submission failed.
    // asserted against the rendered error's own text rather than a literal
    // English string, since `jest.setup.ts`'s standalone i18next instance
    // carries no `resources` and `t()` falls back to returning its key.
    expect(mockedAnnounce).toHaveBeenCalledWith(errorText.props.children);
  });

  // the bug this pins: typing into the message must clear its error by
  // itself, with no second Send press — see the high-fidelity-ui-design
  // skill's interaction-states-and-feedback.md rule to re-validate live
  // only after a field has already shown an error, so the user watches it
  // clear.
  it('clears the message-required error as soon as the message changes, with no second press', () => {
    mockedSendFeedback.mockReturnValueOnce({ status: 'invalid', reason: 'emptyMessage' });
    render(<FeedbackForm />);

    fireEvent.press(screen.getByTestId('feedback-submit-bar'));
    expect(screen.getByTestId('feedback-message-input-error')).toBeVisible();

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');

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

    const errorText = screen.getByTestId('feedback-email-input-error');
    expect(errorText).toBeVisible();
    expect(screen.queryByTestId('feedback-error-banner')).toBeNull();
    expect(mockedAnnounce).toHaveBeenCalledWith(errorText.props.children);
  });

  // same bug, same fix, on the second field — see the message-field test
  // above.
  it('clears the email-invalid error as soon as the email changes, with no second press', () => {
    mockedSendFeedback.mockReturnValueOnce({ status: 'invalid', reason: 'invalidEmail' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.changeText(screen.getByTestId('feedback-email-input'), 'not-an-email');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));
    expect(screen.getByTestId('feedback-email-input-error')).toBeVisible();

    fireEvent.changeText(screen.getByTestId('feedback-email-input'), 'me@example.com');

    expect(screen.queryByTestId('feedback-email-input-error')).toBeNull();
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

  it('does not announce anything on a successful submit', () => {
    mockedSendFeedback.mockReturnValue({ status: 'sent' });
    render(<FeedbackForm />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    expect(mockedAnnounce).not.toHaveBeenCalled();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `FeedbackForm`'s own root `View`, not merely type-level —
// `FeedbackForm` renders one of two different roots depending on `sent`
// (`styles.root` and `styles.sentRoot`), so both branches are exercised
// below, not just the form's own default state.
describe('<FeedbackForm /> style', () => {
  it('merges a caller-supplied style onto its own root style while the form is showing', () => {
    render(<FeedbackForm style={{ marginTop: 10 }} />);

    const root = screen.toJSON();
    // this branch's root is the tree's own single top node — never an
    // array of siblings — so this narrows `screen.toJSON()`'s own wider
    // return type down to the one shape `.props` is actually reachable on.
    if (root === null || Array.isArray(root)) {
      throw new Error('expected a single rendered root');
    }
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this branch's own `flex: 1`, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('flex', 1);
  });

  it('merges the same caller-supplied style onto its other root, once the sent state replaces the form', () => {
    mockedSendFeedback.mockReturnValue({ status: 'sent' });
    render(<FeedbackForm style={{ marginTop: 10 }} />);

    fireEvent.changeText(screen.getByTestId('feedback-message-input'), 'Great app');
    fireEvent.press(screen.getByTestId('feedback-submit-bar'));

    const root = screen.getByTestId('feedback-sent');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived on this other root too...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this branch's own centring, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('alignItems', 'center');
  });
});
