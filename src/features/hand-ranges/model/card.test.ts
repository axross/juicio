import {
  cardKey,
  cardsEqual,
  compareRankStrength,
  DECK,
  parseCard,
  parseRank,
  parseSuit,
  RANKS,
  SUITS,
  type Card,
} from './card';

describe('RANKS', () => {
  it('runs 2 low through A high, all thirteen ranks', () => {
    expect(RANKS).toEqual(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']);
  });
});

describe('SUITS', () => {
  it('runs spades, hearts, diamonds, clubs as their own letters', () => {
    expect(SUITS).toEqual(['s', 'h', 'd', 'c']);
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
    const a: Card = { rank: 'A', suit: 's' };
    const b: Card = { rank: 'A', suit: 's' };
    expect(cardsEqual(a, b)).toBe(true);
  });

  it('is false when the rank differs', () => {
    expect(cardsEqual({ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' })).toBe(false);
  });

  it('is false when the suit differs', () => {
    expect(cardsEqual({ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' })).toBe(false);
  });
});

describe('cardKey()', () => {
  it("renders as the rank plus the suit's own letter", () => {
    expect(cardKey({ rank: 'A', suit: 'h' })).toBe('Ah');
    expect(cardKey({ rank: 'T', suit: 'd' })).toBe('Td');
    expect(cardKey({ rank: '2', suit: 'c' })).toBe('2c');
    expect(cardKey({ rank: 'K', suit: 's' })).toBe('Ks');
  });
});

describe('compareRankStrength()', () => {
  it('is ascending, 2 low through A high', () => {
    expect(compareRankStrength('2', 'A')).toBeLessThan(0);
    expect(compareRankStrength('A', '2')).toBeGreaterThan(0);
    expect(compareRankStrength('K', 'K')).toBe(0);
  });

  it('agrees with RANKS on every pair of ranks', () => {
    for (const a of RANKS) {
      for (const b of RANKS) {
        expect(Math.sign(compareRankStrength(a, b))).toBe(
          Math.sign(RANKS.indexOf(a) - RANKS.indexOf(b)),
        );
      }
    }
  });
});

describe('parseSuit()', () => {
  it('round-trips every one of the 4 suit letters', () => {
    for (const suit of SUITS) {
      expect(parseSuit(suit)).toBe(suit);
    }
  });

  it('throws parsing a letter that names no suit', () => {
    expect(() => parseSuit('x')).toThrow();
  });
});

describe('parseRank()', () => {
  it('round-trips every one of the 13 ranks', () => {
    for (const rank of RANKS) {
      expect(parseRank(rank)).toBe(rank);
    }
  });

  it('throws parsing a glyph that names no rank', () => {
    expect(() => parseRank('1')).toThrow();
    expect(() => parseRank('10')).toThrow();
  });
});

describe('cardKey() / parseCard() round-trip', () => {
  it('round-trips every one of the 52 cards through cardKey then parseCard', () => {
    for (const card of DECK) {
      expect(parseCard(cardKey(card))).toEqual(card);
    }
  });

  it('round-trips every one of the 52 cardKey strings through parseCard then cardKey', () => {
    for (const card of DECK) {
      const key = cardKey(card);
      expect(cardKey(parseCard(key))).toBe(key);
    }
  });

  it('renders exactly as espada-internal’s Card Display does — rank glyph uppercase, ten as T, suit letter lowercase', () => {
    expect(cardKey({ rank: 'A', suit: 's' })).toBe('As');
    expect(cardKey({ rank: 'T', suit: 's' })).toBe('Ts');
    expect(cardKey({ rank: '9', suit: 'h' })).toBe('9h');
  });

  it('throws parsing a string of the wrong length', () => {
    expect(() => parseCard('A')).toThrow();
    expect(() => parseCard('Ahh')).toThrow();
  });

  it('throws parsing a string whose rank or suit is not valid', () => {
    expect(() => parseCard('Xh')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
  });
});
