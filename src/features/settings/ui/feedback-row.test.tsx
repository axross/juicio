// registers this project's real themes against the mocked
// `StyleSheet.configure` — see
// `../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own
// comment on why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { FeedbackRow } from './feedback-row';

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// this component's own `handlePress` retrofits `triggerHaptic(HapticEvent.SecondaryAction)`
// onto every press — per `../../../core/haptics/haptics.ts`'s event table.
describe('<FeedbackRow />', () => {
  it('fires the secondaryAction haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(<FeedbackRow label="Feedback" onPress={onPress} position="single" testID="row" />);

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SecondaryAction);
  });
});
