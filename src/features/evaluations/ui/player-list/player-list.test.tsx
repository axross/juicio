// registers this project's real themes against the mocked
// `StyleSheet.configure`.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — `PlayerRow`'s copy.
import '@/core/i18n';
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Holding } from '@/features/hand-ranges/model/holding';
import type { EspadaEquityPlayerResult } from '@/modules/espada-engine/index';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import { PlayerRow } from '../player-row/player-row';
import { PlayerList } from './player-list';

// `PlayerRow` reaches into `react-native-worklets`' native module on
// import — see `player-row.test.tsx`'s own matching comment for why both
// mocks below are needed, not only the worklets one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// wraps `PlayerRow`'s own real implementation in a `jest.fn()` — call-through,
// never a stub — so this file's own "row re-render protection" tests below
// can count how many times `MemoizedPlayerRow` (`./player-list.tsx`) actually
// let the underlying function body run, which is the only way to observe a
// `React.memo` bail-out from outside: `jest.mock`'s own factory is hoisted
// above every import in this file (including this file's own `PlayerRow`
// import above), so `./player-list.tsx`'s own `memo(PlayerRow, ...)` call
// wraps this same spy, not the unwrapped original — spying on the export
// *after* that module has already evaluated (inside a `beforeEach`/`it`,
// say) would be too late, since `memo()` closes over whatever function
// reference it was called with at that point.
jest.mock('../player-row/player-row', () => {
  const actual: typeof import('../player-row/player-row') = jest.requireActual(
    '../player-row/player-row',
  );
  return { __esModule: true, ...actual, PlayerRow: jest.fn(actual.PlayerRow) };
});

// still auto-mocked, even with no local `triggerHaptic` reference left to
// assert against in this file — `PlayerRow`'s own bin/preview/detail
// presses still fire haptics, and this keeps the real native module out of
// this suite's way. this file's own former add-player-haptic assertion
// moved with the affordance itself to `../new-player-fab/
// new-player-fab.test.tsx` (issue #155).
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

beforeEach(() => {
  // this row's own detail press now depends on a settled result actually
  // being present (`../../adapter/use-equity-evaluation.ts` — see
  // `../player-row/player-row.test.tsx`'s own matching comment) — reset
  // directly so a result set by one test never leaks into the next.
  // issue #103.
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
});

const HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA']) };
const RESULT: EspadaEquityPlayerResult = { win: 0.6, tie: 0.02, equity: 0.61 };

/** sets `player`'s own settled result directly on the store, the same way
 * a real settle would have — mirrors `../player-row/player-row.test.tsx`'s
 * own `setResultFor`. */
function setResultFor(player: Player, result: EspadaEquityPlayerResult): void {
  useEquityEvaluationStore.setState((state) => ({
    status: 'calculated',
    results: { ...state.results, [player.id]: result },
  }));
}

function playersOf(count: number): readonly Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    number: index + 1,
    holding: HOLDING,
  }));
}

async function renderList(
  players: readonly Player[],
  onDeletePlayer: jest.Mock = jest.fn(),
  onEditPlayer: jest.Mock = jest.fn(),
  onBreakdownRequested: jest.Mock = jest.fn(),
) {
  const { rerender } = await render(
    <GestureHandlerRootView>
      <PlayerList
        players={players}
        onDeletePlayer={onDeletePlayer}
        onEditPlayer={onEditPlayer}
        onBreakdownRequested={onBreakdownRequested}
        testID="list"
      />
    </GestureHandlerRootView>,
  );
  // re-renders with a possibly-different `players` array, reusing the exact
  // same `onDeletePlayer`/`onEditPlayer`/`onBreakdownRequested` references
  // this call was made with — the same stable-callback shape
  // `../analyze-screen/analyze-screen.tsx` itself now hands this component
  // (issue #162's own plan), so a caller of this helper can rerender without
  // accidentally reintroducing the fresh-closure-per-render problem this
  // change fixes.
  async function rerenderWith(nextPlayers: readonly Player[]) {
    await rerender(
      <GestureHandlerRootView>
        <PlayerList
          players={nextPlayers}
          onDeletePlayer={onDeletePlayer}
          onEditPlayer={onEditPlayer}
          onBreakdownRequested={onBreakdownRequested}
          testID="list"
        />
      </GestureHandlerRootView>,
    );
  }
  return { onDeletePlayer, onEditPlayer, onBreakdownRequested, rerenderWith };
}

