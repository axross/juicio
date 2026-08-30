// registers this project's real themes against the mocked
// `StyleSheet.configure` — see
// `../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own comment
// on why this side-effect import has to run before anything themed
// renders.
import '@/core/theme/unistyles';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronLeftIcon } from '@/core/icons/chevron-left-icon';

import { TabBarItem } from './tab-bar-item';

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// this component's own `handlePress` retrofits `triggerHaptic(HapticEvent.SelectionChange)`
// onto every press, active tab re-selected included — per this component's
// own doc comment and `../haptics/haptics.ts`'s event table.
describe('<TabBarItem />', () => {
  it('fires the selectionChange haptic and calls onPress on press', async () => {
    const onPress = jest.fn();
    await render(
      <TabBarItem
        label="Analyze"
        Icon={ChevronLeftIcon}
        active={false}
        onPress={onPress}
        testID="tab-analyze"
      />,
    );

    await fireEvent.press(screen.getByTestId('tab-analyze'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });
});
