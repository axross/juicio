// registers this project's real themes and namespaces — see
// `../../../hand-ranges/ui/holding-input-sheet/holding-input-sheet.test.tsx`
// for why this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { EspadaEquityOutcome, EspadaEquityPlayerResult } from '@/modules/espada-engine/index';
import { computeFanLayout, FAN_ARC } from '@/shared/ui/card-fan-geometry';
import { PortalHost } from '@/shared/ui/portal/portal';

import { useBoardStore } from '../../adapter/use-board';
import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import { usePlayersStore } from '../../adapter/use-players';
import { AnalyzeScreen } from './analyze-screen';

const FAN_CONTENT_WIDTH = FAN_ARC.frameWidth + 2;
const LAYOUT = computeFanLayout(FAN_CONTENT_WIDTH);
// ascending rank order (2..A) — index 0 is the deuce, index 12 the ace.
const TWO_X = LAYOUT.cards[0].centerX;
const THREE_X = LAYOUT.cards[1].centerX;
const FOUR_X = LAYOUT.cards[2].centerX;

// this screen's own `HoldingInputSheet` composes `BottomSheet`, and its
// `PlayerList` composes `PlayerRow` — both reach into
// `react-native-worklets`' native module on import, and drive real
// `withSpring` calls this screen's own tests never wait multiple frames
// for — see `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// matching comment on why both mocks below are needed together.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// this screen's own `EquityBreakdownSheet` composes `EquityBreakdownChart`,
// which imports Victory Native directly — not exercisable under this
// project's Jest setup (docs/conventions/testing.md). See
// `../equity-breakdown-chart/equity-breakdown-chart.test.tsx`'s own
// matching comment; this file never reads the mock back itself, since that
// component's own behaviour is that file's suite to cover.
jest.mock('victory-native', () => ({
  CartesianChart: jest.fn(() => null),
  Bar: jest.fn(() => null),
}));

// `EquityBreakdownChart` also imports `useFont` from
// `@shopify/react-native-skia`, whose ESM this project's
// `transformIgnorePatterns` does not transform — importing it for real
// under Jest fails to parse before any test runs. The mocked return value
// stands in for the loaded-font case; this file never exercises the
// font-still-loading state itself, which is
// `../equity-breakdown-chart/equity-breakdown-chart.test.tsx`'s own suite
// to cover.
jest.mock('@shopify/react-native-skia', () => ({
  useFont: jest.fn(() => ({ getSize: () => 0 })),
}));

// `../../adapter/use-equity-evaluation.ts`'s own module-scope reaction calls
// this for real the moment 2–3 players are present — mocked outright per
// this project's own native-module test-mocking convention (`../../adapter/
// use-equity-evaluation.test.ts`'s own matching comment), since none of
// this file's tests reach 2 players except the "equity progress bar and
// impossible-situation toast" describe below.
const mockStartEquityJob = jest.fn();
jest.mock('@/modules/espada-engine/index', () => ({
  startEquityJob: (...args: unknown[]) => mockStartEquityJob(...args),
}));

// both stores are module-level singletons (`use-players.ts`, `use-board.ts`),
// so a player or a submitted board from one test would otherwise leak into
// the next — the same reset `settings-screen.test.tsx` does for its own
// theme-preference store. `useEquityEvaluationStore` is a third such
// singleton, derived from the two above (issue #103) — reset alongside
// them for the same reason.
afterEach(() => {
  usePlayersStore.setState({ players: [] });
  useBoardStore.setState({ board: [] });
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
  mockStartEquityJob.mockReset();
});

// a plain never-settling job by default — several of this file's own
// describes (unrelated to equity) incidentally cross the 2–3 player window
// on their way to asserting something else entirely (e.g. "opens a blank
// sheet for a fresh player" below, which ends with two players present),
// and `../../adapter/use-equity-evaluation.ts`'s own module-scope reaction
// calls `startEquityJob` for real the moment that happens — this keeps
// every such call safe without those describes needing to know or care.
// The "equity progress bar and impossible-situation toast" describe below
// overrides this with its own controllable implementation.
beforeEach(() => {
  mockStartEquityJob.mockImplementation(() => ({
    result: new Promise(() => {}),
    cancel: jest.fn(),
    release: jest.fn(),
  }));
});

