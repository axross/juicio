import type { Card } from '@/shared/model/card';

import type { Board } from './board';
import type { Player } from './player';
import { unavailableCardsForBoard, unavailableCardsForPlayer } from './unavailable-cards';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const SIX_SPADES: Card = { rank: '6', suit: 's' };
const FIVE_HEARTS: Card = { rank: '5', suit: 'h' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };
const QUEEN_DIAMONDS: Card = { rank: 'Q', suit: 'd' };

const FULL_BOARD: Board = [ACE_SPADES, KING_SPADES, QUEEN_DIAMONDS, TWO_CLUBS, FIVE_HEARTS];

function holeCardsPlayer(id: string, first: Card, second: Card): Player {
  return { id, number: 1, holding: { kind: 'holeCards', holeCards: { first, second } } };
}

function handRangePlayer(id: string): Player {
  return { id, number: 1, holding: { kind: 'handRange', rankPairs: new Set(['AA']) } };
}

describe('unavailableCardsForBoard()', () => {
  it('is empty when there are no players', () => {
    expect(unavailableCardsForBoard([])).toEqual([]);
  });

  it('collects an exact-holding player’s two cards', () => {
    const player = holeCardsPlayer('player-1', SIX_SPADES, FIVE_HEARTS);

    expect(unavailableCardsForBoard([player])).toEqual([SIX_SPADES, FIVE_HEARTS]);
  });

  it('collects every exact-holding player’s cards across the whole list', () => {
    const players = [
      holeCardsPlayer('player-1', SIX_SPADES, FIVE_HEARTS),
      holeCardsPlayer('player-2', ACE_SPADES, TWO_CLUBS),
    ];

    expect(unavailableCardsForBoard(players)).toEqual([
      SIX_SPADES,
      FIVE_HEARTS,
      ACE_SPADES,
      TWO_CLUBS,
    ]);
  });

  it('puts no card out of reach for a hand-range player', () => {
    const players = [
      handRangePlayer('player-1'),
      holeCardsPlayer('player-2', SIX_SPADES, FIVE_HEARTS),
    ];

    expect(unavailableCardsForBoard(players)).toEqual([SIX_SPADES, FIVE_HEARTS]);
  });

  it('returns a deleted player’s cards to availability once they are gone from the list', () => {
    // simulates deletion directly: the caller (`../ui/analyze-screen/
    // analyze-screen.tsx`) always passes the live players list, so a
    // removed player is simply absent from it by the time this runs again.
    const remaining = [holeCardsPlayer('player-2', ACE_SPADES, TWO_CLUBS)];

    expect(unavailableCardsForBoard(remaining)).toEqual([ACE_SPADES, TWO_CLUBS]);
    expect(unavailableCardsForBoard(remaining)).not.toEqual(
      expect.arrayContaining([SIX_SPADES, FIVE_HEARTS]),
    );
  });
});

describe('unavailableCardsForPlayer()', () => {
  it('is empty against an empty board with no other players', () => {
    expect(unavailableCardsForPlayer([], [], null)).toEqual([]);
  });

  it('includes every card on a full board', () => {
    expect(unavailableCardsForPlayer(FULL_BOARD, [], null)).toEqual(FULL_BOARD);
  });

  it('adds every exact-holding player’s cards to the board’s own, when adding a fresh player', () => {
    const players = [holeCardsPlayer('player-1', SIX_SPADES, FIVE_HEARTS)];

    expect(unavailableCardsForPlayer([ACE_SPADES], players, null)).toEqual([
      ACE_SPADES,
      SIX_SPADES,
      FIVE_HEARTS,
    ]);
  });

  it('puts no card out of reach for a hand-range player', () => {
    const players = [handRangePlayer('player-1')];

    expect(unavailableCardsForPlayer([], players, null)).toEqual([]);
  });

  it('excludes the edited player’s own two cards, but not another player’s', () => {
    const editing = holeCardsPlayer('player-1', SIX_SPADES, FIVE_HEARTS);
    const other = holeCardsPlayer('player-2', ACE_SPADES, TWO_CLUBS);

    const result = unavailableCardsForPlayer([], [editing, other], 'player-1');

    // the edited player's own cards stay pickable and clearable in their
    // own reopened sheet — otherwise clearing a slot could never release
    // the card, making the edit impossible to complete.
    expect(result).toEqual([ACE_SPADES, TWO_CLUBS]);
    expect(result).not.toEqual(expect.arrayContaining([SIX_SPADES, FIVE_HEARTS]));
  });

  it('still excludes every player’s cards, including the board’s, while adding a fresh player', () => {
    const players = [holeCardsPlayer('player-1', SIX_SPADES, FIVE_HEARTS)];

    const result = unavailableCardsForPlayer([ACE_SPADES], players, null);

    expect(result).toEqual(expect.arrayContaining([ACE_SPADES, SIX_SPADES, FIVE_HEARTS]));
  });

  it('returns a deleted player’s cards to availability once they are gone from the list', () => {
    const remaining = [holeCardsPlayer('player-2', ACE_SPADES, TWO_CLUBS)];

    const result = unavailableCardsForPlayer([], remaining, null);

    expect(result).toEqual([ACE_SPADES, TWO_CLUBS]);
    expect(result).not.toEqual(expect.arrayContaining([SIX_SPADES, FIVE_HEARTS]));
  });
});
