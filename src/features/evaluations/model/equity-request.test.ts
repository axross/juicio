import type { Holding } from '@/features/hand-ranges/model/holding';
import type { Card } from '@/shared/model/card';

import type { Board } from './board';
import { boardToEquityBoardString, holdingToEquityRangeString } from './equity-request';

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const KING_DIAMONDS: Card = { rank: 'K', suit: 'd' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };
const SEVEN_SPADES: Card = { rank: '7', suit: 's' };
const FOUR_DIAMONDS: Card = { rank: '4', suit: 'd' };

describe('boardToEquityBoardString()', () => {
  it('serializes an empty board as ""', () => {
    const board: Board = [];

    expect(boardToEquityBoardString(board)).toBe('');
  });

  it('serializes a three-card flop as space-separated card codes', () => {
    const board: Board = [ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS];

    expect(boardToEquityBoardString(board)).toBe('Ah Kd 2c');
  });

  it('serializes a four-card turn', () => {
    const board: Board = [ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS, SEVEN_SPADES];

    expect(boardToEquityBoardString(board)).toBe('Ah Kd 2c 7s');
  });

  it('serializes a five-card river', () => {
    const board: Board = [ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS, SEVEN_SPADES, FOUR_DIAMONDS];

    expect(boardToEquityBoardString(board)).toBe('Ah Kd 2c 7s 4d');
  });
});

describe('holdingToEquityRangeString()', () => {
  it('serializes a hole-cards holding as a bare, unseparated 4-character concatenation', () => {
    const holding: Holding = {
      kind: 'holeCards',
      holeCards: { first: ACE_HEARTS, second: KING_DIAMONDS },
    };

    expect(holdingToEquityRangeString(holding)).toBe('AhKd');
  });

  it('serializes a single-entry hand range as its own rank-pair key, unchanged', () => {
    const holding: Holding = { kind: 'handRange', rankPairs: new Set(['AA']) };

    expect(holdingToEquityRangeString(holding)).toBe('AA');
  });

  it('serializes a multi-entry hand range as its rank-pair keys, comma-joined', () => {
    const holding: Holding = { kind: 'handRange', rankPairs: new Set(['22', 'AKs', '72o']) };

    expect(holdingToEquityRangeString(holding)).toBe('22,AKs,72o');
  });
});
