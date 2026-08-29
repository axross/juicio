import { RANKS, type Rank } from './card';
import {
  gridCoordinatesToRankPair,
  parseRankPairKey,
  rankPair,
  rankPairComboCount,
  rankPairKey,
  rankPairLabel,
  rankPairToGridCoordinates,
  type RankPair,
} from './rank-pair';

describe('rankPair()', () => {
  it('builds a pocket pair regardless of which equal rank is passed first', () => {
    expect(rankPair('A', 'A', true)).toEqual({ highRank: 'A', lowRank: 'A', suitedness: 'pair' });
  });

  it('sorts the higher rank into highRank whichever order the callsite passes', () => {
    expect(rankPair('K', 'A', true)).toEqual({ highRank: 'A', lowRank: 'K', suitedness: 'suited' });
    expect(rankPair('A', 'K', true)).toEqual({ highRank: 'A', lowRank: 'K', suitedness: 'suited' });
  });

  it('builds offsuit when suited is false', () => {
    expect(rankPair('7', '2', false)).toEqual({
      highRank: '7',
      lowRank: '2',
      suitedness: 'offsuit',
    });
  });
});

describe('rankPairKey() / rankPairLabel()', () => {
  it('renders a pocket pair as the rank doubled', () => {
    expect(rankPairKey(rankPair('A', 'A', true))).toBe('AA');
  });

  it('renders suited with an s suffix and offsuit with an o suffix', () => {
    expect(rankPairKey(rankPair('A', 'K', true))).toBe('AKs');
    expect(rankPairKey(rankPair('A', 'K', false))).toBe('AKo');
  });

  it('gives rankPairLabel the same value as rankPairKey', () => {
    const pair = rankPair('7', '2', false);
    expect(rankPairLabel(pair)).toBe(rankPairKey(pair));
  });
});

describe('parseRankPairKey()', () => {
  it('inverts rankPairKey for a pocket pair, a suited hand, and an offsuit hand', () => {
    const pairs: RankPair[] = [
      rankPair('A', 'A', true),
      rankPair('A', 'K', true),
      rankPair('7', '2', false),
    ];
    for (const pair of pairs) {
      expect(parseRankPairKey(rankPairKey(pair))).toEqual(pair);
    }
  });
});

describe('rankPairComboCount()', () => {
  it('is 6 for a pocket pair', () => {
    expect(rankPairComboCount(rankPair('A', 'A', true))).toBe(6);
  });

  it('is 4 for a suited hand', () => {
    expect(rankPairComboCount(rankPair('A', 'K', true))).toBe(4);
  });

  it('is 12 for an offsuit hand', () => {
    expect(rankPairComboCount(rankPair('A', 'K', false))).toBe(12);
  });
});

describe('rankPairToGridCoordinates() / gridCoordinatesToRankPair()', () => {
  it('puts a pocket pair on the diagonal', () => {
    const coordinates = rankPairToGridCoordinates(rankPair('Q', 'Q', true));
    expect(coordinates.row).toBe(coordinates.col);
  });

  it('puts a suited hand above the diagonal (row < col)', () => {
    const coordinates = rankPairToGridCoordinates(rankPair('A', 'K', true));
    expect(coordinates.row).toBeLessThan(coordinates.col);
  });

  it('puts an offsuit hand below the diagonal (row > col)', () => {
    const coordinates = rankPairToGridCoordinates(rankPair('A', 'K', false));
    expect(coordinates.row).toBeGreaterThan(coordinates.col);
  });

  it('places AA at (0, 0) and 22 at (12, 12), the grid corners', () => {
    expect(rankPairToGridCoordinates(rankPair('A', 'A', true))).toEqual({ row: 0, col: 0 });
    expect(rankPairToGridCoordinates(rankPair('2', '2', true))).toEqual({ row: 12, col: 12 });
  });

  it('round-trips every rank pair on the grid through both coordinate directions', () => {
    for (let row = 0; row < RANKS.length; row += 1) {
      for (let col = 0; col < RANKS.length; col += 1) {
        const pair = gridCoordinatesToRankPair({ row, col });
        expect(rankPairToGridCoordinates(pair)).toEqual({ row, col });
      }
    }
  });

  it('round-trips every rank combination through rankPairToGridCoordinates then back', () => {
    for (const highRank of RANKS) {
      for (const lowRank of RANKS) {
        for (const suited of [true, false]) {
          const pair = rankPair(highRank as Rank, lowRank as Rank, suited);
          expect(gridCoordinatesToRankPair(rankPairToGridCoordinates(pair))).toEqual(pair);
        }
      }
    }
  });
});
