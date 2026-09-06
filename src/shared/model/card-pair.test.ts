import { cardPair, CARD_PAIR_COUNT, cardPairFromNumber, cardPairNumber } from './card-pair';
import { DECK, type Card } from './card';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const ACE_DIAMONDS: Card = { rank: 'A', suit: 'd' };
const KING_HEARTS: Card = { rank: 'K', suit: 'h' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };

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

describe('cardPairNumber()', () => {
  // docs/specs/equity-analysis.md's Blocker Score section's own worked
  // examples, also pinned in
  // modules/espada-engine/lib/espada-engine/src/equity_job.rs's
  // `card_pair_number_matches_the_specs_worked_examples` test — the first
  // pair, a boundary pair (the last pair whose smaller card is a deuce),
  // and the last two pairs overall.
  it("matches the spec's worked examples", () => {
    expect(cardPairNumber(cardPair({ rank: '2', suit: 's' }, { rank: '2', suit: 'h' }))).toBe(0);
    expect(cardPairNumber(cardPair({ rank: '2', suit: 'd' }, { rank: '2', suit: 'c' }))).toBe(101);
    expect(cardPairNumber(cardPair({ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }))).toBe(1320);
    expect(cardPairNumber(cardPair({ rank: 'A', suit: 'd' }, { rank: 'A', suit: 'c' }))).toBe(1325);
  });

  it('numbers every one of the 1,326 distinct card pairs one to one, round-tripping to the same two cards', () => {
    const numbers = new Set<number>();

    for (const first of DECK) {
      for (const second of DECK) {
        if (first.rank === second.rank && first.suit === second.suit) {
          continue;
        }
        const pair = cardPair(first, second);
        const number = cardPairNumber(pair);

        expect(number).toBeGreaterThanOrEqual(0);
        expect(number).toBeLessThan(CARD_PAIR_COUNT);
        expect(cardPairFromNumber(number)).toEqual(pair);
        numbers.add(number);
      }
    }

    expect(numbers.size).toBe(CARD_PAIR_COUNT);
  });
});
