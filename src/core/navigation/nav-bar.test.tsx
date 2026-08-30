// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../shared/ui/segmented-tabs/
// segmented-tabs.test.tsx` for why this side-effect import must run before
// anything themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { NavBar } from './nav-bar';

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// `NavBar`'s own `handleBack` fires `triggerHaptic(HapticEvent.SecondaryAction)`
// on every back-button press, per `../haptics/haptics.ts`'s event table —
// the one thing this file covers, not `NavBar`'s already-tested rendering.
describe('<NavBar /> back button', () => {
  it('fires the secondaryAction haptic and calls onBack on press', async () => {
    const onBack = jest.fn();
    await render(<NavBar title="Feedback" onBack={onBack} testID="nav-bar" />);

    await fireEvent.press(screen.getByTestId('nav-bar-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SecondaryAction);
  });
});
