import { cardPair } from './card-pair';
import type { Card } from './card';

const ACE_SPADES: Card = { rank: 'A', suit: 'spades' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'hearts' };
const ACE_DIAMONDS: Card = { rank: 'A', suit: 'diamonds' };
const KING_HEARTS: Card = { rank: 'K', suit: 'hearts' };
const TWO_CLUBS: Card = { rank: '2', suit: 'clubs' };

describe('cardPair()', () => {
  it('puts the higher-ranked card first regardless of call order', () => {
    expect(cardPair(KING_HEARTS, ACE_SPADES)).toEqual({ first: ACE_SPADES, second: KING_HEARTS });
    expect(cardPair(ACE_SPADES, KING_HEARTS)).toEqual({ first: ACE_SPADES, second: KING_HEARTS });
  });

  it('sorts an extreme rank gap the same way as an adjacent one', () => {
    expect(cardPair(TWO_CLUBS, ACE_SPADES)).toEqual({ first: ACE_SPADES, second: TWO_CLUBS });
  });

  it('breaks a tied rank by suit order (spades, hearts, diamonds, clubs)', () => {
    expect(cardPair(ACE_HEARTS, ACE_SPADES)).toEqual({ first: ACE_SPADES, second: ACE_HEARTS });
    expect(cardPair(ACE_DIAMONDS, ACE_HEARTS)).toEqual({ first: ACE_HEARTS, second: ACE_DIAMONDS });
  });

  it('throws when the two cards are the same card', () => {
    expect(() => cardPair(ACE_SPADES, { ...ACE_SPADES })).toThrow();
  });

  it('does not throw for two different cards of the same rank', () => {
    expect(() => cardPair(ACE_SPADES, ACE_HEARTS)).not.toThrow();
  });
});
