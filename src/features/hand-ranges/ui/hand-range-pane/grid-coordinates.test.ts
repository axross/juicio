import { RANKS, type Rank } from '../../model/card';
import { rankPair } from '../../model/rank-pair';
import { gridCoordinatesToRankPair, rankPairToGridCoordinates } from './grid-coordinates';

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