async function renderScreen() {
  await render(
    // `SafeAreaProvider` is required now that the screen itself calls
    // `useSafeAreaInsets()` (`./analyze-screen.tsx`'s own `fabBottom`
    // comment) — that hook throws with no provider ancestor. Insets default
    // to all-zero (`SafeAreaProvider`'s own fallback with no
    // `initialMetrics`), which is exactly right for this suite: it asserts
    // on the FAB's presence and press behaviour, never on its exact
    // position, and a real device's non-zero bottom inset is a manual
    // check RNTL's layout-free renderer can't perform anyway (see
    // `../toast/toast.tsx`'s own comment on the same limit).
    <SafeAreaProvider>
      <GestureHandlerRootView>
        <PortalHost>
          <AnalyzeScreen />
        </PortalHost>
      </GestureHandlerRootView>
    </SafeAreaProvider>,
  );
}

/**
 * commits the sheet's own close (submit or dismiss, whichever
 * `resolveHoldingOutcome` decides) via a tap on the backdrop — a plain
 * `Pressable`, unlike the handle (a `GestureDetector`, which
 * `fireEvent.press` cannot drive at all). Mirrors `../../../hand-ranges/ui/
 * holding-input-sheet/holding-input-sheet.test.tsx`'s own `closeSheet`
 * exactly; `includeHiddenElements` is needed because the backdrop's own
 * opacity is driven by a Reanimated shared value RNTL cannot see through
 * to decide visibility from.
 */
async function closeSheet() {
  await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
}

/** measures whichever sheet's own fan is currently mounted, so a
 * subsequent `fireArcTap` can resolve a touch to a card — see
 * `cards-pane.test.tsx`'s own `renderPane`. only one sheet is ever
 * `visible` at a time (this screen's own doc comment), so `fan` is
 * unambiguous regardless of which one is open. */
async function measureFan() {
  await fireEvent(screen.getByTestId('fan'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: FAN_CONTENT_WIDTH, height: 400 } },
  });
}

/** taps a fan card in the given suit's arc, in whichever sheet is
 * currently open — see `cards-pane.test.tsx`'s own `fireArcTap` for why
 * this needs `act()`. */
async function fireArcTap(suit: string, x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`arc-${suit}`), [
      { state: State.BEGAN, x, y: 40 },
      { state: State.END, x, y: 40 },
    ]);
  });
}

describe('<AnalyzeScreen /> with no players', () => {
  it('renders the shipped empty state, with no player list', async () => {
    await renderScreen();

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});

describe('<AnalyzeScreen /> submitting a hand range from the empty state', () => {
  it('replaces the empty state with the player list, showing the submitted range', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();

    expect(screen.queryByTestId('analyze-empty-state')).toBeNull();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();
  });
});

describe('<AnalyzeScreen /> editing a player by tapping its row preview', () => {
  // deliberately never asserts against `player-row-<id>`'s own literal id
  // string, unlike this file's other describes: `../../model/player.ts`'s
  // own id counter is module-scope and persists across every test in this
  // file (`usePlayersStore`'s own `afterEach` reset below only clears the
  // *list*, not that counter), so the first player this describe's own
  // tests add is `player-1` only when run alone — `Player {{number}}`'s own
  // number, derived fresh from the (reset) list each time, is what stays
  // deterministic instead.

  it("reopens the sheet seeded with that player's own current holding, and replaces its holding in place on submit", async () => {
    await renderScreen();

    // add one player through the empty state, same sequence the
    // submission test above already exercises.
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();

    // the sheet is gone until the preview is tapped.
    expect(screen.queryByTestId('hand-range-pane')).toBeNull();

    await fireEvent.press(screen.getByTestId('preview'));

    // reopened already on the Hand Range tab, seeded from this player's
    // own current holding — `useHoldingInput`'s own re-seed-on-reopen
    // effect, fed by `initialHolding` now that this screen supplies it.
    expect(screen.getByTestId('hand-range-pane')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();

    // still exactly one player, still numbered 1 — an edit substitutes the
    // holding in place, it never appends a second player.
    expect(within(list).queryByText('Player 2')).toBeNull();
    expect(within(list).getByText('Player 1')).toBeTruthy();
  });

  it('leaves the player untouched when the edit is dismissed without confirming', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    // globally, not scoped through a row's own id — exactly one player
    // row exists at this point, so `subtitle`'s own fixed, non-prefixed
    // testID (this component's own convention for a non-root child, see
    // `../player-row/player-row.tsx`) is already unique.
    const beforeSubtitle = screen.getByTestId('subtitle').props.children;

    await fireEvent.press(screen.getByTestId('preview'));
    // switches to the sheet's other tab, which reseeded empty (this player
    // is a hand-range player) — closing from here is a genuine dismiss
    // (`resolveHoldingOutcome`'s own `incomplete-hole-cards` reason: the
    // Hand Range tab's own seeded selection is still non-empty, so this is
    // not the `nothing-selected` reason a truly blank sheet would dismiss
    // with), not a resubmission of the unchanged selection closing straight
    // from the Hand Range tab would be.
    await fireEvent.press(screen.getByTestId('tab-cards'));
    await closeSheet();

    expect(within(list).queryByText('Player 2')).toBeNull();
    const afterSubtitle = screen.getByTestId('subtitle').props.children;
    expect(afterSubtitle).toBe(beforeSubtitle);
  });

  it("opens a blank sheet for a fresh player, not the previously edited player's holding, once New Player is pressed afterward", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');

    await fireEvent.press(screen.getByTestId('preview'));
    await fireEvent.press(screen.getByTestId('tab-cards'));
    await closeSheet(); // a genuine dismiss — see the test above

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();

    // a second, brand new player — numbered 2, not a second edit of player 1.
    expect(within(list).getByText('Player 2')).toBeTruthy();
  });
});

