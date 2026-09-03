import type { Holding } from '@/features/hand-ranges/model/holding';

import {
  addPlayer,
  MAX_PLAYERS,
  movePlayer,
  removePlayer,
  replacePlayerHolding,
  type Player,
} from './player';

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
};

const HAND_RANGE_HOLDING: Holding = {
  kind: 'handRange',
  rankPairs: new Set(['AA', 'AKs']),
};

describe('addPlayer()', () => {
  it('appends a new player to an empty list', () => {
    const next = addPlayer([], HOLE_CARDS_HOLDING);

    expect(next).toHaveLength(1);
    expect(next[0].holding).toBe(HOLE_CARDS_HOLDING);
    expect(typeof next[0].id).toBe('string');
    expect(next[0].id.length).toBeGreaterThan(0);
  });

  it('appends in submission order, leaving earlier players untouched', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);

    expect(afterSecond).toHaveLength(2);
    expect(afterSecond[0]).toBe(afterFirst[0]);
    expect(afterSecond[1].holding).toBe(HAND_RANGE_HOLDING);
  });

  it('gives every added player a distinct id, even for identical holdings', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HOLE_CARDS_HOLDING);

    expect(afterSecond[0].id).not.toBe(afterSecond[1].id);
    expect(afterSecond[0].holding).toEqual(afterSecond[1].holding);
  });

  it('is a no-op once the list is already at MAX_PLAYERS', () => {
    let players: readonly Player[] = [];
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      players = addPlayer(players, HAND_RANGE_HOLDING);
    }
    expect(players).toHaveLength(MAX_PLAYERS);

    const next = addPlayer(players, HOLE_CARDS_HOLDING);

    expect(next).toBe(players);
    expect(next).toHaveLength(MAX_PLAYERS);
  });

  it('numbers the first player added to an empty list 1', () => {
    const next = addPlayer([], HOLE_CARDS_HOLDING);

    expect(next[0].number).toBe(1);
  });

  it('numbers players sequentially as more are added', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);
    const afterThird = addPlayer(afterSecond, HOLE_CARDS_HOLDING);

    expect(afterThird.map((player) => player.number)).toEqual([1, 2, 3]);
  });

  it("does not renumber survivors when an earlier player is removed, and does not reuse the removed player's own number", () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);
    const afterRemoval = removePlayer(afterSecond, afterSecond[0].id); // removes number 1

    expect(afterRemoval.map((player) => player.number)).toEqual([2]); // the survivor keeps 2, not renumbered to 1

    const afterThird = addPlayer(afterRemoval, HOLE_CARDS_HOLDING);

    // max(existing) + 1 = 3, not the deleted 1 — a new player is never
    // given a number a still-listed player, or a just-deleted one, already
    // had.
    expect(afterThird.map((player) => player.number)).toEqual([2, 3]);
  });

  it('restarts numbering at 1 once every player has been removed and a fresh one is added', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);
    const emptied = removePlayer(removePlayer(afterSecond, afterSecond[0].id), afterSecond[1].id);
    expect(emptied).toHaveLength(0);

    const fresh = addPlayer(emptied, HOLE_CARDS_HOLDING);

    expect(fresh[0].number).toBe(1);
  });

  it('reuses the freed number at the cap without renumbering any survivor', () => {
    let atCap: readonly Player[] = [];
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      atCap = addPlayer(atCap, HAND_RANGE_HOLDING);
    }
    expect(atCap.map((player) => player.number)).toEqual(
      Array.from({ length: MAX_PLAYERS }, (_, index) => index + 1),
    );

    const highestNumbered = atCap[atCap.length - 1];
    const afterRemoval = removePlayer(atCap, highestNumbered.id);
    expect(afterRemoval).toHaveLength(MAX_PLAYERS - 1);

    // the list is back under MAX_PLAYERS, so this is a real append, not the
    // at-cap no-op the earlier test above covers.
    const afterAdd = addPlayer(afterRemoval, HOLE_CARDS_HOLDING);

    expect(afterAdd).toHaveLength(MAX_PLAYERS);
    // the freed number (the cap itself) is reused for the new player, not a
    // number one past the cap.
    expect(afterAdd[afterAdd.length - 1].number).toBe(highestNumbered.number);
    // every survivor keeps exactly the number it already had — none is
    // renumbered just because the list refilled to the cap.
    expect(afterAdd.slice(0, MAX_PLAYERS - 1)).toEqual(afterRemoval);
  });
});

