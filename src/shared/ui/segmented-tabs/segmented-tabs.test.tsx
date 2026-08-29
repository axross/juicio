import { fireEvent, render, screen } from '@testing-library/react-native';

// registers this project's real themes against the mocked
// `StyleSheet.configure` (see `react-native-unistyles/mocks`, wired in
// `jest.config.js`'s `setupFiles`) — without this, `useUnistyles()`/
// `StyleSheet.create` resolve `theme` to `{}` and every token read in
// `segmented-tabs.tsx`'s stylesheet throws.
import '@/core/theme/unistyles';

import { SegmentedTabs } from './segmented-tabs';

const ITEMS = [
  { key: 'players', label: 'Players' },
  { key: 'history', label: 'History' },
];

describe('<SegmentedTabs />', () => {
  it('reports the selected tab as accessibilityState.selected and the other as not', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.getByTestId('tabs-players').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('tabs-history').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("calls onSelectionChange with the pressed tab's key when an unselected tab is pressed", async () => {
    const onSelectionChange = jest.fn();
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={onSelectionChange}
        testID="tabs"
      />,
    );

    await fireEvent.press(screen.getByTestId('tabs-history'));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith('history');
  });

  it('still calls onSelectionChange when the already-selected tab is pressed', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={onSelectionChange}
        testID="tabs"
      />,
    );

    await fireEvent.press(screen.getByTestId('tabs-players'));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith('players');
  });
});