describe('<AnalyzeScreen /> dismissing the sheet without submitting', () => {
  it('adds no player and keeps the empty state', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await closeSheet();

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});

describe('<AnalyzeScreen /> deleting the last player', () => {
  it('returns to the empty state', async () => {
    await renderScreen();

    // add a player through the add-player FAB — see this test's own
    // submission test above for the full sheet flow this one composes
    // with the deletion below.
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    expect(screen.getByTestId('analyze-player-list')).toBeTruthy();

    // deletes without the gesture, through the row's own accessibility
    // action — see `player-row/player-row.test.tsx` for the swipe itself.
    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});

describe('<AnalyzeScreen /> the board', () => {
  it('renders a submitted board’s own cards on the board row, then seeds them back into a reopened sheet', async () => {
    await renderScreen();

    // the board's own five slots are the only `slot-N` elements in the
    // tree until the sheet opens (`../board-input-sheet/board-input-sheet.tsx`
    // renders nothing while its own `visible` has never been `true`), so
    // pressing one here is unambiguous.
    await fireEvent.press(screen.getByTestId('slot-0'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await fireArcTap('d', FOUR_X);
    await closeSheet();

    // `setBoard` (`../../adapter/use-board.ts`) is what made the submitted
    // flop reach `Board`'s own `cards` prop.
    const boardRow = within(screen.getByTestId('analyze-board'));
    expect(boardRow.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1: deuce of spades',
    );
    expect(boardRow.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Board card 2: three of hearts',
    );
    expect(boardRow.getByTestId('slot-2').props.accessibilityLabel).toBe(
      'Board card 3: four of diamonds',
    );
    expect(boardRow.getByTestId('slot-3').props.accessibilityLabel).toBe(
      'Board card 4 is not selected',
    );

    // reopening the sheet (`BoardInputSheet`'s own `initialBoard`, sourced
    // from the same `useBoard()` read) shows the board's own current cards
    // in its preview slots, scoped away from the board row's own
    // identically-named `slot-N` testIDs — pressed through the board row's
    // own scope too, since the closed sheet's exit may not have fully
    // unmounted its own same-named slots yet. slot 3, the first empty one,
    // rather than slot 0: focus would otherwise land on slot 0 and give it
    // the focused label instead of the plain filled one asserted below.
    await fireEvent.press(boardRow.getByTestId('slot-3'));
    const sheetSlots = within(screen.getByTestId('analyze-board-input-sheet'));
    expect(sheetSlots.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1: deuce of spades',
    );
    expect(sheetSlots.getByTestId('slot-2').props.accessibilityLabel).toBe(
      'Board card 3: four of diamonds',
    );
  });
});

describe('<AnalyzeScreen /> unavailable cards', () => {
  it('renders a hole-cards player’s own two cards unavailable in the board sheet, and returns them to availability once that player is deleted', async () => {
    await renderScreen();

    // add a hole-cards player through the add-player FAB, the `Cards` tab
    // (the default), rather than the hand-range chip flow this file's
    // other describes use.
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();

    // the board's own sheet excludes that player's own two cards —
    // `unavailableCardsForBoard` (`../../model/unavailable-cards.ts`),
    // computed by this screen and forwarded to `BoardInputSheet`'s own
    // `unavailableCards`.
    await fireEvent.press(screen.getByTestId('slot-0'));
    await measureFan();
    expect(screen.getByLabelText('deuce of spades, unavailable').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await closeSheet();

    // deleting the player returns those two cards to the board sheet —
    // the same swipe-to-delete accessibility action
    // `player-row/player-row.test.tsx` exercises directly.
    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();

    // pressed through the board row's own scope, since the closed sheet's
    // exit may not have fully unmounted its own same-named slots yet.
    await fireEvent.press(within(screen.getByTestId('analyze-board')).getByTestId('slot-0'));
    await measureFan();
    expect(screen.queryByLabelText('deuce of spades, unavailable')).toBeNull();
    expect(screen.getByLabelText('deuce of spades').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });
});

describe('<AnalyzeScreen /> the toast', () => {
  // the exact two reasons that raise it (`BoardDismissReason.
  // IncompleteBoard`, `HoldingDismissReason.IncompleteHoleCards`), and the
  // two that raise nothing at all (`NothingSelected`, `EmptyHandRange`) —
  // docs/decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md.
  // `Toast`'s own replacement and self-clearing behaviour is that
  // component's own test (`../toast/toast.test.tsx`), not this screen's.

  it('raises the board message when the board sheet dismisses at one card, and raises nothing for a submitted empty board', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('slot-0'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await closeSheet();

    expect(screen.getByTestId('message')).toHaveTextContent(
      'The board was incomplete, so it was reverted.',
    );

    // a second board sheet close, this time submitting nothing at all —
    // still a valid submission (docs/specs/equity-analysis.md), not a
    // dismissal, so it doesn't touch the toast that's still showing from
    // the first close.
    await fireEvent.press(within(screen.getByTestId('analyze-board')).getByTestId('slot-0'));
    await closeSheet();

    // unchanged: this close raised nothing of its own, so whatever the
    // first close left standing is still exactly what's showing.
    expect(screen.getByTestId('message')).toHaveTextContent(
      'The board was incomplete, so it was reverted.',
    );
  });

  it('raises nothing at all for a board sheet dismissed with the board store starting empty and left empty', async () => {
    await renderScreen();

    // 0 cards picked at close is `resolveBoardOutcome`'s own submit case,
    // not a dismissal — see docs/specs/equity-analysis.md's The Board
    // Input Sheet.
    await fireEvent.press(screen.getByTestId('slot-0'));
    await closeSheet();

    expect(screen.queryByTestId('analyze-toast')).toBeNull();
  });

  it('raises the adding message when a fresh player’s holding sheet dismisses at one hole card', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await closeSheet();

    expect(screen.getByTestId('message')).toHaveTextContent(
      'The hole cards were incomplete, so no player was added.',
    );
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });

  it('raises the editing message, not the adding one, when an existing player’s holding sheet dismisses at one hole card', async () => {
    await renderScreen();

    // add a hand-range player first, so its own `Cards` tab starts empty
    // once reopened for editing.
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('preview'));
    await fireEvent.press(screen.getByTestId('tab-cards'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await closeSheet();

    expect(screen.getByTestId('message')).toHaveTextContent(
      'The hole cards were incomplete, so the player was reverted.',
    );
    // the edit was reverted, not applied — still exactly one player,
    // still the same hand-range holding it started with.
    expect(within(list).queryByText('Player 2')).toBeNull();
    expect(within(list).getByText('Player 1')).toBeTruthy();
  });

  it('raises nothing when the holding sheet dismisses NothingSelected', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await closeSheet();

    expect(screen.queryByTestId('analyze-toast')).toBeNull();
  });

  it('raises nothing when the holding sheet dismisses EmptyHandRange', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await measureFan();
    // one card, leaving the `Cards` tab non-empty — see
    // `../../../hand-ranges/ui/holding-input-sheet/holding-input-sheet.test.tsx`'s
    // own matching `EmptyHandRange` test for why this is what keeps rule 1
    // (`NothingSelected`) from firing instead.
    await fireArcTap('s', TWO_X);
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await closeSheet();

    expect(screen.queryByTestId('analyze-toast')).toBeNull();
  });
});

// this player's own settled result — issue #103's own `../player-row/
// player-row.tsx` gates `onDetailPress` on a result actually being present
// (never on holding kind alone any more), so every test below that presses
// `detail` and expects the sheet to open now seeds one first, the same
// `setResultFor` pattern `../player-row/player-row.test.tsx` already
// established.
// `distribution` is present only because `EspadaEquityPlayerResult`
// requires it — this file's own tests read `win`/`tie`/`equity` off this
// fixture, never the distribution's own content, so an empty array stands
// in for it.
const RESULT: EspadaEquityPlayerResult = { win: 0.6, tie: 0.02, equity: 0.61, distribution: [] };

function setResultForFirstPlayer(result: EspadaEquityPlayerResult): void {
  // read back rather than assumed as `'player-1'` — `../../model/
  // player.ts`'s own id counter is module-scope and persists across every
  // test in this file (see "editing a player by tapping its row preview"
  // describe's own comment above), so this describe's own first player is
  // `player-1` only when this file is run in isolation.
  const [player] = usePlayersStore.getState().players;
  if (player === undefined) {
    throw new Error('setResultForFirstPlayer: no player is present yet.');
  }
  useEquityEvaluationStore.setState((state) => ({
    status: 'calculated',
    results: { ...state.results, [player.id]: result },
  }));
}

describe('<AnalyzeScreen /> the equity breakdown sheet', () => {
  it("opens the sheet for the tapped row's own player, and closes without touching that player's holding", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();
    act(() => {
      setResultForFirstPlayer(RESULT);
    });

    expect(screen.queryByTestId('analyze-equity-breakdown-sheet')).toBeNull();

    await fireEvent.press(screen.getByTestId('detail'));

    const sheet = within(screen.getByTestId('analyze-equity-breakdown-sheet'));
    expect(
      sheet.getByTestId('header-row', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toContain('Player 1');

    // the backdrop is this sheet's own dismiss path too, the same one
    // `closeSheet` already drives for the holding and board sheets.
    await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));

    // still exactly one player, its holding untouched — this sheet reports
    // only its own dismissal (`../equity-breakdown-sheet/
    // equity-breakdown-sheet.tsx`'s own doc comment).
    expect(within(list).getByText('Player 1')).toBeTruthy();
    expect(within(list).getByText('60 combos')).toBeTruthy();
  });

  it("does not open when a hole-cards row's own detail region is pressed", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await closeSheet();
    expect(screen.getByTestId('analyze-player-list')).toBeTruthy();

    // `PlayerRowContent` still renders a `detail` region for a hole-cards
    // row (issue #102's own settled decision — the result figure renders
    // on every row), but as a plain, non-interactive `View`: only a
    // hand-range row's own `onDetailPress` opens this sheet.
    await fireEvent.press(screen.getByTestId('detail'));

    expect(screen.queryByTestId('analyze-equity-breakdown-sheet')).toBeNull();
  });
});

describe('<AnalyzeScreen /> the equity progress bar and impossible-situation toast', () => {
  /** adds two hand-range players through the add-player FAB, pressed twice
   * — the same two-player sequence "opens a blank sheet for a fresh
   * player" above already exercises, extracted here since every test in
   * this describe starts from it. */
  async function addTwoPlayers() {
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();
  }

  it('renders no progress bar with fewer than two players, then shows it once a second player makes the table 2-3 players wide', async () => {
    await renderScreen();

    expect(screen.queryByTestId('analyze-equity-progress-bar')).toBeNull();

    await addTwoPlayers();

    expect(screen.getByTestId('analyze-equity-progress-bar')).toBeTruthy();
  });

  it('hides the progress bar once the job settles', async () => {
    mockStartEquityJob.mockImplementation(() => ({
      result: Promise.resolve<EspadaEquityOutcome>({ status: 'success', results: [] }),
      cancel: jest.fn(),
      release: jest.fn(),
    }));
    await renderScreen();

    await addTwoPlayers();
    // the job's own settle (`result: Promise.resolve(...)` above) reaches
    // this screen's own store update a microtask after `addTwoPlayers`
    // itself resolves — an explicit `act()` flush is what lets React
    // actually commit that update to the rendered tree before the
    // assertion below reads it back.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('analyze-equity-progress-bar')).toBeNull();
  });

  // issue #186: the bar's own reserved slot is a permanent fixture of the
  // layout — unlike the bar itself (asserted mounting/unmounting above),
  // this wrapping slot must never mount or unmount, or the players section
  // below it would shift by the bar's own height exactly the way it did
  // before this fix.
  it('keeps the progress bar’s own reserved slot mounted regardless of calculation state', async () => {
    mockStartEquityJob.mockImplementation(() => ({
      result: Promise.resolve<EspadaEquityOutcome>({ status: 'success', results: [] }),
      cancel: jest.fn(),
      release: jest.fn(),
    }));
    await renderScreen();

    // present before any calculation has ever started...
    expect(screen.getByTestId('analyze-equity-progress-bar-slot')).toBeTruthy();

    await addTwoPlayers();

    // ...present while one is running, alongside the bar itself...
    expect(screen.getByTestId('analyze-equity-progress-bar-slot')).toBeTruthy();
    expect(screen.getByTestId('analyze-equity-progress-bar')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });

    // ...and present once it has settled, with the bar itself gone again.
    expect(screen.getByTestId('analyze-equity-progress-bar-slot')).toBeTruthy();
    expect(screen.queryByTestId('analyze-equity-progress-bar')).toBeNull();
  });

  it("raises the impossible-situation toast when the job settles no-valid-runout, but not merely from the store's own count already being nonzero at mount", async () => {
    // a nonzero count already on the store before this screen ever mounts
    // — e.g. left behind by a previous screen's own session — must not by
    // itself raise a toast the instant this screen mounts; only a genuine
    // *increment* while mounted does (this component's own doc comment).
    useEquityEvaluationStore.setState({ impossibleSignal: 3 });
    await renderScreen();

    expect(screen.queryByTestId('analyze-toast')).toBeNull();

    mockStartEquityJob.mockImplementation(() => ({
      result: Promise.resolve<EspadaEquityOutcome>({
        status: 'no-valid-runout',
        message: 'no valid runout',
      }),
      cancel: jest.fn(),
      release: jest.fn(),
    }));

    await addTwoPlayers();
    // see the matching comment on the "hides the progress bar" test above
    // for why this settle needs an explicit `act()` flush.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('message')).toHaveTextContent(
      "This combination is impossible, so equity couldn't be calculated.",
    );
  });
});

// the FAB's own render-and-press behaviour (renders correctly, fires
// `onPress` and the `primaryAction` haptic) is `../new-player-fab/
// new-player-fab.test.tsx`'s own coverage now — this describe covers only
// what moved to this screen once the FAB replaced both of Analyze's former
// entry points (issue #155): that it is this screen, not `PlayerList`, that
// hides it once the roster reaches the three-player cap.
describe('<AnalyzeScreen /> the add-player FAB', () => {
  it('is visible with zero, one, and two players, and hides once a third is added', async () => {
    await renderScreen();

    expect(screen.getByTestId('analyze-add-player-fab')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    expect(screen.getByTestId('analyze-add-player-fab')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();
    expect(screen.getByTestId('analyze-add-player-fab')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('analyze-add-player-fab'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();

    expect(within(screen.getByTestId('analyze-player-list')).getByText('Player 3')).toBeTruthy();
    expect(screen.queryByTestId('analyze-add-player-fab')).toBeNull();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `AnalyzeScreen`'s own root `View`, not merely type-level.
describe('<AnalyzeScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(
      // see `renderScreen`'s own comment above on why `SafeAreaProvider` is
      // required here too.
      <SafeAreaProvider>
        <GestureHandlerRootView>
          <PortalHost>
            <AnalyzeScreen style={{ marginTop: 10 }} />
          </PortalHost>
        </GestureHandlerRootView>
      </SafeAreaProvider>,
    );

    const root = screen.getByTestId('analyze-screen');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this screen's own `flex: 1`, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('flex', 1);
  });
});
