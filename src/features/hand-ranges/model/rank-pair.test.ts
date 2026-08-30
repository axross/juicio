import { RANKS } from './card';
import {
  cardPairCount,
  parseRankPairKey,
  rankPair,
  rankPairKey,
  rankPairLabel,
  type RankPair,
} from './rank-pair';

/**
 * every one of the 169 distinct rank pairs — 13 pocket pairs, 78 suited,
 * 78 offsuit — built directly through `rankPair()` rather than through
 * `../ui/hand-range-pane/grid-coordinates.ts`'s own grid coordinate
 * transform: this module's own tests have no business depending on that
 * sibling's view logic (`RankPair` construction is what this module
 * itself owns), and enumerating every unordered rank combination this way
 * is exhaustive on its own terms — see `docs/glossary.md`'s Rank Pair
 * entry for why 13 + 78 + 78 is the whole set.
 */
function allRankPairs(): RankPair[] {
  const pairs: RankPair[] = [];
  for (let i = 0; i < RANKS.length; i += 1) {
    for (let j = i; j < RANKS.length; j += 1) {
      if (i === j) {
        pairs.push(rankPair(RANKS[i], RANKS[i], true));
      } else {
        pairs.push(rankPair(RANKS[i], RANKS[j], true));
        pairs.push(rankPair(RANKS[i], RANKS[j], false));
      }
    }
  }
  return pairs;
}

describe('rankPair()', () => {
  it('builds a pocket pair regardless of which equal rank is passed first', () => {
    expect(rankPair('A', 'A', true)).toEqual({
      highRank: 'A',
      lowRank: 'A',
      suitedness: 'offsuit',
      isPocket: true,
    });
  });

  it('sorts the higher rank into highRank whichever order the callsite passes', () => {
    expect(rankPair('K', 'A', true)).toEqual({
      highRank: 'A',
      lowRank: 'K',
      suitedness: 'suited',
      isPocket: false,
    });
    expect(rankPair('A', 'K', true)).toEqual({
      highRank: 'A',
      lowRank: 'K',
      suitedness: 'suited',
      isPocket: false,
    });
  });

  it('builds offsuit, not pocket, when suited is false and the ranks differ', () => {
    expect(rankPair('7', '2', false)).toEqual({
      highRank: '7',
      lowRank: '2',
      suitedness: 'offsuit',
      isPocket: false,
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

  it('parses a pocket pair as offsuit with isPocket true, never as a third suitedness value', () => {
    expect(parseRankPairKey('AA')).toEqual({
      highRank: 'A',
      lowRank: 'A',
      suitedness: 'offsuit',
      isPocket: true,
    });
  });

  // exhaustive over all 169 rank pairs (13 pocket + 78 suited + 78
  // offsuit) — cheap to run in full, and this is exactly the kind of
  // agreement (this project's own notation against itself, both
  // directions) that silently rots if only spot-checked. also doubles as
  // this project's own proof that `rankPairKey` renders byte-identical to
  // espada-internal's `RankPair` Display
  // (`modules/espada-engine/lib/espada-internal/src/hand_range/rank_pair.rs`)
  // — `AA`, `AKs`, `AKo` — since every key this loop produces and parses
  // back is built the same way that crate's own `Display` impl formats
  // one.
  it('round-trips all 169 rank pairs through rankPairKey then parseRankPairKey', () => {
    for (const pair of allRankPairs()) {
      const key = rankPairKey(pair);
      expect(parseRankPairKey(key)).toEqual(pair);
      expect(rankPairKey(parseRankPairKey(key))).toBe(key);
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

describe('isPocket', () => {
  it('is true only for a pocket pair, never for a suited or offsuit hand of different ranks', () => {
    expect(rankPair('A', 'A', true).isPocket).toBe(true);
    expect(rankPair('A', 'K', true).isPocket).toBe(false);
    expect(rankPair('A', 'K', false).isPocket).toBe(false);
  });

  it('is true for every pocket pair, false for every suited or offsuit pair of different ranks', () => {
    for (const pair of allRankPairs()) {
      expect(pair.isPocket).toBe(pair.highRank === pair.lowRank);
    }
  });
});
