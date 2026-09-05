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

import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { lightTheme } from '@/core/theme/tokens';
import type { Holding } from '@/features/hand-ranges/model/holding';
import type {
  EspadaEquityCardPairResult,
  EspadaEquityPlayerResult,
} from '@/modules/espada-engine/index';
import { PortalHost } from '@/shared/ui/portal/portal';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
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

// `usePrefersReducedMotion` resolves asynchronously and returns `false` on
// first render (`../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s
// own comment on the same hook) — mocking it directly is what lets a test
// below reach `BottomSheet`'s reduce-motion branch synchronously, the one
// path that fires its own `onOpened` without depending on
// `useAnimatedReaction`, a no-op under this project's reanimated mock (that
// file's own doc comment). Every other test in this suite mocks
// `EquityBreakdownChart` wholesale, so which motion setting is in effect
// changes nothing about what any of them assert.
jest.mock('@/core/motion/use-prefers-reduced-motion');

// `EquityBreakdownChart` is mocked wholesale here — not because it, or
// `./bar-chart.tsx` beneath it, lacks a reachable rendered observable under
// `jest-expo` (it does: `../equity-breakdown-chart/
// equity-breakdown-chart.test.tsx` renders both for real, over mocked Skia
// primitives, docs/conventions/testing.md's own carve-out for that). This
// suite mocks it for a different, ordinary reason: `EquityBreakdownChart`
// is `EquityBreakdownSheet`'s own direct child, its own folding, drawing,
// and animation behaviour is that other suite's to cover, and this one
// reads the mock back only to confirm this sheet forwards the right
// `distribution` (or `null`), the right `style`, and the right `testID` —
// the composition seam this sheet actually owns — the same "mock the seam
// the component under test owns, not a component two levels down" choice
// `../../../shared/ui/playing-card/playing-card.test.tsx` already makes for
// `RankIcon`/`SuitIcon`.
jest.mock('../equity-breakdown-chart/equity-breakdown-chart', () => ({
  EquityBreakdownChart: jest.fn(() => null),
}));

// wraps the real `EquityBreakdownRankPairs` in a `jest.fn`, keeping its
// actual implementation — a module-partial replacement, not a full mock
// like `EquityBreakdownChart` above, since this suite wants that
// component's own real rendered output (to confirm it sits inside a
// scrolling container) alongside a call-order record against the chart
// mock (to confirm it renders after the histogram). Mirrors
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// `motionColor` wrapping for the same "keep the real implementation,
// gain call tracking" reason.
jest.mock('../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs', () => {
  const actual = jest.requireActual('../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs');
  return {
    ...actual,
    EquityBreakdownRankPairs: jest.fn(actual.EquityBreakdownRankPairs),
  };
});

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  EquityBreakdownChart: MockedEquityBreakdownChart,
} = require('../equity-breakdown-chart/equity-breakdown-chart');
const {
  EquityBreakdownRankPairs: MockedEquityBreakdownRankPairs,
} = require('../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs');
/* eslint-enable @typescript-eslint/no-require-imports */

function lastChartProps() {
  return MockedEquityBreakdownChart.mock.calls[MockedEquityBreakdownChart.mock.calls.length - 1][0];
}

function lastRankPairsProps() {
  return MockedEquityBreakdownRankPairs.mock.calls[
    MockedEquityBreakdownRankPairs.mock.calls.length - 1
  ][0];
}

const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);

const RANK_PAIRS = new Set(['AA', 'AKs']);
const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: RANK_PAIRS };
const PLAYER: Player = { id: 'player-2', number: 2, holding: HAND_RANGE_HOLDING };

// a real per-player distribution, real-shaped (20 entries, per issue
// #138's own `EQUITY_DISTRIBUTION_BIN_COUNT`), so a test can assert this
// sheet actually forwards it to `EquityBreakdownChart` rather than only
// that it forwards *something*.
const DISTRIBUTION: number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

// `pairs` is present only because `EspadaEquityPlayerResult` requires it —
// most of this file's own tests exercise `distribution`'s own forwarding,
// never `pairs`, so an empty array stands in for it here; `BANDED_PAIRS`
// below is the fixture the "band counts and classification" describe uses
// instead.
const RESULT: EspadaEquityPlayerResult = {
  win: 0.6,
  tie: 0.02,
  equity: 0.61,
  distribution: DISTRIBUTION,
  pairs: [],
};

