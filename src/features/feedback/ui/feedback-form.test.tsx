import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useKeyboardVisible } from '../adapter/use-keyboard-visible';
import { sendFeedback } from '../usecase/send-feedback';
import { FeedbackForm } from './feedback-form';

// this form now reaches into `react-native-reanimated` directly (its own
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
// `require()`d, not `import`ed, for the same CommonJS-interop reason the
// mock above is — see `@/shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// matching comment. Needed below to spy on `useAnimatedScrollHandler`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

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
  // message field still empty.
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
    // asserted against the rendered error's own text rather than a literal
    // English string, since `jest.setup.ts`'s standalone i18next instance
    // carries no `resources` and `t()` falls back to returning its key.
    expect(mockedAnnounce).toHaveBeenCalledWith(errorText.props.children);
  });

  // typing into the message must clear its error by itself, with no
  // second Send press — see the high-fidelity-ui-design skill's
  // interaction-states-and-feedback.md rule to re-validate live only after
  // a field has already shown an error, so the user watches it clear.
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

// this form's own half of `@/core/navigation/nav-bar.tsx`'s scroll-linked
// blur contract is proven here rather than alongside a `NavBar` instance:
// `@/app/feedback.tsx`, this form's only real caller, hands the *same*
// shared value to both this form and its own `NavBar`
// (`./feedback-form.tsx`'s own doc comment) — but that route module can
// carry no test of its own (docs/conventions/directory-structure.md's "No
// file with `.test.` in its name may live under `src/app/`"), so there is
// no file where "the Feedback screen's NavBar mounted its blur overlay"
// could be asserted directly, the way the other six screens' own tests
// do. What this form *can* prove is that it actually writes a fired
// scroll event into whatever shared value a caller supplies —
// `nav-bar.test.tsx`'s own "mounts the blur overlay once handed a live
// scroll offset" test proves the other half, that `NavBar` mounts its
// blur once that value exists.
describe('<FeedbackForm /> forwards its scroll offset (issue #260)', () => {
  // `react-native-reanimated/mock`'s own `useAnimatedScrollHandler` is a
  // no-op factory that discards whatever handler it's given
  // (`node_modules/react-native-reanimated/src/mock.ts`'s own
  // `useAnimatedScrollHandler: NOOP_FACTORY`, confirmed by reading that
  // file, not assumed) — mirrors `@/shared/ui/bottom-sheet/
  // bottom-sheet.test.tsx`'s own "content drag scroll gating" override to
  // actually invoke the real handler on a fired scroll event.
  beforeEach(() => {
    jest.spyOn(reanimatedMock, 'useAnimatedScrollHandler').mockImplementation(((
      handlers: unknown,
    ) => {
      const onScroll =
        typeof handlers === 'function'
          ? (handlers as (event: unknown, context: unknown) => void)
          : (handlers as { onScroll?: (event: unknown, context: unknown) => void }).onScroll;
      // real Reanimated's own dispatcher calls the processed handler with
      // the native event already unwrapped — this form's own handler
      // (`./feedback-form.tsx`) reads `event.contentOffset.y` directly,
      // never `event.nativeEvent.contentOffset.y`. `fireEvent.scroll`
      // instead calls whatever `onScroll` prop it finds the ordinary React
      // Native way, wrapped in `{ nativeEvent }` — unwrapping it here is
      // what lets the real handler still read the shape it expects.
      return (event: { nativeEvent: unknown }) => onScroll?.(event.nativeEvent, {});
    }) as unknown as typeof reanimatedMock.useAnimatedScrollHandler);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes a fired scroll event’s offset into the caller-supplied shared value', () => {
    const scrollOffset = reanimatedMock.useSharedValue(0);
    render(<FeedbackForm scrollOffset={scrollOffset} />);

    fireEvent.scroll(screen.getByTestId('feedback-scroll'), {
      nativeEvent: { contentOffset: { y: 42 } },
    });

    expect(scrollOffset.value).toBe(42);
  });

  it('never throws scrolling with nothing supplied to write into — this form’s own optional-prop shape', () => {
    render(<FeedbackForm />);

    expect(() =>
      fireEvent.scroll(screen.getByTestId('feedback-scroll'), {
        nativeEvent: { contentOffset: { y: 42 } },
      }),
    ).not.toThrow();
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
