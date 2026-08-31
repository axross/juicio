import { act, renderHook } from '@testing-library/react-native';

import type { Card } from '@/shared/model/card';

import { setBoard, useBoard, useBoardStore } from './use-board';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };

beforeEach(() => {
  useBoardStore.setState({ board: [] });
});

describe('useBoard()', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useBoard());

    expect(result.current).toEqual([]);
  });

  it('reflects a board written through setBoard()', () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      setBoard([ACE_SPADES, KING_SPADES, ACE_HEARTS]);
    });

    expect(result.current).toEqual([ACE_SPADES, KING_SPADES, ACE_HEARTS]);
  });

  it('replaces the whole board rather than merging into the previous one', () => {
    const { result } = renderHook(() => useBoard());

    act(() => {
      setBoard([ACE_SPADES, KING_SPADES, ACE_HEARTS]);
      setBoard([]);
    });

    // a second, empty submission clears the board back to nothing — the
    // same "an empty board is a valid board" rule `resolveBoardOutcome`
    // (`../model/board.ts`) already applies at the sheet's own close time.
    expect(result.current).toEqual([]);
  });
});
