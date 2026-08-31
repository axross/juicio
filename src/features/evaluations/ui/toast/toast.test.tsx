// registers this project's real themes and namespaces before anything
// themed renders — see docs/conventions/testing.md and
// `../analyze-screen/analyze-screen.test.tsx`'s own matching imports.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { PortalHost } from '@/shared/ui/portal/portal';

import { Toast } from './toast';

// `@react-native/jest-preset` already replaces `AccessibilityInfo` with an
// all-`jest.fn()` mock (see docs/conventions/accessibility.md for why this
// component calls `announceForAccessibility` at all) — `jest.mocked` here
// just gives this file a typed handle onto that existing mock, the same
// way `../../../feedback/ui/feedback-form.test.tsx` does, no further
// `jest.mock` call needed.
const mockedAnnounce = jest.mocked(AccessibilityInfo.announceForAccessibility);

// this component fires no haptic of its own (its own doc comment, and
// docs/conventions/haptics.md) — no `jest.mock('@/core/haptics/haptics')`
// here, unlike every sheet's own test file, since there is nothing here to
// mock away.

function toastTree(message: string | null, onClear: jest.Mock) {
  return (
    <PortalHost>
      <Toast message={message} onClear={onClear} testID="toast" />
    </PortalHost>
  );
}

async function renderToast(message: string | null, onClear: jest.Mock = jest.fn()) {
  const { rerender } = await render(toastTree(message, onClear));
  return {
    onClear,
    // swaps `message` on the same instance, the same technique
    // `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
    // `renderSheet`/`rerender` pair uses for a prop that has to change
    // without remounting — a fresh mount would trivially "restart the
    // clock" for the wrong reason.
    rerenderWith: async (next: string | null) => {
      await rerender(toastTree(next, onClear));
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedAnnounce.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('<Toast /> with a null message', () => {
  it('renders nothing', async () => {
    await renderToast(null);

    expect(screen.queryByTestId('toast')).toBeNull();
    expect(mockedAnnounce).not.toHaveBeenCalled();
  });
});

describe('<Toast /> with a message', () => {
  it('renders the card with its message text, the dismiss accessibility label, and the icon chip', async () => {
    await renderToast('The board was incomplete, so it was reverted.');

    const card = screen.getByTestId('toast');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Dismiss alert message');
    expect(screen.getByTestId('message')).toHaveTextContent(
      'The board was incomplete, so it was reverted.',
    );
    expect(screen.getByTestId('chip')).toBeTruthy();
  });

  it('announces itself to VoiceOver/TalkBack the moment it appears', async () => {
    await renderToast('The board was incomplete, so it was reverted.');

    expect(mockedAnnounce).toHaveBeenCalledTimes(1);
    expect(mockedAnnounce).toHaveBeenCalledWith('The board was incomplete, so it was reverted.');
  });
});

describe('<Toast /> self-clearing', () => {
  it('has not cleared itself before the delay elapses', async () => {
    const { onClear } = await renderToast('first message');

    // SHOULD assert nothing happened before advancing, as well as after —
    // otherwise this test would pass against a component with no delay at
    // all (jest-testing's own fake-timers guidance).
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(onClear).not.toHaveBeenCalled();
  });

  it('fires onClear exactly once, with no interaction, once the delay elapses', async () => {
    const { onClear } = await renderToast('first message');

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onClear).toHaveBeenCalledTimes(1);

    // nothing left pending to fire a second time.
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('<Toast /> tapped', () => {
  it('fires onClear immediately, without waiting for the delay', async () => {
    const { onClear } = await renderToast('first message');

    await fireEvent.press(screen.getByTestId('toast'));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('fires onClear exactly once even when the auto-clear delay would otherwise still elapse for the same toast', async () => {
    // this is what actually proves docs/conventions/component-contracts.md's
    // "exactly one outcome callback, exactly once" rule, rather than merely
    // exercising the two paths in isolation — a real caller reacts to
    // `onClear` by setting `message` back to `null` on its next render, but
    // this test deliberately never does that (`renderToast`'s own `onClear`
    // is a bare spy), so the only thing standing between a tap and a
    // double-fire is this component's own guard.
    const { onClear } = await renderToast('first message');

    await fireEvent.press(screen.getByTestId('toast'));
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('<Toast /> replacing the message it is already showing', () => {
  it('shows the new message in place of the old one, restarts its own clock, and announces the new message', async () => {
    const { onClear, rerenderWith } = await renderToast('first message');
    expect(mockedAnnounce).toHaveBeenCalledTimes(1);

    // 3s into the first message's own five-second clock.
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    await rerenderWith('second message');

    // the card now shows the new message, not a second one stacked beside
    // the first — this component's own `usePortal` call renders exactly
    // one node at a time by construction (`message === null ? null :
    // <card>`), so there is no second card to assert the absence of; what
    // this proves is that the *content* actually swapped.
    expect(screen.getByTestId('message')).toHaveTextContent('second message');
    expect(mockedAnnounce).toHaveBeenCalledTimes(2);
    expect(mockedAnnounce).toHaveBeenLastCalledWith('second message');

    // 2.5s further — 5.5s since the *first* message appeared, which would
    // already have fired under the first message's own clock if replacing
    // it had not reset it, but under the *new* message's own five-second
    // clock (started at the 3s mark) this is still only 2.5s in.
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(onClear).not.toHaveBeenCalled();

    // 2.5s further still — 5s since the second message appeared — is what
    // finally clears it, proving the clock actually did restart rather
    // than never having been running at all.
    act(() => {
      jest.advanceTimersByTime(2500);
    });
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
