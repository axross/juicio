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

  it('does not notify a subscriber when setBoard() resubmits an unchanged board, but does when the board genuinely changes', () => {
    act(() => {
      setBoard([ACE_SPADES, KING_SPADES, ACE_HEARTS]);
    });
    const listener = jest.fn();
    const unsubscribe = useBoardStore.subscribe(listener);

    act(() => {
      // a fresh array literal holding the same cards in the same order —
      // the shape a reopened-and-closed-unchanged board input sheet
      // resubmits — not the same reference as the board already stored.
      setBoard([ACE_SPADES, KING_SPADES, ACE_HEARTS]);
    });

    expect(listener).not.toHaveBeenCalled();

    act(() => {
      setBoard([ACE_SPADES, KING_SPADES]);
    });

    // proves the guard isn't just always skipping the write.
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