describe('<PlayerList />', () => {
  it('renders one row per player, in order', async () => {
    await renderList(playersOf(3));

    expect(screen.getByTestId('player-row-player-1')).toBeTruthy();
    expect(screen.getByTestId('player-row-player-2')).toBeTruthy();
    expect(screen.getByTestId('player-row-player-3')).toBeTruthy();
  });

  it("calls onDeletePlayer with the deleted row's own id via that row's bin tap", async () => {
    const { onDeletePlayer } = await renderList(playersOf(2));

    const firstRow = screen.getByTestId('player-row-player-1');
    await fireEvent.press(within(firstRow).getByTestId('bin'));

    expect(onDeletePlayer).toHaveBeenCalledWith('player-1');
    expect(onDeletePlayer).not.toHaveBeenCalledWith('player-2');
  });

  it("calls onEditPlayer with the tapped row's own id via that row's preview tap", async () => {
    const { onEditPlayer, onBreakdownRequested } = await renderList(playersOf(2));

    const secondRow = screen.getByTestId('player-row-player-2');
    await fireEvent.press(within(secondRow).getByTestId('preview'));

    expect(onEditPlayer).toHaveBeenCalledWith('player-2');
    expect(onEditPlayer).not.toHaveBeenCalledWith('player-1');
    expect(onBreakdownRequested).not.toHaveBeenCalled();
  });

  it("calls onBreakdownRequested with the tapped row's own id via that row's detail tap", async () => {
    const players = playersOf(2);
    const [firstPlayer] = players;
    // `../player-row/player-row.tsx`'s own `onDetailPress` fires only once
    // a result is actually present for that row (issue #103) — seeded here
    // for `player-1` so this row's detail region is a live `Pressable`
    // rather than the plain, non-interactive `View` it renders with none.
    setResultFor(firstPlayer, RESULT);
    const { onBreakdownRequested, onEditPlayer } = await renderList(players);

    const firstRow = screen.getByTestId('player-row-player-1');
    await fireEvent.press(within(firstRow).getByTestId('detail'));

    expect(onBreakdownRequested).toHaveBeenCalledWith('player-1');
    expect(onBreakdownRequested).not.toHaveBeenCalledWith('player-2');
    expect(onEditPlayer).not.toHaveBeenCalled();
  });
});

const mockedPlayerRow = jest.mocked(PlayerRow);

// issue #162: `MemoizedPlayerRow` (`./player-list.tsx`) is what these tests
// exercise — `PlayerRow`'s own function body only actually runs when React
// decides this list's own `React.memo` wrap did not bail out, so counting
// calls to the spy this file's own `jest.mock` above installed is what lets
// these tests observe that bail-out from outside, the same way this
// project's own `docs/conventions/testing.md` "What a Unit Test Asserts
// About a Third-Party Library" section already licenses asserting the
// configuration this project's own code hands a library — this spy wraps
// this project's own `PlayerRow`, not a third-party one, but the same
// "count calls to a call-through spy rather than re-deriving the library's
// own internals" shape applies.
describe('<PlayerList /> row re-render protection (issue #162)', () => {
  it('does not re-render either existing row when an unrelated third player is added', async () => {
    const players = playersOf(2);
    const { rerenderWith } = await renderList(players);
    mockedPlayerRow.mockClear();

    await rerenderWith([...players, { id: 'player-3', number: 3, holding: HOLDING }]);

    // exactly one call — the new, third row's own first render. neither
    // existing row's own function body ran again, even though both rows'
    // own `rowCount` prop changed (2 → 3) alongside the addition —
    // `./player-list.tsx`'s own `arePlayerRowPropsEqual` deliberately does
    // not compare it (see that function's own doc comment for why).
    expect(mockedPlayerRow).toHaveBeenCalledTimes(1);
  });

  it('still re-renders a row whose own player data changed, and only that row', async () => {
    const players = playersOf(2);
    const { rerenderWith } = await renderList(players);
    mockedPlayerRow.mockClear();

    const editedFirstPlayer: Player = {
      ...players[0]!,
      holding: {
        kind: 'holeCards',
        holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'K', suit: 'h' } },
      },
    };
    await rerenderWith([editedFirstPlayer, players[1]!]);

    // exactly one call — the edited row's own re-render, from
    // `arePlayerRowPropsEqual`'s `player` comparison correctly noticing the
    // new object `../../adapter/use-players.ts`'s own `replacePlayerHolding`
    // would have produced. the untouched second row's own `player` and
    // `index` are both unchanged (same reference, same position), so it is
    // not among the calls counted here.
    expect(mockedPlayerRow).toHaveBeenCalledTimes(1);
  });
});
