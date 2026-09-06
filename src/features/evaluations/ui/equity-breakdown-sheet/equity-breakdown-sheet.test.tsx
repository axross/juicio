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
import type { EspadaEquityPlayerResult } from '@/modules/espada-engine/index';
import { CARD_PAIR_COUNT } from '@/shared/model/card-pair';
import { BlurTargetProvider } from '@/shared/ui/blur-target/blur-target';
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

// mocked wholesale, the same reason and the same way `EquityBreakdownChart`
// above is (issue #293): its own composition, grouping, and pre-settlement
// behaviour is `../equity-breakdown-blocker-score/
// equity-breakdown-blocker-score.test.tsx`'s own to cover, not this
// sheet's — this suite reads the mock back only to confirm this sheet
// forwards the right `rankPairs`/`equities`/`blockerScores`/
// `opponentNumbers`, the right render order, and the right `testID`.
jest.mock('../equity-breakdown-blocker-score/equity-breakdown-blocker-score', () => ({
  EquityBreakdownBlockerScore: jest.fn(() => null),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  EquityBreakdownChart: MockedEquityBreakdownChart,
} = require('../equity-breakdown-chart/equity-breakdown-chart');
const {
  EquityBreakdownRankPairs: MockedEquityBreakdownRankPairs,
} = require('../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs');
const {
  EquityBreakdownBlockerScore: MockedEquityBreakdownBlockerScore,
} = require('../equity-breakdown-blocker-score/equity-breakdown-blocker-score');
/* eslint-enable @typescript-eslint/no-require-imports */

function lastChartProps() {
  return MockedEquityBreakdownChart.mock.calls[MockedEquityBreakdownChart.mock.calls.length - 1][0];
}

function lastRankPairsProps() {
  return MockedEquityBreakdownRankPairs.mock.calls[
    MockedEquityBreakdownRankPairs.mock.calls.length - 1
  ][0];
}

function lastBlockerScoreProps() {
  return MockedEquityBreakdownBlockerScore.mock.calls[
    MockedEquityBreakdownBlockerScore.mock.calls.length - 1
  ][0];
}

const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);

const RANK_PAIRS = new Set(['AA', 'AKs']);
const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: RANK_PAIRS };
const PLAYER: Player = { id: 'player-2', number: 2, holding: HAND_RANGE_HOLDING };
// two other seats, filled only to give `players` below a real length —
// this suite never asserts anything about either one's own identity, only
// `players.length` (the fair-share denominator this sheet already read
// from `playerCount` before issue #293) and, now, `PLAYER`'s own opponents
// (`opponentNumbers`, asserted through `lastBlockerScoreProps()` below).
const OTHER_PLAYERS: readonly Player[] = [
  { id: 'player-1', number: 1, holding: HAND_RANGE_HOLDING },
  { id: 'player-3', number: 3, holding: HAND_RANGE_HOLDING },
];

/** `PLAYER` plus as many of `OTHER_PLAYERS` as `count` calls for — this
 * suite's own stand-in for the `playerCount: number` prop this sheet used
 * to take directly (issue #293 replaced it with the fuller `players`
 * list; see that prop's own doc comment on `EquityBreakdownSheet`). */
function playersOfCount(count: number): readonly Player[] {
  return [PLAYER, ...OTHER_PLAYERS].slice(0, count);
}

// `distribution`, `pairs`, `equities`, `strengths`, and `blockerScores` are
// present only because `EspadaEquityPlayerResult` requires them — this
// file's own tests read `win`/`tie`/`equity` off this fixture, never any of
// the five's own content, so an empty array or buffer stands in for each;
// `BANDED_PAIRS` below is the fixture the "band counts and classification"
// describe uses instead.
const RESULT: EspadaEquityPlayerResult = {
  win: 0.6,
  tie: 0.02,
  equity: 0.61,
  distribution: [],
  pairs: [],
  equities: new ArrayBuffer(0),
  strengths: new ArrayBuffer(0),
  blockerScores: new ArrayBuffer(0),
};

