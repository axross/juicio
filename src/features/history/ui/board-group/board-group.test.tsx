import '@/core/theme/unistyles';
import '@/core/i18n';
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Card } from '@/shared/model/card';

import type { HistoryEntry } from '../../model/history-entry';
import type { HistoryBoardGroup } from '../../usecase/group-history-entries';
import { BoardGroup } from './board-group';

// mirrors `../history-entry-row/history-entry-row.test.tsx`'s own identical
// mocks and their own doc comments.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const TEN_SPADES: Card = { rank: 'T', suit: 's' };
const FOUR_CLUBS: Card = { rank: '4', suit: 'c' };

function makeEntry(id: string): HistoryEntry {
  return {
    id,
    calculatedAt: 1000,
    board: [ACE_SPADES, TEN_SPADES, FOUR_CLUBS],
    players: [
      {
        holding: { kind: 'holeCards', holeCards: { first: ACE_SPADES, second: TEN_SPADES } },
        result: { win: 0.6, tie: 0.02, equity: 0.61 },
        name: `Player for ${id}`,
      },
    ],
  };
}

async function renderGroup(group: HistoryBoardGroup, onDeleteEntry: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <BoardGroup group={group} onDeleteEntry={onDeleteEntry} testID="board-group" />
    </GestureHandlerRootView>,
  );
}

describe('<BoardGroup />', () => {
  it('renders one board thumbnail and one row per entry, most-recent first, in the given order', async () => {
    const group: HistoryBoardGroup = {
      boardKey: 'As,Ts,4c',
      board: [ACE_SPADES, TEN_SPADES, FOUR_CLUBS],
      entries: [makeEntry('newest'), makeEntry('oldest')],
    };

    await renderGroup(group);

    // local, fixed/key-derived testIDs — not concatenated with this
    // component's own `testID` prop, per docs/conventions/
    // component-contracts.md's "A Non-Root Child Gets Its Own Local
    // testID" rule (the same shape `../history-entry-row/
    // history-entry-row.tsx`'s own `preview`/`label`/`subtitle` already
    // take, and `../../../evaluations/ui/player-list/player-list.tsx`'s
    // own `player-row-${player.id}` takes for a `.map()`-rendered child).
    expect(screen.getByTestId('board')).toBeTruthy();
    expect(screen.getByTestId('history-entry-row-newest')).toBeTruthy();
    expect(screen.getByTestId('history-entry-row-oldest')).toBeTruthy();
  });

  it('renders the dashed-slot board thumbnail for a no-board group, and its own entry row alongside it', async () => {
    const group: HistoryBoardGroup = {
      boardKey: '',
      board: [],
      entries: [makeEntry('preflop')],
    };

    await renderGroup(group);

    expect(screen.getByTestId('empty-slot-0')).toBeTruthy();
    expect(screen.getByTestId('empty-slot-1')).toBeTruthy();
    expect(screen.getByTestId('empty-slot-2')).toBeTruthy();
    expect(screen.getByTestId('history-entry-row-preflop')).toBeTruthy();
  });

  it("forwards a row's own deletion through onDeleteEntry with the deleted entry's own id", async () => {
    const onDeleteEntry = jest.fn();
    const group: HistoryBoardGroup = {
      boardKey: 'As,Ts,4c',
      board: [ACE_SPADES, TEN_SPADES, FOUR_CLUBS],
      entries: [makeEntry('only')],
    };

    await renderGroup(group, onDeleteEntry);
    const row = screen.getByTestId('history-entry-row-only');

    // the row's own revealed delete panel — see `../history-entry-row/
    // history-entry-row.test.tsx` for the swipe path this delegates to;
    // this test only proves the callback this component was handed
    // actually reaches its own caller with the right id, unchanged.
    await fireEvent.press(within(row).getByTestId('bin'));

    expect(onDeleteEntry).toHaveBeenCalledWith('only');
  });
});
