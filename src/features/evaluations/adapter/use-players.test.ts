import { act, renderHook } from '@testing-library/react-native';

import type { Holding } from '@/features/hand-ranges/model/holding';

import { MAX_PLAYERS } from '../model/player';
import {
  addPlayer,
  removePlayer,
  replacePlayerHolding,
  usePlayers,
  usePlayersStore,
} from './use-players';

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
};

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA']) };

beforeEach(() => {
  usePlayersStore.setState({ players: [] });
});

describe('usePlayers()', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => usePlayers());

    expect(result.current).toEqual([]);
  });

  it('reflects a player added through addPlayer()', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].holding).toBe(HOLE_CARDS_HOLDING);
  });

  it('appends further players rather than replacing the list', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
      addPlayer(HAND_RANGE_HOLDING);
    });

    expect(result.current).toHaveLength(2);
  });

  it('caps at MAX_PLAYERS', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      for (let i = 0; i < MAX_PLAYERS + 2; i += 1) {
        addPlayer(HAND_RANGE_HOLDING);
      }
    });

    expect(result.current).toHaveLength(MAX_PLAYERS);
  });

  it('reflects a player removed through removePlayer(), leaving the other one', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
      addPlayer(HAND_RANGE_HOLDING);
    });
    const [first, second] = result.current;

    act(() => {
      removePlayer(first.id);
    });

    expect(result.current).toEqual([second]);
  });

  it('returns to empty once the last player is removed', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const [only] = result.current;

    act(() => {
      removePlayer(only.id);
    });

    expect(result.current).toEqual([]);
  });

  it('reflects a player edited through replacePlayerHolding(), leaving its own id, number, and position unchanged', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
      addPlayer(HAND_RANGE_HOLDING);
    });
    const [first, second] = result.current;

    act(() => {
      replacePlayerHolding(first.id, HAND_RANGE_HOLDING);
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0].id).toBe(first.id);
    expect(result.current[0].number).toBe(first.number);
    expect(result.current[0].holding).toBe(HAND_RANGE_HOLDING);
    expect(result.current[1]).toBe(second); // untouched, same reference
  });
});