// ten live card pairs, heads-up (fair = 0.5) postflop, chosen so each of
// the four bands holds a distinct, easy-to-recognise count: 2 `nuts`, 3
// `value`, 1 `marginal`, 4 `trash`. Classification reads a slot's own
// `equity`/`strength` alone, never a card-pair number's real identity
// (`../../model/strength-band.ts`'s own `classifyCardPairBand`), so
// `buffersFromLivePairs` below places each at an arbitrary but distinct
// slot rather than the pair it would really occupy.
const BANDED_PAIRS: readonly { equity: number; strength: number }[] = [
  { equity: 0.9, strength: 0.9 }, // nuts
  { equity: 0.95, strength: 0.95 }, // nuts
  { equity: 0.6, strength: 0.6 }, // value
  { equity: 0.55, strength: 0.55 }, // value
  { equity: 0.7, strength: 0.7 }, // value
  { equity: 0.6, strength: 0.2 }, // marginal
  { equity: 0.05, strength: 0 }, // trash
  { equity: 0.1, strength: 0.1 }, // trash
  { equity: 0.15, strength: 0.15 }, // trash
  { equity: 0.2, strength: 0.2 }, // trash
];

/** builds `equities`/`strengths` buffers with `pairs[i]`'s own values
 * written at slot `i`, every other of `CARD_PAIR_COUNT`
 * (`@/shared/model/card-pair`) slots left `NaN` — `liveCardPairsFromBuffers`
 * (`../../model/strength-band.ts`) reads live pairs back in ascending slot
 * order, so this reproduces `pairs`' own order exactly. */
function buffersFromLivePairs(pairs: readonly { equity: number; strength: number }[]): {
  equities: ArrayBuffer;
  strengths: ArrayBuffer;
} {
  const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  const strengths = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  pairs.forEach((pair, index) => {
    equities[index] = pair.equity;
    strengths[index] = pair.strength;
  });
  return { equities: equities.buffer, strengths: strengths.buffer };
}

