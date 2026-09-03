// registers this project's real themes against the mocked
// `StyleSheet.configure`.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — the `New Player`
// row's own label, and `PlayerRow`'s copy.
import '@/core/i18n';
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { Holding } from '@/features/hand-ranges/model/holding';
import type { EspadaEquityPlayerResult } from '@/modules/espada-engine/index';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import { MAX_PLAYERS, type Player } from '../../model/player';
import { PlayerList } from './player-list';

// `PlayerRow` reaches into `react-native-worklets`' native module on
// import — see `player-row.test.tsx`'s own matching comment for why both
// mocks below are needed, not only the worklets one.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
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
  onNewPlayerRequested: jest.Mock = jest.fn(),
) {
  await render(
    <GestureHandlerRootView>
      <PlayerList
        players={players}
        onDeletePlayer={onDeletePlayer}
        onEditPlayer={onEditPlayer}
        onBreakdownRequested={onBreakdownRequested}
        onNewPlayerRequested={onNewPlayerRequested}
        testID="list"
      />
    </GestureHandlerRootView>,
  );
  return { onDeletePlayer, onEditPlayer, onBreakdownRequested, onNewPlayerRequested };
}

describe('<PlayerList />', () => {
  it('renders one row per player, in order', async () => {
    await renderList(playersOf(3));

    expect(screen.getByTestId('player-row-player-1')).toBeTruthy();
    expect(screen.getByTestId('player-row-player-2')).toBeTruthy();
    expect(screen.getByTestId('player-row-player-3')).toBeTruthy();
  });

  it('renders the New Player row last, labelled New Player, when the list has room for another player', async () => {
    await renderList(playersOf(MAX_PLAYERS - 1));

    expect(within(screen.getByTestId('new-player-row')).getByText('New Player')).toBeTruthy();
  });

  it('opens the sheet and fires primaryAction when the New Player row is pressed', async () => {
    const { onNewPlayerRequested } = await renderList(playersOf(1));

    await fireEvent.press(screen.getByTestId('new-player-row'));

    expect(onNewPlayerRequested).toHaveBeenCalledTimes(1);
    // the same event the empty state's own `+ New Player` button fires
    // (docs/conventions/haptics.md) — both open the identical sheet.
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  it('renders no New Player row once the list is at MAX_PLAYERS', async () => {
    await renderList(playersOf(MAX_PLAYERS));

    expect(screen.queryByTestId('new-player-row')).toBeNull();
    expect(screen.getByTestId(`player-row-player-${MAX_PLAYERS}`)).toBeTruthy();
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