describe('removePlayer()', () => {
  it('removes exactly the player with the given id', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);

    const next = removePlayer(afterSecond, afterSecond[0].id);

    expect(next).toEqual([afterSecond[1]]);
  });

  it('leaves the other player when two hold identical cards and one is removed', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HOLE_CARDS_HOLDING);

    const next = removePlayer(afterSecond, afterSecond[0].id);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(afterSecond[1].id);
  });

  it('is a no-op when the id is not present, returning the very same list', () => {
    const players = addPlayer([], HOLE_CARDS_HOLDING);

    const next = removePlayer(players, 'not-a-real-id');

    // `toBe`, not `toEqual`: the contract is the same reference back, which
    // an equal-but-fresh array would satisfy the weaker matcher with.
    expect(next).toBe(players);
  });

  it('returns an empty list once the last player is removed', () => {
    const players = addPlayer([], HOLE_CARDS_HOLDING);

    const next = removePlayer(players, players[0].id);

    expect(next).toEqual([]);
  });
});

describe('movePlayer()', () => {
  it('is a no-op on an empty list, for any indices', () => {
    const players: readonly Player[] = [];

    const next = movePlayer(players, 0, 0);

    expect(next).toBe(players);
  });

  it('is a no-op on a single-player list moved to its own index', () => {
    const players = addPlayer([], HOLE_CARDS_HOLDING);

    const next = movePlayer(players, 0, 0);

    expect(next).toBe(players);
  });

  it('is a no-op on a single-player list moved to an out-of-range index', () => {
    const players = addPlayer([], HOLE_CARDS_HOLDING);

    const next = movePlayer(players, 0, 1);

    expect(next).toBe(players);
  });

  it('is a no-op when fromIndex equals toIndex, on a two-player list', () => {
    const players = addPlayer(addPlayer([], HOLE_CARDS_HOLDING), HAND_RANGE_HOLDING);

    const next = movePlayer(players, 1, 1);

    expect(next).toBe(players);
  });

  it('swaps two players when moved past each other, on a two-player list', () => {
    const players = addPlayer(addPlayer([], HOLE_CARDS_HOLDING), HAND_RANGE_HOLDING);
    const [first, second] = players;

    const next = movePlayer(players, 0, 1);

    expect(next).toEqual([second, first]);
    // every player object is the same reference, only reordered.
    expect(next[0]).toBe(second);
    expect(next[1]).toBe(first);
  });

  it('moves the first player to the last position, on a three-player list', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    const [first, second, third] = players;

    const next = movePlayer(players, 0, 2);

    expect(next).toEqual([second, third, first]);
  });

  it('moves the last player back to the first position, undoing the move above, on a three-player list', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    const [first, second, third] = players;

    const movedToLast = movePlayer(players, 0, 2);
    const movedBack = movePlayer(movedToLast, 2, 0);

    expect(movedBack).toEqual([first, second, third]);
  });

  it('is a no-op for a negative fromIndex, on a three-player list', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);

    const next = movePlayer(players, -1, 1);

    expect(next).toBe(players);
  });

  it('is a no-op for a toIndex at or past the list length, on a three-player list', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);

    const next = movePlayer(players, 0, 3);

    expect(next).toBe(players);
  });

  it('does not renumber any player — number stays tied to identity through a reorder, exactly as it already does through a deletion', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);

    const next = movePlayer(players, 0, 2);

    expect(next.map((player) => player.number)).toEqual([2, 3, 1]);
  });

  it('leaves every untouched player the same reference when moving within a three-player list', () => {
    let players: readonly Player[] = [];
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    players = addPlayer(players, HAND_RANGE_HOLDING);
    players = addPlayer(players, HOLE_CARDS_HOLDING);
    const [, second, third] = players;

    const next = movePlayer(players, 0, 1);

    expect(next).toContain(second);
    expect(next).toContain(third);
  });
});

describe('replacePlayerHolding()', () => {
  it('replaces the holding of the player with the given id, leaving its own id, number, and position unchanged', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HAND_RANGE_HOLDING);
    const targetId = afterSecond[0].id;
    const targetNumber = afterSecond[0].number;

    const next = replacePlayerHolding(afterSecond, targetId, HAND_RANGE_HOLDING);

    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(targetId);
    expect(next[0].number).toBe(targetNumber);
    expect(next[0].holding).toBe(HAND_RANGE_HOLDING);
    expect(next[1]).toBe(afterSecond[1]); // the untouched player is the same reference
  });

  it('leaves every other player untouched, including one holding an identical Holding', () => {
    const afterFirst = addPlayer([], HOLE_CARDS_HOLDING);
    const afterSecond = addPlayer(afterFirst, HOLE_CARDS_HOLDING);

    const next = replacePlayerHolding(afterSecond, afterSecond[0].id, HAND_RANGE_HOLDING);

    expect(next[1]).toBe(afterSecond[1]);
    expect(next[1].holding).toBe(HOLE_CARDS_HOLDING);
  });

  it('is a no-op, returning the very same list, when the id is not present', () => {
    const players = addPlayer([], HOLE_CARDS_HOLDING);

    const next = replacePlayerHolding(players, 'not-a-real-id', HAND_RANGE_HOLDING);

    // `toBe`, not `toEqual`: the contract is the same reference back, the
    // same convention `removePlayer`'s own no-op case follows.
    expect(next).toBe(players);
  });
});
