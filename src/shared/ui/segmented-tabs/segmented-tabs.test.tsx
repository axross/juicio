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
// the real `withSpring`/`withTiming` schedule an actual multi-frame
// animation on the UI thread and never resolve inside one synchronous
// test tick; the label reveal tests below read `useAnimatedStyle`'s own
// output directly (`width`/`opacity`), which the real implementation
// updates out of band from React's own render rather than returning
// synchronously — `react-native-reanimated/mock`'s versions collapse
// straight to the target value instead, the same reason
// `../bottom-sheet/bottom-sheet.test.tsx` mocks this too.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

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
    // 4 (this control's own track padding) plus the track's own new
    // border ring (`lightTheme.borderWidth.base`), on both sides of the
    // axis this control lays tabs out on — see `segmented-tabs.tsx`'s own
    // `cellWidth` comment for why the border is subtracted here too, not
    // only the padding.
    expect(pillStyle.width).toBeCloseTo(
      (240 - (4 + lightTheme.borderWidth.base) * 2) / ITEMS.length,
      9,
    );
  });
});

describe('<SegmentedTabs /> icons', () => {
  it("shows each tab's own icon at all times, regardless of which tab is selected", async () => {
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
      lightTheme.colors.text.accent.onSolid,
    );
    expect(screen.UNSAFE_getByType(HistoryIcon).props.color).toBe(
      lightTheme.colors.text.neutral.low,
    );
  });

  it('sizes every icon at 16, not the icon components’ own 24 default', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    expect(screen.UNSAFE_getByType(PlayersIcon).props.size).toBe(16);
    expect(screen.UNSAFE_getByType(HistoryIcon).props.size).toBe(16);
  });

  it('renders a tab with no icon exactly as before: label always visible, no icon, no reveal wrapper', async () => {
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
    expect(screen.queryByTestId('tab-history-label')).toBeNull();
    expect(screen.UNSAFE_queryAllByType(PlayersIcon)).toHaveLength(1);
  });
});

describe('<SegmentedTabs /> label reveal', () => {
  // `tab-<key>-label-measure` (`segmented-tabs.tsx`) reports the label's
  // own natural width through a real `onLayout` pass, the same as
  // `tabs`' own track does for the pill (the top describe block above) —
  // firing it here is what lets `labelWidth` resolve to something other
  // than its own `null` starting value.
  async function measureLabel(testID: string, width: number) {
    // `includeHiddenElements: true` — the measurer marks itself hidden
    // from assistive technology (`accessibilityElementsHidden`,
    // `importantForAccessibility="no-hide-descendants"` in
    // `segmented-tabs.tsx`), which RNTL's default queries treat the same
    // way they already treat a `display: 'none'` pane elsewhere in this
    // project (`../../../features/hand-ranges/ui/holding-input-sheet/
    // holding-input-sheet.test.tsx`'s own lazy-tab-mounting describe
    // block).
    await fireEvent(
      screen.getByTestId(`${testID}-label-measure`, { includeHiddenElements: true }),
      'layout',
      { nativeEvent: { layout: { x: 0, y: 0, width, height: 20 } } },
    );
  }

  it('reveals only the selected tab’s label, at its own measured width, and collapses the unselected one to zero', async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    await measureLabel('tab-players', 50);
    await measureLabel('tab-history', 70);

    const selectedStyle = RNStyleSheet.flatten(screen.getByTestId('tab-players-label').props.style);
    const unselectedStyle = RNStyleSheet.flatten(
      screen.getByTestId('tab-history-label').props.style,
    );

    // 6 is this control's own icon-label gap (`ICON_LABEL_GAP`,
    // `segmented-tabs.tsx`), folded into the reveal width itself rather
    // than a sibling margin — see that file's own doc comment.
    expect(selectedStyle.width).toBeCloseTo(50 + 6, 9);
    expect(selectedStyle.opacity).toBe(1);
    expect(unselectedStyle.width).toBe(0);
    expect(unselectedStyle.opacity).toBe(0);
  });

  it('swaps which label is revealed when the selected tab changes', async () => {
    const { rerender } = await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );
    await measureLabel('tab-players', 50);
    await measureLabel('tab-history', 70);

    await rerender(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="history"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    const playersStyle = RNStyleSheet.flatten(screen.getByTestId('tab-players-label').props.style);
    const historyStyle = RNStyleSheet.flatten(screen.getByTestId('tab-history-label').props.style);

    expect(playersStyle.width).toBe(0);
    expect(playersStyle.opacity).toBe(0);
    expect(historyStyle.width).toBeCloseTo(70 + 6, 9);
    expect(historyStyle.opacity).toBe(1);
  });

  it('leaves the reveal alone when the already-selected tab is pressed again', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={onSelectionChange}
        testID="tabs"
      />,
    );
    await measureLabel('tab-players', 50);

    const styleBefore = RNStyleSheet.flatten(screen.getByTestId('tab-players-label').props.style);

    await fireEvent.press(screen.getByTestId('tab-players'));

    const styleAfter = RNStyleSheet.flatten(screen.getByTestId('tab-players-label').props.style);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    // a meaningfully non-zero baseline — see the reveal test above for
    // where `56` (`50 + ICON_LABEL_GAP`) comes from — not merely two
    // stale zeros trivially equal to each other.
    expect(styleBefore.width).toBeCloseTo(56, 9);
    expect(styleAfter.width).toBeCloseTo(styleBefore.width as number, 9);
    expect(styleAfter.opacity).toBe(styleBefore.opacity);
  });
});

describe('<SegmentedTabs /> accessible name', () => {
  it("keeps a tab's label as its accessible name whether or not the label is currently visible on screen", async () => {
    await render(
      <SegmentedTabs
        items={ITEMS_WITH_ICONS}
        selectedKey="players"
        onSelectionChange={jest.fn()}
        testID="tabs"
      />,
    );

    // `history` is unselected — its label is visually collapsed — and
    // still reports its own accessible name explicitly, per
    // `segmented-tabs.tsx`'s own `Tab` doc comment.
    expect(screen.getByTestId('tab-players').props.accessibilityLabel).toBe('Players');
    expect(screen.getByTestId('tab-history').props.accessibilityLabel).toBe('History');
  });
});