// ten live card pairs, heads-up (fair = 0.5) postflop, chosen so each of
// the four bands holds a distinct, easy-to-recognise count: 2 `nuts`, 3
// `value`, 1 `marginal`, 4 `trash` — `cardA`/`cardB` are arbitrary (`0`/`1`
// throughout): classification reads only `equity`/`strength`, never which
// two cards a pair names (`../../model/strength-band.ts`'s own
// `classifyCardPairBand`).
const BANDED_PAIRS: EspadaEquityCardPairResult[] = [
  { cardA: 0, cardB: 1, equity: 0.9, strength: 0.9 }, // nuts
  { cardA: 0, cardB: 1, equity: 0.95, strength: 0.95 }, // nuts
  { cardA: 0, cardB: 1, equity: 0.6, strength: 0.6 }, // value
  { cardA: 0, cardB: 1, equity: 0.55, strength: 0.55 }, // value
  { cardA: 0, cardB: 1, equity: 0.7, strength: 0.7 }, // value
  { cardA: 0, cardB: 1, equity: 0.6, strength: 0.2 }, // marginal
  { cardA: 0, cardB: 1, equity: 0.05, strength: 0 }, // trash
  { cardA: 0, cardB: 1, equity: 0.1, strength: 0.1 }, // trash
  { cardA: 0, cardB: 1, equity: 0.15, strength: 0.15 }, // trash
  { cardA: 0, cardB: 1, equity: 0.2, strength: 0.2 }, // trash
];
const RESULT_WITH_BANDS: EspadaEquityPlayerResult = {
  win: 0.6,
  tie: 0.02,
  equity: 0.61,
  distribution: DISTRIBUTION,
  pairs: BANDED_PAIRS,
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
  // this header's own result comes from `../../adapter/
  // use-equity-evaluation.ts` — reset it directly so a result set by one
  // test never leaks into the next.
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
  MockedEquityBreakdownChart.mockClear();
  MockedEquityBreakdownRankPairs.mockClear();
  // matches the real OS default this hook eventually resolves to on a
  // device with no accessibility setting turned on — see its own mock's
  // doc comment above for why this suite mocks it at all.
  mockedUsePrefersReducedMotion.mockReturnValue(false);
});

/** the JSX every render in this describe block mounts, factored out so the
 * `hasFinishedOpening` tests below can `rerender` it with a new `visible`
 * on the same `BottomSheet` instance — the same reason `bottom-sheet.
 * test.tsx`'s own `sheetTree` exists. */
function sheetTree(
  visible: boolean,
  onRequestClose: jest.Mock,
  player: Player | null = PLAYER,
  playerCount = 2,
  isPreflop = false,
) {
  return (
    <PortalHost>
      <EquityBreakdownSheet
        visible={visible}
        player={player}
        playerCount={playerCount}
        isPreflop={isPreflop}
        onRequestClose={onRequestClose}
        testID="sheet"
      />
    </PortalHost>
  );
}

