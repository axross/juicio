import { act, renderHook } from '@testing-library/react-native';

import type { Holding } from '../model/holding';
import { useHoldingInput } from './use-holding-input';

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 's' }, second: { rank: 'K', suit: 's' } },
};

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA']) };

describe('useHoldingInput()', () => {
  it('defaults to the Cards tab, empty, when no initialHolding is given', () => {
    const { result } = renderHook(() => useHoldingInput(true, undefined));

    expect(result.current.activeTab).toBe('cards');
    expect(result.current.holeCards).toEqual([null, null]);
    expect(result.current.rankPairs).toEqual(new Set());
  });

  it('seeds the Cards tab and its two cards from a holeCards initialHolding', () => {
    const { result } = renderHook(() => useHoldingInput(true, HOLE_CARDS_HOLDING));

    expect(result.current.activeTab).toBe('cards');
    expect(result.current.holeCards).toEqual([
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 's' },
    ]);
  });

  it('seeds the Hand Range tab and its rank pairs from a handRange initialHolding', () => {
    const { result } = renderHook(() => useHoldingInput(true, HAND_RANGE_HOLDING));

    expect(result.current.activeTab).toBe('handRange');
    expect(result.current.rankPairs).toEqual(new Set(['AA']));
  });

  it('each setter updates its own field independently', () => {
    const { result } = renderHook(() => useHoldingInput(true, undefined));

    act(() => {
      result.current.setActiveTab('cards');
      result.current.setHoleCards([{ rank: '2', suit: 'h' }, null]);
      result.current.setRankPairs(new Set(['22']));
    });

    expect(result.current.activeTab).toBe('cards');
    expect(result.current.holeCards).toEqual([{ rank: '2', suit: 'h' }, null]);
    expect(result.current.rankPairs).toEqual(new Set(['22']));
  });

  it('re-seeds every field from initialHolding on a hidden-to-visible transition', () => {
    let visible = false;
    const { result, rerender } = renderHook(
      ({ visible: v }: { visible: boolean }) => useHoldingInput(v, HOLE_CARDS_HOLDING),
      { initialProps: { visible } },
    );

    act(() => {
      result.current.setActiveTab('handRange');
      result.current.setHoleCards([null, null]);
    });
    expect(result.current.holeCards).toEqual([null, null]);

    // flip visible false -> true: the sheet reopening for a second player
    // must not still show the leftover selection above.
    visible = true;
    rerender({ visible });

    expect(result.current.activeTab).toBe('cards');
    expect(result.current.holeCards).toEqual([
      { rank: 'A', suit: 's' },
      { rank: 'K', suit: 's' },
    ]);
  });

  it('does not re-seed on a render where visible stays true throughout', () => {
    const { result, rerender } = renderHook(() => useHoldingInput(true, HOLE_CARDS_HOLDING));

    act(() => {
      result.current.setHoleCards([null, null]);
    });
    rerender({});

    // still cleared — a render with `visible` already `true` must not
    // re-seed the hand-picked-and-cleared state back from initialHolding.
    expect(result.current.holeCards).toEqual([null, null]);
  });
});
