// registers this project's real themes against the mocked
// `StyleSheet.configure` — see
// `../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own
// comment on why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { triggerHaptic } from '@/core/haptics/haptics';

import { RadioRow } from './radio-row';

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// this component's own `handlePress` retrofits `triggerHaptic('selectionChange')`
// onto every press, the already-selected option re-pressed included — per
// this component's own doc comment and `../../../core/haptics/haptics.ts`'s
// event table.
describe('<RadioRow />', () => {
  it('fires the selectionChange haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(
      <RadioRow
        label="English"
        selected={false}
        onPress={onPress}
        position="single"
        testID="row"
      />,
    );

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('selectionChange');
  });
});
