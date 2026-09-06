import { groupRankPairsByGridOrder } from './rank-pair-groups';

// moved here from `../ui/equity-breakdown-rank-pairs/
// equity-breakdown-rank-pairs.test.tsx` (issue #293) once
// `groupRankPairsByGridOrder` gained a second reader — that suite's own
// component-level tests keep covering this function's own real behaviour
// end to end; these are this module's own direct tests of the pure logic.
describe('groupRankPairsByGridOrder', () => {
  it('sorts every Rank Pair into its own pocket/suited/offsuit group', () => {
    const groups = groupRankPairsByGridOrder(new Set(['AA', 'AKs', '72o']));

    expect(groups.pocket).toEqual(['AA']);
    expect(groups.suited).toEqual(['AKs']);
    expect(groups.offsuit).toEqual(['72o']);
  });

  it('returns an empty array for a group with nothing in it', () => {
    const groups = groupRankPairsByGridOrder(new Set(['AA']));

    expect(groups.suited).toEqual([]);
    expect(groups.offsuit).toEqual([]);
  });

  it('keeps each group in the canonical grid order, not insertion order', () => {
    const groups = groupRankPairsByGridOrder(new Set(['22', 'AA', 'KK']));

    expect(groups.pocket).toEqual(['AA', 'KK', '22']);
  });
});
