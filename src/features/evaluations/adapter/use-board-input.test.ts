import { act, renderHook } from '@testing-library/react-native';

import type { Card } from '@/shared/model/card';

import { EMPTY_BOARD_SLOTS, type Board } from '../model/board';
import { useBoardInput } from './use-board-input';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };

describe('useBoardInput()', () => {
  it('starts on five empty slots', () => {
    const { result } = renderHook(() => useBoardInput(true));

    expect(result.current[0]).toEqual(EMPTY_BOARD_SLOTS);
  });

  it('keeps whatever the setter last stored while the sheet stays open', () => {
    const { result, rerender } = renderHook(({ visible }) => useBoardInput(visible), {
      initialProps: { visible: true },
    });

    act(() => {
      result.current[1]([ACE_SPADES, null, null, null, null]);
    });
    rerender({ visible: true });

    expect(result.current[0]).toEqual([ACE_SPADES, null, null, null, null]);
  });

  it('clears the slots when the sheet reopens, so a second edit starts empty', () => {
    const { result, rerender } = renderHook(({ visible }) => useBoardInput(visible), {
      initialProps: { visible: true },
    });

    act(() => {
      result.current[1]([ACE_SPADES, null, null, null, null]);
    });
    rerender({ visible: false });
    rerender({ visible: true });

    expect(result.current[0]).toEqual(EMPTY_BOARD_SLOTS);
  });

  // that the clear lands during the reopening render rather than in a
  // later commit is not asserted here, and this is the wrong level to
  // assert it at: React re-runs the hook's own body with the stale value
  // before discarding that pass, so both values are visible from inside
  // the hook either way, and no assertion here separates a render-phase
  // adjustment from an effect. what the ordering actually protects is a
  // child mounting against stale slots — the board input sheet's own test
  // asserts that directly, by reopening after an edit and reading where
  // the picker's focus landed.

  it('starts left-packed from initialBoard when one is given', () => {
    const board: Board = [ACE_SPADES, KING_SPADES];

    const { result } = renderHook(() => useBoardInput(true, board));

    expect(result.current[0]).toEqual([ACE_SPADES, KING_SPADES, null, null, null]);
  });

  it('reseeds from initialBoard on reopen — the board’s current cards, not the previous edit’s leftovers', () => {
    const board: Board = [ACE_SPADES, KING_SPADES, ACE_HEARTS];
    const { result, rerender } = renderHook(({ visible }) => useBoardInput(visible, board), {
      initialProps: { visible: true },
    });

    act(() => {
      result.current[1]([ACE_SPADES, null, null, null, null]); // a leftover, unsubmitted edit
    });
    rerender({ visible: false });
    rerender({ visible: true });

    expect(result.current[0]).toEqual([ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null]);
  });
});