const RESULT_WITH_BANDS: EspadaEquityPlayerResult = {
  win: 0.6,
  tie: 0.02,
  equity: 0.61,
  distribution: [],
  pairs: [],
  blockerScores: new ArrayBuffer(0),
  ...buffersFromLivePairs(BANDED_PAIRS),
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

/** sets `player`'s own result directly on the store with the evaluation
 * still `'calculating'` (issue #294) — `usePlayerEquityResult` already
 * returns non-`null` the moment the first progress tick reports a number
 * for a player (that hook's own doc comment), so this reproduces a live,
 * still-running calculation that nonetheless already has a per-player
 * result slot to read, the case `isCalculating` exists to gate around. */
function setCalculatingFor(player: Player, result: EspadaEquityPlayerResult): void {
  useEquityEvaluationStore.setState((state) => ({
    status: 'calculating',
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
    resultPlayerIds: [],
    impossibleSignal: 0,
  });
  MockedEquityBreakdownChart.mockClear();
  MockedEquityBreakdownRankPairs.mockClear();
  MockedEquityBreakdownBlockerScore.mockClear();
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
  players: readonly Player[] = playersOfCount(2),
  isPreflop = false,
) {
  return (
    <BlurTargetProvider>
      <PortalHost>
        <EquityBreakdownSheet
          visible={visible}
          player={player}
          players={players}
          isPreflop={isPreflop}
          onRequestClose={onRequestClose}
          testID="sheet"
        />
      </PortalHost>
    </BlurTargetProvider>
  );
}

async function renderSheet({
  visible = true,
  player = PLAYER,
  players = playersOfCount(2),
  isPreflop = false,
}: {
  visible?: boolean;
  player?: Player | null;
  players?: readonly Player[];
  isPreflop?: boolean;
} = {}) {
  const onRequestClose = jest.fn();

  // `EquityBreakdownSheet` renders through `BottomSheet`'s own
  // `<PortalHost />` (`usePortal`), so every render here needs one as an
  // ancestor — `usePortal` throws without it. `render` is synchronous at
  // the RNTL version this project pins; the `await` matches every other
  // suite here (docs/conventions/testing.md).
  const view = await render(sheetTree(visible, onRequestClose, player, players, isPreflop));

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

  // each legend label carries its own band's live card-pair count beside
  // it — `../../model/strength-band.ts`'s own
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
  // this player's own live card pairs — this sheet's own wiring of that
  // pairing is what these assert, not the chart's own per-bin folding
  // (`equity-breakdown-chart.test.tsx` already covers that). `Math.fround`
  // rounds each expected equity to the identical 32-bit float
  // `buffersFromLivePairs` stored it as — see `../../model/
  // strength-band.test.ts`'s own matching comment.
  it("hands the chart this player's own live equities and classified bands once a result exists", async () => {
    setResultFor(PLAYER, RESULT_WITH_BANDS);
    await renderSheet();

    expect(lastChartProps().equities).toEqual(BANDED_PAIRS.map((pair) => Math.fround(pair.equity)));
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

  // `bands` is memoized on `playerCount` alongside `livePairs`/`isPreflop`
  // (`../../model/strength-band.ts`'s Rule R1 reads `fairShare(playerCount)`)
  // — this pins that a `playerCount` change reaches that memo and gets
  // reclassified, not merely read once at mount. `equity: 0.35, strength:
  // 0.6` is chosen specifically to straddle the Value branch across the two
  // fair shares: at `fair = 1/2`, `0.35` does not clear `fair` so the Value
  // branch's own equity check fails, landing Marginal; at `fair = 1/3`,
  // `0.35 >= 1/3` clears it, and `strength: 0.6` already clears the 0.50
  // current-strength check, landing Value. The sheet stays open (`visible`
  // stays `true`) and the result is unchanged across the rerender — only
  // `playerCount` moves.
  it('reclassifies live pairs against the new fair share when playerCount changes while the sheet stays open', async () => {
    const STRADDLING_PAIR = { equity: 0.35, strength: 0.6 };
    setResultFor(PLAYER, {
      win: 0.6,
      tie: 0.02,
      equity: 0.61,
      distribution: [],
      pairs: [],
      blockerScores: new ArrayBuffer(0),
      ...buffersFromLivePairs([STRADDLING_PAIR]),
    });

    const { onRequestClose, rerender } = await renderSheet({ players: playersOfCount(2) });

    expect(lastChartProps().bands).toEqual(['marginal']);

    MockedEquityBreakdownChart.mockClear();
    await rerender(sheetTree(true, onRequestClose, PLAYER, playersOfCount(3), false));

    expect(lastChartProps().bands).toEqual(['value']);
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

  // the Blocker Score section renders after the Rank Pair list, below it
  // (issue #293) — the same `mock.invocationCallOrder` comparison the
  // histogram-vs-Rank-Pair-list test above already makes.
  it('renders the Blocker Score section after the Rank Pair list', async () => {
    await renderSheet();

    expect(MockedEquityBreakdownRankPairs).toHaveBeenCalled();
    expect(MockedEquityBreakdownBlockerScore).toHaveBeenCalled();
    expect(MockedEquityBreakdownRankPairs.mock.invocationCallOrder[0]).toBeLessThan(
      MockedEquityBreakdownBlockerScore.mock.invocationCallOrder[0],
    );
  });

  // this sheet's own wiring: `player.holding.rankPairs` and the settled
  // result's own two buffers reach the Blocker Score section unchanged —
  // grouping and formatting them is that component's own job
  // (`../equity-breakdown-blocker-score/
  // equity-breakdown-blocker-score.test.tsx`), not this sheet's.
  it("hands the Blocker Score section this player's own hand range and settled buffers", async () => {
    setResultFor(PLAYER, RESULT);
    await renderSheet();

    expect(lastBlockerScoreProps().rankPairs).toBe(RANK_PAIRS);
    expect(lastBlockerScoreProps().equities).toBe(RESULT.equities);
    expect(lastBlockerScoreProps().blockerScores).toBe(RESULT.blockerScores);
  });

  it('hands the Blocker Score section an empty stand-in buffer when this player has no result yet', async () => {
    await renderSheet();

    expect(lastBlockerScoreProps().equities.byteLength).toBe(0);
    expect(lastBlockerScoreProps().blockerScores.byteLength).toBe(0);
  });

  // `opponentNumbers` is every other seat's own `Player.number`, in seat
  // order — `PLAYER` (`number: 2`) sits between the two `OTHER_PLAYERS`
  // fixtures (`number: 1` and `number: 3`) above, so this also pins that
  // the scoring player itself is excluded, not merely reordered to the end.
  it("hands the Blocker Score section every other seat's own Player number, in seat order", async () => {
    await renderSheet({ players: playersOfCount(3) });

    expect(lastBlockerScoreProps().opponentNumbers).toEqual([1, 3]);
  });

  // reorder-then-read (issue #293 fix round 4): `blockerScores`' own
  // opponent-ordinal indexing is fixed at the seat order a result was
  // actually computed against — `equitySituationKey`
  // (`../../model/equity-request.ts`) deliberately treats a players-list
  // reorder alone as a no-op that never restarts the job that laid that
  // buffer out. Before this fix, `opponentNumbers` re-derived from the
  // live `players` prop on every render, so a reorder landing between a
  // result and this sheet's own next read silently relabelled one
  // opponent's own figures as the other's. `resultPlayerIds`
  // (`../../adapter/use-equity-evaluation.ts`) is what this fix reads
  // instead — set directly here to the seat order `setResultFor` above's
  // own result was "computed" against, independent of whatever `players`
  // this render happens to pass, exactly the way a real settle followed by
  // a real drag-to-reorder decouples the two.
  it('keeps each opponent labelled by the seat order its own result was actually computed against, even after the players list is reordered', async () => {
    const [otherLow, otherHigh] = OTHER_PLAYERS; // number 1, number 3
    setResultFor(PLAYER, RESULT);
    useEquityEvaluationStore.setState({
      resultPlayerIds: [otherLow.id, PLAYER.id, otherHigh.id],
    });
    const { onRequestClose, rerender } = await renderSheet({
      players: [otherLow, PLAYER, otherHigh],
    });

    expect(lastBlockerScoreProps().opponentNumbers).toEqual([1, 3]);

    // the live players list reorders — the two opponents swap seats —
    // with no change to the frozen `resultPlayerIds` snapshot above and no
    // fresh result, mirroring a drag-to-reorder that lands after a result
    // already exists.
    await rerender(sheetTree(true, onRequestClose, PLAYER, [otherHigh, PLAYER, otherLow], false));

    // still `[1, 3]` — the frozen seat order the result was computed
    // against — never `[3, 1]`, which is what re-deriving from the live,
    // now-reordered `players` prop would have silently produced instead.
    expect(lastBlockerScoreProps().opponentNumbers).toEqual([1, 3]);
  });

  it('renders no Blocker Score section while player is null', async () => {
    await renderSheet({ player: null });

    expect(MockedEquityBreakdownBlockerScore).not.toHaveBeenCalled();
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

  // issue #294: a progress tick's own `equities`/`strengths` buffers now
  // carry every slot at the `NaN` sentinel throughout a running
  // calculation, indistinguishable by content alone from the
  // practically-unreachable "no result" case above — `isCalculating`, read
  // off `useEquityEvaluationStatus()` rather than off `result`'s own
  // buffer content, is what this sheet gates the loading treatment on
  // instead. `setCalculatingFor` still sets a real per-player result on the
  // store (`usePlayerEquityResult` already returns non-`null` mid-run,
  // this file's own comment on it), so these tests exercise exactly the
  // case the buffer content alone cannot tell apart from a settled empty
  // result.
  describe('isCalculating gating', () => {
    it('hands the chart isCalculating true while the evaluation is still running', async () => {
      setCalculatingFor(PLAYER, RESULT_WITH_BANDS);
      await renderSheet();

      expect(lastChartProps().isCalculating).toBe(true);
    });

    it('hands the chart isCalculating false once the evaluation has settled', async () => {
      setResultFor(PLAYER, RESULT_WITH_BANDS);
      await renderSheet();

      expect(lastChartProps().isCalculating).toBe(false);
    });

    it('hands the chart no equities or bands while calculating, even though a live result already exists for this player', async () => {
      setCalculatingFor(PLAYER, RESULT_WITH_BANDS);
      await renderSheet();

      expect(lastChartProps().equities).toEqual([]);
      expect(lastChartProps().bands).toEqual([]);
    });

    it('shows an en dash for every band count while calculating, instead of the live count', async () => {
      setCalculatingFor(PLAYER, RESULT_WITH_BANDS);
      await renderSheet();

      expect(
        within(screen.getByTestId('legend-trash', { includeHiddenElements: true })).getByTestId(
          'count',
          { includeHiddenElements: true },
        ).props.children,
      ).toBe('–');
      expect(
        within(screen.getByTestId('legend-nuts', { includeHiddenElements: true })).getByTestId(
          'count',
          { includeHiddenElements: true },
        ).props.children,
      ).toBe('–');
    });
  });
});
