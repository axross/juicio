import { cardKey, cardLabel, cardsEqual, DECK, RANKS, SUITS, type Card } from './card';

describe('RANKS', () => {
  it('runs 2 low through A high, all thirteen ranks', () => {
    expect(RANKS).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
  });
});

describe('SUITS', () => {
  it('runs spades, hearts, diamonds, clubs', () => {
    expect(SUITS).toEqual(['spades', 'hearts', 'diamonds', 'clubs']);
  });
});

describe('DECK', () => {
  it('has exactly 52 cards', () => {
    expect(DECK).toHaveLength(52);
  });

  it('has no two cards sharing a cardKey', () => {
    const keys = new Set(DECK.map(cardKey));
    expect(keys.size).toBe(52);
  });

  it('pairs every rank with all four suits', () => {
    for (const rank of RANKS) {
      const suitsForRank = DECK.filter((card) => card.rank === rank).map((card) => card.suit);
      expect(suitsForRank).toEqual(SUITS);
    }
  });
});

describe('cardsEqual()', () => {
  it('is true for two cards with the same rank and suit', () => {
    const a: Card = { rank: 'A', suit: 'spades' };
    const b: Card = { rank: 'A', suit: 'spades' };
    expect(cardsEqual(a, b)).toBe(true);
  });

  it('is false when the rank differs', () => {
    expect(cardsEqual({ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'spades' })).toBe(false);
  });

  it('is false when the suit differs', () => {
    expect(cardsEqual({ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' })).toBe(false);
  });
});

describe('cardKey()', () => {
  it("renders as the rank plus the suit's first letter", () => {
    expect(cardKey({ rank: 'A', suit: 'hearts' })).toBe('Ah');
    expect(cardKey({ rank: 'T', suit: 'diamonds' })).toBe('Td');
    expect(cardKey({ rank: '2', suit: 'clubs' })).toBe('2c');
    expect(cardKey({ rank: 'K', suit: 'spades' })).toBe('Ks');
  });
});

describe('cardLabel()', () => {
  it("renders as the rank plus the suit's Unicode glyph", () => {
    expect(cardLabel({ rank: 'A', suit: 'hearts' })).toBe('A♥');
    expect(cardLabel({ rank: 'T', suit: 'diamonds' })).toBe('T♦');
    expect(cardLabel({ rank: '2', suit: 'clubs' })).toBe('2♣');
    expect(cardLabel({ rank: 'K', suit: 'spades' })).toBe('K♠');
  });
});
