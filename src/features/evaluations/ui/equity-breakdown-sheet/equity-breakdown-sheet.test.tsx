// registers this project's real themes and namespaces — see
// `../../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — `BottomSheet`, which
// this component composes, mounts a `GestureHandlerRootView` internally
// via its own `tap`/`pan` gestures (see `../../../../shared/ui/
// bottom-sheet/bottom-sheet.test.tsx`).
import 'react-native-gesture-handler/jestSetup';

import { StyleSheet as RNStyleSheet } from 'react-native';

import { render, screen, within } from '@testing-library/react-native';

import { lightTheme } from '@/core/theme/tokens';
import type { Holding } from '@/features/hand-ranges/model/holding';
import { PortalHost } from '@/shared/ui/portal/portal';

import type { Player } from '../../model/player';
import { EquityBreakdownSheet } from './equity-breakdown-sheet';

// see `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s comment
// on why both of these are lazy `require()`s inside the mock factory, not
// a same-file `import` — `BottomSheet`, which this component composes,
// imports `react-native-reanimated` directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// Skia and Victory Native are not exercisable under this project's Jest
// setup (docs/conventions/testing.md) — see
// `../equity-breakdown-chart/equity-breakdown-chart.test.tsx`'s own
// comment on this same mock; this suite never reads the mock back itself,
// since `../equity-breakdown-chart/equity-breakdown-chart.tsx`'s own
// behavior is that file's suite to cover.
jest.mock('victory-native', () => ({
  CartesianChart: jest.fn(() => null),
  Bar: jest.fn(() => null),
}));

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) };
const PLAYER: Player = { id: 'player-2', number: 2, holding: HAND_RANGE_HOLDING };

async function renderSheet({
  visible = true,
  player = PLAYER,
}: { visible?: boolean; player?: Player | null } = {}) {
  const onRequestClose = jest.fn();

  // `EquityBreakdownSheet` renders through `BottomSheet`'s own
  // `<PortalHost />` (`usePortal`), so every render here needs one as an
  // ancestor — `usePortal` throws without it. `render` is synchronous at
  // the RNTL version this project pins; the `await` matches every other
  // suite here (docs/conventions/testing.md).
  await render(
    <PortalHost>
      <EquityBreakdownSheet
        visible={visible}
        player={player}
        onRequestClose={onRequestClose}
        testID="sheet"
      />
    </PortalHost>,
  );

  return { onRequestClose };
}

describe('<EquityBreakdownSheet />', () => {
  it("repeats the player's own row content as the sheet's header, option B", async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(
      within(header).getByTestId('label', { includeHiddenElements: true }).props.children,
    ).toBe('Player 2');
    expect(
      within(header).getByTestId('subtitle', { includeHiddenElements: true }).props.children,
    ).toBe('10 combos');
    expect(
      within(header).getByTestId('result', { includeHiddenElements: true }).props.children,
    ).toBe('0%');
  });

  it("leaves the header's own chevron column empty, unlike the list row it repeats", async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(
      within(header).getByTestId('chevron-column', { includeHiddenElements: true }).children,
    ).toHaveLength(0);
  });

  it('renders the header as one accessible group, not a button', async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(header.props.accessible).toBe(true);
    expect(header.props.accessibilityRole).toBeUndefined();
    expect(header.props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result 0%.',
    );
  });

  it("opens nothing when the header's own preview or detail region is pressed", async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(
      within(header).getByTestId('preview', { includeHiddenElements: true }).props.onPress,
    ).toBeUndefined();
    expect(
      within(header).getByTestId('detail', { includeHiddenElements: true }).props.onPress,
    ).toBeUndefined();
  });

  it('names itself and its handle for the equity breakdown', async () => {
    await renderSheet();

    expect(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe("View this player's equity breakdown");
    expect(
      screen.getByTestId('handle', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe('Dismiss equity breakdown');
  });

  it('renders a heading and one legend entry per equity band', async () => {
    await renderSheet();

    expect(screen.getByTestId('heading', { includeHiddenElements: true }).props.children).toBe(
      'Equity Breakdown',
    );
    const legend = screen.getByTestId('legend', { includeHiddenElements: true });
    expect(within(legend).getByText('Trash')).toBeTruthy();
    expect(within(legend).getByText('Marginal')).toBeTruthy();
    expect(within(legend).getByText('Value')).toBeTruthy();
    expect(within(legend).getByText('Nuts')).toBeTruthy();
  });

  it('mounts the chart', async () => {
    await renderSheet();

    expect(screen.getByTestId('chart', { includeHiddenElements: true })).toBeTruthy();
  });

  it('leaves one spacing step of clearance below the chart', async () => {
    await renderSheet();

    // `BottomSheet`'s own panel pads for the device's bottom safe-area
    // inset and nothing more, so on a device reporting no inset the chart
    // would otherwise sit flush against the panel's edge. This clearance is
    // the caller's to supply (docs/conventions/component-styling.md), which
    // is why it is asserted on the chart's own merged style here rather
    // than inside `EquityBreakdownChart`.
    const chartStyle = RNStyleSheet.flatten(
      screen.getByTestId('chart', { includeHiddenElements: true }).props.style,
    );

    expect(chartStyle.marginBottom).toBe(lightTheme.space.x16);
  });

  it('forwards visible through to the underlying BottomSheet', async () => {
    const { onRequestClose } = await renderSheet({ visible: false });

    // `BottomSheet`'s own `isRendering` starts at its `visible` prop
    // (see that component's own doc comment) — mounted with `visible`
    // false, it renders nothing at all yet, not a hidden panel.
    expect(screen.queryByTestId('panel', { includeHiddenElements: true })).toBeNull();
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('renders no header or chart while player is null', async () => {
    await renderSheet({ player: null });

    expect(screen.queryByTestId('header-row', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('chart', { includeHiddenElements: true })).toBeNull();
  });
});
