import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet as RNStyleSheet } from 'react-native';

// registers this project's real themes against the mocked
// `StyleSheet.configure` (`react-native-unistyles/mocks`, wired in
// `jest.config.js`'s `setupFiles`) — without this, `useUnistyles()`/
// `StyleSheet.create` resolve `theme` to `{}` and every token read in
// `segmented-tabs.tsx`'s stylesheet throws.
import '@/core/theme/unistyles';

import { SegmentedTabs } from './segmented-tabs';

// this component now imports `react-native-reanimated` directly (the
// sliding selected pill, PR #70's motion system), which reaches into
// `react-native-worklets`' native module on import — same reason
// `../bottom-sheet/bottom-sheet.test.tsx` needs this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// `segmented-tabs.tsx` fires `triggerHaptic` on selection, and this test
// doesn't mock `@/core/haptics/haptics` — the real module runs fine under
// Jest (`expo-haptics` is mocked at the native-module boundary), but it
// reaches `@/core/instrumentation/report-error` and, through it,
// `@sentry/react-native`, which starts a real `setInterval` nothing here
// clears. mocking `report-error` alone — same reasoning as
// `settings-screen.test.tsx`'s comment — keeps the native SDK out without
// mocking haptics itself.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

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

    expect(screen.getByTestId('tab-players').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('tab-history').props.accessibilityState).toEqual({
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

    await fireEvent.press(screen.getByTestId('tab-history'));

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

    await fireEvent.press(screen.getByTestId('tab-players'));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith('players');
  });

  // PR #70's motion system: the selected pill is one shared element now,
  // not a per-tab background variant — this pins that it exists, and
  // that its width tracks the track's own measured width, rather than
  // proving it actually slides (RNTL runs no layout engine and Reanimated
  // is mocked in every component test that reaches this module — nothing
  // here observes real motion, docs/conventions/testing.md).
  it('renders exactly one selected pill, sized from the measured track width', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.getAllByTestId('tabs-pill')).toHaveLength(1);

    await fireEvent(screen.getByTestId('tabs'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 44 } },
    });

    const pillStyle = RNStyleSheet.flatten(screen.getByTestId('tabs-pill').props.style);
    expect(pillStyle.width).toBeCloseTo((240 - 3 * 2) / ITEMS.length, 9);
  });
});
