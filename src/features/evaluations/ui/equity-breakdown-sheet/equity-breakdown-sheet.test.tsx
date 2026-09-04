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

import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { lightTheme } from '@/core/theme/tokens';
import type { Holding } from '@/features/hand-ranges/model/holding';
import type { EspadaEquityPlayerResult } from '@/modules/espada-engine/index';
import { PortalHost } from '@/shared/ui/portal/portal';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import { chooseBarCount, combosAxisUpperBound, foldEquityBins } from '../../model/equity-breakdown';
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
// comment on this same mock. `../equity-breakdown-chart/
// equity-breakdown-chart.tsx`'s own folding and drawing behavior is that
// file's suite to cover, not this one's — this suite reads the mock back
// only to confirm this sheet forwards the acting player's own `result.
// distribution` (or `null`) into that component's own `distribution`
// prop, issue #138's own wiring concern.
jest.mock('victory-native', () => ({
  CartesianChart: jest.fn(() => null),
  Bar: jest.fn(() => null),
}));

// `EquityBreakdownChart` also imports `matchFont` from
// `@shopify/react-native-skia`, whose ESM this project's
// `transformIgnorePatterns` does not transform — importing it for real
// under Jest fails to parse before any test runs.
jest.mock('@shopify/react-native-skia', () => ({
  matchFont: jest.fn(() => ({ getSize: () => 0 })),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { CartesianChart: MockedCartesianChart } = require('victory-native');
/* eslint-enable @typescript-eslint/no-require-imports */

/** fires the chart's own canvas layout measurement — mirrors
 * `../equity-breakdown-chart/equity-breakdown-chart.test.tsx`'s own
 * `fireCanvasLayout`; `EquityBreakdownChart` renders nothing to
 * `CartesianChart` before its first measurement. */
function fireCanvasLayout(measuredWidth: number) {
  fireEvent(screen.getByTestId('canvas'), 'layout', {
    nativeEvent: { layout: { width: measuredWidth, height: 220, x: 0, y: 0 } },
  });
}

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) };
const PLAYER: Player = { id: 'player-2', number: 2, holding: HAND_RANGE_HOLDING };

// a real per-player distribution, real-shaped (20 entries, per issue
// #138's own `EQUITY_DISTRIBUTION_BIN_COUNT`), so a test can assert this
// sheet actually forwards it to `EquityBreakdownChart` rather than only
// that it forwards *something*.
const DISTRIBUTION: number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

const RESULT: EspadaEquityPlayerResult = {
  win: 0.6,
  tie: 0.02,
  equity: 0.61,
  distribution: DISTRIBUTION,
};

/** sets `player`'s own settled result directly on the store, the same way
 * a real settle would have — bypassing `startEquityJob` entirely, since
 * this sheet only ever reads the store, never drives it. Mirrors
 * `../player-row/player-row.test.tsx`'s own `setResultFor`. */
function setResultFor(player: Player, result: EspadaEquityPlayerResult): void {
  useEquityEvaluationStore.setState((state) => ({
    status: 'calculated',
    results: { ...state.results, [player.id]: result },
  }));
}

beforeEach(() => {
  // this header's own result now comes from `../../adapter/
  // use-equity-evaluation.ts` — reset it directly so a result set by one
  // test never leaks into the next. issue #103.
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
  MockedCartesianChart.mockClear();
});

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
  });

  // issue #103: the header's own result figure now comes from
  // `../../adapter/use-equity-evaluation.ts`, the same store
  // `../player-row/player-row.tsx`'s own row reads — this sheet is reached
  // only from that row's own `onDetailPress`, which itself only exists once
  // the row has a settled result (see this component's own doc comment), so
  // the practical case is always "with a result"; the no-result case
  // (`../player-row-content/player-row-content.tsx`'s own "renders no
  // `<Text>` element at all" behavior) is still covered here for the type's
  // sake.
  it('renders no result figure at all when this player has none yet', async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(within(header).queryByTestId('result', { includeHiddenElements: true })).toBeNull();
  });

  it("repeats the player's own settled result figure once one exists", async () => {
    setResultFor(PLAYER, RESULT);
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(
      within(header).getByTestId('result', { includeHiddenElements: true }).props.children,
    ).toBe('61%');
  });

  it('renders no chevron column at all in the header, unlike the list row it repeats', async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    // the list reserves this column even on a row that shows no chevron, so
    // both row kinds' result figures land on one vertical line; the header
    // has no second row to align with, so reserving it here would only hold
    // the result figure a column's width in from the row's own trailing
    // padding.
    expect(
      within(header).queryByTestId('chevron-column', { includeHiddenElements: true }),
    ).toBeNull();
  });

  it('renders the header as one accessible group, not a button', async () => {
    setResultFor(PLAYER, RESULT);
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(header.props.accessible).toBe(true);
    expect(header.props.accessibilityRole).toBeUndefined();
    expect(header.props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result 61%.',
    );
  });

  it("announces the player's own not-yet-available result when this player has none yet", async () => {
    await renderSheet();

    const header = screen.getByTestId('header-row', { includeHiddenElements: true });
    expect(header.props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result not yet available.',
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

  it('sets the legend labels in the chart legend type role rather than the caption they shipped at', async () => {
    await renderSheet();

    // the maintainer's own on-device pass over PR #116's preview build
    // found these reading too large at `caption`.
    // `@/core/theme/tokens.test.ts` pins what `chartLegendLabel` *is*;
    // this pins that the legend actually takes it, which is the half a
    // token test cannot see.
    const legend = screen.getByTestId('legend', { includeHiddenElements: true });
    const labelStyle = RNStyleSheet.flatten(within(legend).getByText('Trash').props.style);

    expect(labelStyle).toMatchObject(lightTheme.typography.chartLegendLabel);
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

  // issue #138's own functional requirements: the histogram reflects the
  // acting player's own real breakdown, not a shape shared with every
  // player — asserted here as "this sheet forwards exactly this player's
  // own `result.distribution`", the wiring this sheet itself owns;
  // `../equity-breakdown-chart/equity-breakdown-chart.test.tsx` covers
  // folding that distribution into bars.
  it("hands the chart this player's own real distribution once a result exists", async () => {
    setResultFor(PLAYER, RESULT);
    await renderSheet();

    const measuredWidth = 401;
    fireCanvasLayout(measuredWidth);

    const { domain } = MockedCartesianChart.mock.calls[0][0];
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(DISTRIBUTION, chooseBarCount(measuredWidth)),
    );
    expect(domain.y).toEqual([0, expectedMax]);
  });

  // issue #138's own functional requirements: if the acting player's
  // result is unavailable while the sheet stays open, the histogram draws
  // no bars rather than a stale or fabricated shape — this sheet's own
  // `result === null` case (`equity-breakdown-sheet.tsx`'s own doc
  // comment calls it practically unreachable, but the type still allows
  // it, so this sheet still decides it explicitly).
  it('hands the chart no distribution when this player has no result yet', async () => {
    await renderSheet();

    fireCanvasLayout(401);

    const { domain } = MockedCartesianChart.mock.calls[0][0];
    expect(domain.y).toEqual([0, 0]);
  });
});
