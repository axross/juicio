// registers this project's real themes against the mocked
// `StyleSheet.configure` — see
// `../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own comment
// on why this side-effect import has to run before anything themed
// renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { triggerHaptic } from '@/core/haptics/haptics';

import { NavBar } from './nav-bar';

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// this component's own `handleBack` retrofits `triggerHaptic('secondaryAction')`
// onto every back-button press, per `../haptics/haptics.ts`'s own event
// table — the one call site this test file covers, not the rest of
// `NavBar`'s already-tested rendering.
describe('<NavBar /> back button', () => {
  it('fires the secondaryAction haptic and calls onBack on press', async () => {
    const onBack = jest.fn();
    await render(<NavBar title="Feedback" onBack={onBack} testID="nav-bar" />);

    await fireEvent.press(screen.getByTestId('nav-bar-back'));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('secondaryAction');
  });
});
