import type { Card } from '@/shared/model/card';

import type { HistoryEntry } from '../model/history-entry';
import { groupHistoryEntries } from './group-history-entries';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const TEN_SPADES: Card = { rank: 'T', suit: 's' };
const FOUR_CLUBS: Card = { rank: '4', suit: 'c' };
const NINE_DIAMONDS: Card = { rank: '9', suit: 'd' };

const PLAYER: HistoryEntry['players'][number] = {
  holding: { kind: 'holeCards', holeCards: { first: ACE_SPADES, second: TEN_SPADES } },
  result: { win: 0.6, tie: 0, equity: 0.6 },
  name: 'Player 1',
};

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: 'id',
    calculatedAt: 0,
    board: [],
    players: [PLAYER],
    ...overrides,
  };
}

// two fixed days, far enough apart that a local-timezone edge case never
// lands them on the same calendar day: 2026-09-04 and 2026-09-02.
const DAY_ONE_MORNING = new Date(2026, 8, 4, 9, 0, 0).getTime();
const DAY_ONE_EVENING = new Date(2026, 8, 4, 21, 0, 0).getTime();
const DAY_TWO = new Date(2026, 8, 2, 9, 0, 0).getTime();

describe('groupHistoryEntries', () => {
  it('returns nothing for an empty list', () => {
    expect(groupHistoryEntries([])).toEqual([]);
  });

  it('groups entries calculated on the same local day into one date group, most-recent first', () => {
    const groups = groupHistoryEntries([
      entry({
        id: 'a',
        calculatedAt: DAY_ONE_EVENING,
        board: [ACE_SPADES, TEN_SPADES, FOUR_CLUBS],
      }),
      entry({ id: 'b', calculatedAt: DAY_TWO, board: [ACE_SPADES, TEN_SPADES, FOUR_CLUBS] }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].calculatedAt).toBe(DAY_ONE_EVENING);
    expect(groups[1].calculatedAt).toBe(DAY_TWO);
  });

  it('breaks a date group into board groups, most-recently-calculated board first', () => {
    const boardA: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS];
    const boardB: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS, NINE_DIAMONDS];

    const groups = groupHistoryEntries([
      entry({ id: 'most-recent', calculatedAt: DAY_ONE_EVENING, board: boardB }),
      entry({ id: 'older', calculatedAt: DAY_ONE_MORNING, board: boardA }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(2);
    expect(groups[0].boards[0].board).toEqual(boardB);
    expect(groups[0].boards[0].entries.map((e) => e.id)).toEqual(['most-recent']);
    expect(groups[0].boards[1].board).toEqual(boardA);
    expect(groups[0].boards[1].entries.map((e) => e.id)).toEqual(['older']);
  });

  it('groups a no-board (empty-array) entry the same way as any other board', () => {
    const groups = groupHistoryEntries([
      entry({ id: 'preflop-1', calculatedAt: DAY_ONE_EVENING, board: [] }),
      entry({ id: 'preflop-2', calculatedAt: DAY_ONE_MORNING, board: [] }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(1);
    expect(groups[0].boards[0].board).toEqual([]);
    expect(groups[0].boards[0].entries.map((e) => e.id)).toEqual(['preflop-1', 'preflop-2']);
  });

  it('keeps multiple entries sharing one board together, in their given (most-recent-first) order', () => {
    const board: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS];

    const groups = groupHistoryEntries([
      entry({ id: 'newest', calculatedAt: DAY_ONE_EVENING, board }),
      entry({ id: 'middle', calculatedAt: DAY_ONE_EVENING - 1, board }),
      entry({ id: 'oldest', calculatedAt: DAY_ONE_EVENING - 2, board }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(1);
    expect(groups[0].boards[0].entries.map((e) => e.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('re-attaches a date/board pair to its existing group even when a different date sits between two of its occurrences', () => {
    const board: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS];

    const groups = groupHistoryEntries([
      entry({ id: 'day-one-a', calculatedAt: DAY_ONE_EVENING, board }),
      entry({ id: 'day-two', calculatedAt: DAY_TWO, board }),
      entry({ id: 'day-one-b', calculatedAt: DAY_ONE_MORNING, board }),
    ]);

    expect(groups.map((g) => g.calculatedAt)).toEqual([DAY_ONE_EVENING, DAY_TWO]);
    expect(groups[0].boards[0].entries.map((e) => e.id)).toEqual(['day-one-a', 'day-one-b']);
  });
});
