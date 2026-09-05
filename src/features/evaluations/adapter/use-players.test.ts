import { act, renderHook } from '@testing-library/react-native';

import { trackEvent } from '@/core/instrumentation/analytics';
import type { Holding } from '@/features/hand-ranges/model/holding';

import { MAX_PLAYERS } from '../model/player';
import {
  addPlayer,
  movePlayer,
  movePlayerById,
  removePlayer,
  replacePlayerHolding,
  usePlayers,
  usePlayersStore,
} from './use-players';

jest.mock('@/core/instrumentation/analytics', () => ({ trackEvent: jest.fn() }));

const mockedTrackEvent = jest.mocked(trackEvent);

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
};

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA']) };

beforeEach(() => {
  usePlayersStore.setState({ players: [] });
  mockedTrackEvent.mockClear();
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

  it('tracks Player Removed on a genuine removal', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const [only] = result.current;

    act(() => {
      removePlayer(only.id);
    });

    expect(mockedTrackEvent).toHaveBeenCalledWith('Player Removed', {});
  });

  it('tracks Player Added on a genuine addition', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });

    expect(result.current).toHaveLength(1);
    expect(mockedTrackEvent).toHaveBeenCalledWith('Player Added', { method: 'hole_cards' });
  });

  it('reports a hand-range addition as method: "range"', () => {
    act(() => {
      addPlayer(HAND_RANGE_HOLDING);
    });

    expect(mockedTrackEvent).toHaveBeenCalledWith('Player Added', { method: 'range' });
  });

  it('does not track Player Added once the list is already at MAX_PLAYERS', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      for (let i = 0; i < MAX_PLAYERS; i += 1) {
        addPlayer(HAND_RANGE_HOLDING);
      }
    });
    expect(result.current).toHaveLength(MAX_PLAYERS);
    mockedTrackEvent.mockClear();

    act(() => {
      addPlayer(HAND_RANGE_HOLDING); // the model's own no-op path, at the cap
    });

    expect(result.current).toHaveLength(MAX_PLAYERS);
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it('does not track Player Removed for an id no longer in the list', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const [only] = result.current;

    act(() => {
      removePlayer(only.id);
    });
    mockedTrackEvent.mockClear();

    act(() => {
      removePlayer(only.id); // already gone — the model's own no-op path
    });

    expect(mockedTrackEvent).not.toHaveBeenCalled();
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

  it('reflects a reorder through movePlayer(), leaving every player their own id/number/holding', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
      addPlayer(HAND_RANGE_HOLDING);
    });
    const [first, second] = result.current;

    act(() => {
      movePlayer(0, 1);
    });

    expect(result.current).toEqual([second, first]);
    expect(result.current[0]).toBe(second);
    expect(result.current[1]).toBe(first);
  });

  it('is a no-op, leaving the very same list, for an out-of-range movePlayer() call', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const before = result.current;

    act(() => {
      movePlayer(0, 5);
    });

    expect(result.current).toBe(before);
  });

  it("reflects a reorder through movePlayerById(), resolved by a player's own id", () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
      addPlayer(HAND_RANGE_HOLDING);
    });
    const [first, second] = result.current;

    act(() => {
      movePlayerById(first.id, 1);
    });

    expect(result.current).toEqual([second, first]);
  });

  it('resolves against the store’s own current index, not a caller’s stale one, when the id’s position has since moved', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING); // starts at index 0
      addPlayer(HAND_RANGE_HOLDING); // starts at index 1
    });
    const [first, second] = result.current;

    act(() => {
      // moves `second` to index 0, ahead of `first` — the exact
      // in-between-calls shift a caller closing over a once-read `index`
      // (rather than resolving by id, fresh, on every call) would miss.
      movePlayer(1, 0);
    });
    expect(result.current).toEqual([second, first]);

    act(() => {
      // still names `first` correctly even though `first`'s own index is
      // now 1, not the 0 it started at.
      movePlayerById(first.id, 0);
    });

    expect(result.current).toEqual([first, second]);
  });

  it('is a no-op, leaving the very same list, when movePlayerById() is called with an id no longer in the list', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const [only] = result.current;

    act(() => {
      removePlayer(only.id);
    });
    const afterRemoval = result.current;

    act(() => {
      movePlayerById(only.id, 0);
    });

    expect(result.current).toBe(afterRemoval);
  });

  it('does not notify a subscriber when replacePlayerHolding() resubmits an unchanged holding, but does when the holding genuinely changes', () => {
    const { result } = renderHook(() => usePlayers());

    act(() => {
      addPlayer(HOLE_CARDS_HOLDING);
    });
    const [only] = result.current;
    const listener = jest.fn();
    const unsubscribe = usePlayersStore.subscribe(listener);

    act(() => {
      // a fresh object, equal in content but not in reference — the shape
      // a reopened-and-closed-unchanged card/range input sheet resubmits.
      replacePlayerHolding(only.id, {
        kind: 'holeCards',
        holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
      });
    });

    expect(listener).not.toHaveBeenCalled();

    act(() => {
      replacePlayerHolding(only.id, HAND_RANGE_HOLDING);
    });

    // proves the guard isn't just always skipping the write.
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
