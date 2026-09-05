import '@/core/theme/unistyles';
import '@/core/i18n';
import 'react-native-gesture-handler/jestSetup';

import { render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import type { Card } from '@/shared/model/card';

import type { HistoryEntry } from '../../model/history-entry';
import type { HistoryDateGroup } from '../../usecase/group-history-entries';
import { DateGroup } from './date-group';

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
const NINE_DIAMONDS: Card = { rank: '9', suit: 'd' };

function makeEntry(id: string, board: readonly Card[]): HistoryEntry {
  return {
    id,
    calculatedAt: 1000,
    board,
    players: [
      {
        holding: { kind: 'holeCards', holeCards: { first: ACE_SPADES, second: TEN_SPADES } },
        result: { win: 0.6, tie: 0.02, equity: 0.61 },
        name: `Player for ${id}`,
      },
    ],
  };
}

const NOW = new Date(2026, 8, 4, 15, 0, 0);

async function renderDateGroup(group: HistoryDateGroup, onDeleteEntry: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <DateGroup
        group={group}
        language="en"
        now={NOW}
        onDeleteEntry={onDeleteEntry}
        testID="date-group"
      />
    </GestureHandlerRootView>,
  );
}

describe('<DateGroup />', () => {
  it('reads "Today" for a group calculated on the local calendar day of `now`', async () => {
    await renderDateGroup({
      dateKey: 'today',
      calculatedAt: new Date(2026, 8, 4, 9, 0, 0).getTime(),
      boards: [],
    });

    expect(screen.getByTestId('heading').props.children).toBe('Today');
  });

  it('reads "Yesterday" for a group calculated on the local calendar day before `now`', async () => {
    await renderDateGroup({
      dateKey: 'yesterday',
      calculatedAt: new Date(2026, 8, 3, 9, 0, 0).getTime(),
      boards: [],
    });

    expect(screen.getByTestId('heading').props.children).toBe('Yesterday');
  });

  it('reads a short calendar date for a group calculated before yesterday', async () => {
    await renderDateGroup({
      dateKey: 'older',
      calculatedAt: new Date(2026, 8, 1, 9, 0, 0).getTime(),
      boards: [],
    });

    expect(screen.getByTestId('heading').props.children).toBe('Sep 1');
  });

  it('renders one board group per board, most-recently-calculated board first, each reachable by its own testID', async () => {
    const boardA: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS];
    const boardB: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS, NINE_DIAMONDS];

    await renderDateGroup({
      dateKey: 'today-key',
      calculatedAt: NOW.getTime(),
      boards: [
        { boardKey: 'board-b', board: boardB, entries: [makeEntry('b-entry', boardB)] },
        { boardKey: 'board-a', board: boardA, entries: [makeEntry('a-entry', boardA)] },
      ],
    });

    const boardBGroup = screen.getByTestId('board-group-today-key-board-b');
    const boardAGroup = screen.getByTestId('board-group-today-key-board-a');
    expect(within(boardBGroup).getByTestId('history-entry-row-b-entry')).toBeTruthy();
    expect(within(boardAGroup).getByTestId('history-entry-row-a-entry')).toBeTruthy();
  });

  it('gives a no-board group its own reachable testID rather than an empty one', async () => {
    await renderDateGroup({
      dateKey: 'today-key',
      calculatedAt: NOW.getTime(),
      boards: [{ boardKey: '', board: [], entries: [makeEntry('preflop', [])] }],
    });

    expect(screen.getByTestId('board-group-today-key-no-board')).toBeTruthy();
  });
});
