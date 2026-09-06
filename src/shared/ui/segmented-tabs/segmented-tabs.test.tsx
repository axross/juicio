import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet as RNStyleSheet, View } from 'react-native';

// registers this project's real themes against the mocked
// `StyleSheet.configure` (`react-native-unistyles/mocks`, wired in
// `jest.config.js`'s `setupFiles`) — without this, `useUnistyles()`/
// `StyleSheet.create` resolve `theme` to `{}` and every token read in
// `segmented-tabs.tsx`'s stylesheet throws.
import '@/core/theme/unistyles';

import type { IconProps } from '@/core/icons/icon-props';
import { lightTheme } from '@/core/theme/tokens';

import { SegmentedTabs, type SegmentedTabsItem } from './segmented-tabs';

// this component imports `react-native-reanimated` directly (the sliding
// selected pill), which reaches into `react-native-worklets`' native
// module on import — same reason `../bottom-sheet/bottom-sheet.test.tsx`
// needs this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// the real `withSpring`/`withTiming`/`withSequence` schedule an actual
// multi-frame animation on the UI thread and never resolve inside one
// synchronous test tick — `react-native-reanimated/mock`'s versions
// collapse straight to a resolved value instead, the same reason
// `../bottom-sheet/bottom-sheet.test.tsx` mocks this too.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

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

// two distinct component identities, one per tab, so a test can tell which
// tab's own icon it found via `screen.UNSAFE_getAllByType` rather than by
// position alone — mirrors this control's real, production consumer
// (`../../../features/hand-ranges/ui/holding-input-sheet/holding-input-sheet.tsx`),
// which wires a different icon per tab too. neither renders anything a
// test needs to see beyond its own received props, which
// `UNSAFE_getAllByType` reads directly off the element itself.
function PlayersIcon({ color, size = 24, testID }: IconProps) {
  return <View testID={testID} style={{ width: size, height: size, borderColor: color }} />;
}
function HistoryIcon({ color, size = 24, testID }: IconProps) {
  return <View testID={testID} style={{ width: size, height: size, borderColor: color }} />;
}

const ITEMS_WITH_ICONS: readonly SegmentedTabsItem[] = [
  { key: 'players', label: 'Players', icon: PlayersIcon },
  { key: 'history', label: 'History', icon: HistoryIcon },
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

  // the selected pill is one shared element, not a per-tab background
  // variant — this pins that it exists, and that its width tracks the
  // track's own measured width, rather than proving it actually slides
  // (RNTL runs no layout engine and Reanimated is mocked in every
  // component test that reaches this module — nothing here observes real
  // motion, docs/conventions/testing.md).
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
    // 4 — this control's own track padding, on both sides of the axis this
    // control lays tabs out on. the track itself carries no border to
    // compensate for any more (`segmented-tabs.tsx`'s own `cellWidth`
    // comment).
    expect(pillStyle.width).toBeCloseTo((240 - 4 * 2) / ITEMS.length, 9);
  });

  it("fills the pill with the tonal accent token and rings it in the brand accent, not the track's old border", async () => {
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    const trackStyle = RNStyleSheet.flatten(screen.getByTestId('tabs').props.style);
    const pillStyle = RNStyleSheet.flatten(screen.getByTestId('tabs-pill').props.style);

    expect(trackStyle.borderWidth).toBeUndefined();
    expect(pillStyle.backgroundColor).toBe(lightTheme.colors.component.accent.rest);
    expect(pillStyle.borderWidth).toBe(lightTheme.borderWidth.base);
    expect(pillStyle.borderColor).toBe(lightTheme.colors.text.accent.brand);
  });
});

describe('<SegmentedTabs /> icons and labels', () => {
  it("shows each tab's own icon and its label at all times, regardless of which tab is selected", async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.UNSAFE_getAllByType(PlayersIcon)).toHaveLength(1);
    expect(screen.UNSAFE_getAllByType(HistoryIcon)).toHaveLength(1);
    expect(screen.getByText('Players')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('tints the selected tab’s icon and the unselected tab’s icon to the label’s own two colours', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.UNSAFE_getByType(PlayersIcon).props.color).toBe(
      lightTheme.colors.text.accent.high,
    );
    expect(screen.UNSAFE_getByType(HistoryIcon).props.color).toBe(
      lightTheme.colors.text.neutral.low,
    );
  });

  it('sizes every icon at 20, not the icon components’ own 24 default', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.UNSAFE_getByType(PlayersIcon).props.size).toBe(20);
    expect(screen.UNSAFE_getByType(HistoryIcon).props.size).toBe(20);
  });

  it('renders a tab with no icon exactly as before: label always visible, no icon rendered', async () => {
    const mixedItems: readonly SegmentedTabsItem[] = [
      { key: 'players', label: 'Players', icon: PlayersIcon },
      { key: 'history', label: 'History' },
    ];
    await render(
      <SegmentedTabs
        items={mixedItems}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(PlayersIcon)).toHaveLength(1);
  });
});

describe('<SegmentedTabs /> settle glow', () => {
  // `animatedPillStyle` derives the glow's own `offsetY`/`blurRadius`/alpha
  // through Reanimated's `interpolate`, which is a no-op under
  // `react-native-reanimated/mock` — this project's own precedent
  // (`../../../core/navigation/nav-bar.test.tsx`'s "scroll-linked blur"
  // describe block) is that asserting a resolved number past an
  // `interpolate` call would only read back a value the mock invented, not
  // one this component computed, so that half stays a manual, on-device
  // check. What a component test *can* observe under the mock is whether
  // `glowIntensity`'s own driver — `withSequence`, called directly (not
  // through a `'worklet'`-directive wrapper the way `pillTranslateX`'s own
  // `motionSpring` is) from the same effect that moves `pillTranslateX` —
  // runs at all, and how many times; spying on the raw export sees a direct
  // call like this one, the same as `../bottom-sheet/bottom-sheet.test.tsx`'s
  // own `withSpring` spies see `bottom-sheet.tsx`'s direct calls but not
  // `motionSpring`'s internal one (that file's own top comment explains why).
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flashes the settle glow — calls withSequence — when the selected tab changes to a different one', async () => {
    const withSequenceSpy = jest.spyOn(reanimatedMock, 'withSequence');
    const { rerender } = await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );
    // `cellWidth` stays `null` — and the effect that calls `withSequence`
    // returns before reaching it — until the track reports a real measured
    // width, the same gate this suite's own pill-width test above drives
    // with this same `layout` event.
    await fireEvent(screen.getByTestId('tabs'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 44 } },
    });
    withSequenceSpy.mockClear();

    await rerender(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="history"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(withSequenceSpy).toHaveBeenCalledTimes(1);
  });

  it('does not re-fire the settle glow when the already-selected tab is pressed again', async () => {
    const withSequenceSpy = jest.spyOn(reanimatedMock, 'withSequence');
    const onSelectionChange = jest.fn();
    await render(
      <SegmentedTabs
        items={ITEMS}
        selectedKey="players"
        onSelectionChange={onSelectionChange}
        testID="tabs"
      />,
    );
    await fireEvent(screen.getByTestId('tabs'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 240, height: 44 } },
    });
    withSequenceSpy.mockClear();

    await fireEvent.press(screen.getByTestId('tab-players'));

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(withSequenceSpy).not.toHaveBeenCalled();
  });
});

describe('<SegmentedTabs /> accessible name', () => {
  it("keeps a tab's label as its accessible name whether or not the tab carries an icon", async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.getByTestId('tab-players').props.accessibilityLabel).toBe('Players');
    expect(screen.getByTestId('tab-history').props.accessibilityLabel).toBe('History');
  });
});
