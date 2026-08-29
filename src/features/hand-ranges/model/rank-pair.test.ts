import { RANKS, type Rank } from './card';
import {
  cardPairCount,
  gridCoordinatesToRankPair,
  parseRankPairKey,
  rankPair,
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

  // exhaustive over the grid's own 169 cells (13 pocket pairs + 78 suited +
  // 78 offsuit) — cheap to run in full, and this is exactly the kind of
  // agreement (this project's own notation against itself, both
  // directions) that silently rots if only spot-checked. also doubles as
  // this project's own proof that `rankPairKey` renders byte-identical to
  // espada-internal's `RankPair` Display
  // (`modules/espada-engine/lib/espada-internal/src/hand_range/rank_pair.rs`)
  // — `AA`, `AKs`, `AKo` — since every key this loop produces and parses
  // back is built the same way that crate's own `Display` impl formats
  // one.
  it('round-trips all 169 rank pairs on the grid through rankPairKey then parseRankPairKey', () => {
    for (let row = 0; row < RANKS.length; row += 1) {
      for (let col = 0; col < RANKS.length; col += 1) {
        const pair = gridCoordinatesToRankPair({ row, col });
        const key = rankPairKey(pair);
        expect(parseRankPairKey(key)).toEqual(pair);
        expect(rankPairKey(parseRankPairKey(key))).toBe(key);
      }
    }
  });
});

describe('cardPairCount()', () => {
  it('is 6 for a pocket pair', () => {
    expect(cardPairCount(rankPair('A', 'A', true))).toBe(6);
  });

  it('is 4 for a suited hand', () => {
    expect(cardPairCount(rankPair('A', 'K', true))).toBe(4);
  });

  it('is 12 for an offsuit hand', () => {
    expect(cardPairCount(rankPair('A', 'K', false))).toBe(12);
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