async function renderSheet({
  visible = true,
  player = PLAYER,
  playerCount = 2,
  isPreflop = false,
}: {
  visible?: boolean;
  player?: Player | null;
  playerCount?: number;
  isPreflop?: boolean;
} = {}) {
  const onRequestClose = jest.fn();

  // `EquityBreakdownSheet` renders through `BottomSheet`'s own
  // `<PortalHost />` (`usePortal`), so every render here needs one as an
  // ancestor — `usePortal` throws without it. `render` is synchronous at
  // the RNTL version this project pins; the `await` matches every other
  // suite here (docs/conventions/testing.md).
  const view = await render(sheetTree(visible, onRequestClose, player, playerCount, isPreflop));

  return { onRequestClose, rerender: view.rerender };
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

  // the header's own result figure comes from
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
    ).toBe('61.00%');
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
      'Player 2: custom hand range, 10 combos. Result 61.00%.',
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

    // `@/core/theme/tokens.test.ts` pins what `chartLegendLabel` *is*;
    // this pins that the legend actually takes it, which is the half a
    // token test cannot see.
    const legend = screen.getByTestId('legend', { includeHiddenElements: true });
    const labelStyle = RNStyleSheet.flatten(within(legend).getByText('Trash').props.style);

    expect(labelStyle).toMatchObject(lightTheme.typography.chartLegendLabel);
  });

  // issue #237: each legend label carries its own band's live card-pair
  // count beside it — `../../model/strength-band.ts`'s own
  // `classifyCardPairBands`/`countStrengthBands`, fed `BANDED_PAIRS`' fixed
  // 2/3/1/4 split (this file's own fixture comment) — asserted through the
  // rendered `count` text, not the counting module's own already-tested
  // arithmetic.
  it('shows each band its own live card-pair count beside its label', async () => {
    setResultFor(PLAYER, RESULT_WITH_BANDS);
    await renderSheet();

    expect(
      within(screen.getByTestId('legend-trash', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('4 combos');
    expect(
      within(screen.getByTestId('legend-marginal', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('1 combos');
    expect(
      within(screen.getByTestId('legend-value', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('3 combos');
    expect(
      within(screen.getByTestId('legend-nuts', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('2 combos');
  });

  // no result yet means no live card pairs to classify — every band reads
  // zero rather than an empty or omitted count, the same "degrade, don't
  // omit" choice `resultLabel` above already makes.
  it('shows zero for every band count while this player has no result yet', async () => {
    await renderSheet();

    expect(
      within(screen.getByTestId('legend-trash', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('0 combos');
    expect(
      within(screen.getByTestId('legend-nuts', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('0 combos');
  });

  // the chart's own majority-band colouring (`../equity-breakdown-chart/
  // equity-breakdown-chart.tsx`) reads `equities`/`bands` in lockstep with
  // `result.pairs` — this sheet's own wiring of that pairing is what these
  // assert, not the chart's own per-bin folding
  // (`equity-breakdown-chart.test.tsx` already covers that).
  it("hands the chart this player's own live equities and classified bands once a result exists", async () => {
    setResultFor(PLAYER, RESULT_WITH_BANDS);
    await renderSheet();

    expect(lastChartProps().equities).toEqual(BANDED_PAIRS.map((pair) => pair.equity));
    expect(lastChartProps().bands).toEqual([
      'nuts',
      'nuts',
      'value',
      'value',
      'value',
      'marginal',
      'trash',
      'trash',
      'trash',
      'trash',
    ]);
  });

  it('hands the chart no equities or bands when this player has no result yet', async () => {
    await renderSheet();

    expect(lastChartProps().equities).toBeNull();
    expect(lastChartProps().bands).toBeNull();
  });

  // Rule R1's preflop variant classifies from equity alone
  // (`../../model/strength-band.ts`'s own `classifyPreflopBand`) — heads-up
  // (`fair = 0.5`), an equity of `0.6` clears `fair` but not
  // `fair + 0.6 * (1 - fair) = 0.8`, landing `value` preflop even though
  // `RESULT_WITH_BANDS`' own postflop fixture comment calls the same pair
  // (`equity: 0.6, strength: 0.2`) `marginal` — the two rules genuinely
  // disagree on this pair, which is exactly what this test is for.
  it('classifies preflop from equity alone once isPreflop is true, ignoring strength', async () => {
    setResultFor(PLAYER, RESULT_WITH_BANDS);
    await renderSheet({ isPreflop: true });

    expect(
      within(screen.getByTestId('legend-value', { includeHiddenElements: true })).getByTestId(
        'count',
        { includeHiddenElements: true },
      ).props.children,
    ).toBe('4 combos');
  });

  it('mounts the chart', async () => {
    await renderSheet();

    expect(MockedEquityBreakdownChart).toHaveBeenCalled();
    expect(lastChartProps().testID).toBe('chart');
  });

  it('leaves one spacing step of clearance below the chart', async () => {
    await renderSheet();

    // `BottomSheet`'s own panel pads for the device's bottom safe-area
    // inset and nothing more, so on a device reporting no inset the chart
    // would otherwise sit flush against the panel's edge. This clearance is
    // the caller's to supply (docs/conventions/component-styling.md), which
    // is why it is asserted on the style this sheet hands `EquityBreakdownChart`
    // here rather than inside that component.
    const chartStyle = RNStyleSheet.flatten(lastChartProps().style);

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
    // `EquityBreakdownChart` is mocked to render `null` unconditionally —
    // a query for its own testID would pass here for the wrong reason, so
    // this asserts the mock was never even called instead.
    expect(MockedEquityBreakdownChart).not.toHaveBeenCalled();
  });

  // the histogram reflects the
  // acting player's own real breakdown, not a shape shared with every
  // player — asserted here as "this sheet forwards exactly this player's
  // own `result.distribution`", the wiring this sheet itself owns;
  // `../equity-breakdown-chart/equity-breakdown-chart.test.tsx` covers
  // folding that distribution into bars.
  it("hands the chart this player's own real distribution once a result exists", async () => {
    setResultFor(PLAYER, RESULT);
    await renderSheet();

    expect(lastChartProps().distribution).toEqual(DISTRIBUTION);
  });

  // if the acting player's
  // result is unavailable while the sheet stays open, the histogram draws
  // no bars rather than a stale or fabricated shape — this sheet's own
  // `result === null` case (`equity-breakdown-sheet.tsx`'s own doc
  // comment calls it practically unreachable, but the type still allows
  // it, so this sheet still decides it explicitly).
  it('hands the chart no distribution when this player has no result yet', async () => {
    await renderSheet();

    expect(lastChartProps().distribution).toBeNull();
  });

  // this sheet's content — the heading, the legend, the histogram, and the
  // Rank Pair list — all sit inside `BottomSheet`'s own `<BottomSheetBody>`
  // slot, a scrolling `Animated.ScrollView`
  // (`../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`), rather than a
  // plain, unscrolled `View` the way this sheet's content did before that
  // compound-component refactor.
  it("renders its content inside BottomSheet's own scrolling body", async () => {
    await renderSheet();

    const body = screen.getByTestId('body', { includeHiddenElements: true });
    expect(within(body).getByTestId('heading', { includeHiddenElements: true })).toBeTruthy();
    expect(within(body).getByTestId('legend', { includeHiddenElements: true })).toBeTruthy();
  });

  // the Rank Pair list renders after the histogram, not before it or
  // interleaved with the legend — `MockedEquityBreakdownChart`'s own
  // `mock.invocationCallOrder` against `MockedEquityBreakdownRankPairs`'s
  // is what lets this suite compare the two components' own render order
  // directly, since `EquityBreakdownChart` itself is mocked to render
  // nothing observable in the tree (this file's own top comment).
  it('renders the Rank Pair list after the histogram', async () => {
    await renderSheet();

    expect(MockedEquityBreakdownChart).toHaveBeenCalled();
    expect(MockedEquityBreakdownRankPairs).toHaveBeenCalled();
    expect(MockedEquityBreakdownChart.mock.invocationCallOrder[0]).toBeLessThan(
      MockedEquityBreakdownRankPairs.mock.invocationCallOrder[0],
    );
  });

  // this sheet's own wiring: `player.holding.rankPairs` reaches
  // `EquityBreakdownRankPairs` unchanged — enumerating and grouping it is
  // that component's own job (`../equity-breakdown-rank-pairs/
  // equity-breakdown-rank-pairs.test.tsx`), not this sheet's.
  it("hands the Rank Pair list this player's own hand range", async () => {
    await renderSheet();

    expect(lastRankPairsProps().rankPairs).toBe(RANK_PAIRS);
  });

  it('renders no Rank Pair list while player is null', async () => {
    await renderSheet({ player: null });

    expect(MockedEquityBreakdownRankPairs).not.toHaveBeenCalled();
  });

  // this sheet tracks the underlying `BottomSheet`'s own "visually finished
  // opening" signal (`onOpened`) and hands it down to the chart as
  // `hasFinishedOpening`, resetting to `false` whenever the sheet closes so
  // a later reopen waits for its own opening transition again.
  // `BottomSheet` itself is real here, unlike `EquityBreakdownChart`
  // above — `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`
  // already covers `onOpened`'s own firing rules directly; these confirm
  // only that this sheet wires that signal into `hasFinishedOpening`
  // correctly, and resets it.
  describe('hasFinishedOpening tracking', () => {
    it('hands the chart hasFinishedOpening false before the sheet has visually finished opening', async () => {
      await renderSheet();

      expect(lastChartProps().hasFinishedOpening).toBe(false);
    });

    // reduce motion is the one path that fires `onOpened` synchronously,
    // with no dependency on `useAnimatedReaction` — a no-op under this
    // project's reanimated mock (`bottom-sheet.test.tsx`'s own doc
    // comment) — so it is the only one this suite can observe resolving to
    // `true` at all.
    it('hands the chart hasFinishedOpening true once the sheet reports its own entrance has landed', async () => {
      mockedUsePrefersReducedMotion.mockReturnValue(true);

      await renderSheet();

      expect(lastChartProps().hasFinishedOpening).toBe(true);
    });

    it('resets hasFinishedOpening back to false once the sheet closes, so a reopen waits for its own opening transition again', async () => {
      mockedUsePrefersReducedMotion.mockReturnValue(true);
      const onRequestClose = jest.fn();

      const { rerender } = await render(sheetTree(true, onRequestClose));
      expect(lastChartProps().hasFinishedOpening).toBe(true);

      // switched to non-reduced motion before closing: this suite can never
      // observe this hook's own non-reduced path resolving `onOpened` to
      // `true` on its own (the same `useAnimatedReaction` limitation noted
      // above), so a reopen below reading `false` can only be this reset —
      // never a fresh arrival this suite happened to also be unable to see.
      mockedUsePrefersReducedMotion.mockReturnValue(false);
      MockedEquityBreakdownChart.mockClear();

      await rerender(sheetTree(false, onRequestClose));
      await rerender(sheetTree(true, onRequestClose));

      expect(lastChartProps().hasFinishedOpening).toBe(false);
    });
  });
});
