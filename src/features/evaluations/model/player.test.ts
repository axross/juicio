import type { Holding } from '@/features/hand-ranges/model/holding';

import { addPlayer, MAX_PLAYERS, removePlayer, type Player } from './player';

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
