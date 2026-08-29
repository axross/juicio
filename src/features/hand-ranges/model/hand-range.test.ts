import { RANKS, type Rank } from './card';
import { handRangeComboCount, type HandRange } from './hand-range';
import { rankPair, rankPairKey } from './rank-pair';

/** every cell of the 13×13 grid — every pocket pair, every suited hand, every offsuit hand. */
function fullGrid(): HandRange {
  const keys = new Set<string>();
  for (const rank of RANKS) {
    keys.add(rankPairKey(rankPair(rank, rank, true)));
  }
  for (const highRank of RANKS) {
    for (const lowRank of RANKS) {
      if (highRank === lowRank) continue;
      keys.add(rankPairKey(rankPair(highRank as Rank, lowRank as Rank, true)));
      keys.add(rankPairKey(rankPair(highRank as Rank, lowRank as Rank, false)));
    }
  }
  return keys;
}

describe('handRangeComboCount()', () => {
  it('is 0 for an empty range', () => {
    expect(handRangeComboCount(new Set())).toBe(0);
  });

  it('sums a single pocket pair to 6', () => {
    expect(handRangeComboCount(new Set([rankPairKey(rankPair('A', 'A', true))]))).toBe(6);
  });

  it('sums a suited hand and its offsuit counterpart to 16', () => {
    const range = new Set([
      rankPairKey(rankPair('A', 'K', true)),
      rankPairKey(rankPair('A', 'K', false)),
    ]);
    expect(handRangeComboCount(range)).toBe(16);
  });

  it('sums the full 13×13 grid to 1326 combos', () => {
    // this is the assertion the per-rank-pair combo-count tests in
    // rank-pair.test.ts cannot make on their own: a wrong count for even
    // one of the 169 cells would still pass those tests individually, but
    // 1326 (13 pocket pairs × 6 + 78 suited × 4 + 78 offsuit × 12) is a
    // single number every one of them has to add up to correctly.
    expect(handRangeComboCount(fullGrid())).toBe(1326);
  });
});
