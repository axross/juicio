import { RANKS, type Rank } from './card';
import { HAND_RANGE_SHORTHANDS } from './hand-range-shorthand';
import { rankPair, rankPairKey, type RankPairKey } from './rank-pair';

function shorthandByLabel(label: string) {
  const shorthand = HAND_RANGE_SHORTHANDS.find((entry) => entry.label === label);
  if (!shorthand) {
    throw new Error(`no shorthand named ${label} — did the fixture label change?`);
  }
  return shorthand;
}

describe('HAND_RANGE_SHORTHANDS', () => {
  it('has exactly the three named shorthands the design draws', () => {
    expect(HAND_RANGE_SHORTHANDS.map((entry) => entry.label)).toEqual(['A*s', '55+', '98s-54s']);
  });

  describe('A*s', () => {
    it('expands to all 12 suited aces, AKs down to A2s', () => {
      const { rankPairs } = shorthandByLabel('A*s');
      expect(rankPairs).toEqual(
        new Set([
          'AKs',
          'AQs',
          'AJs',
          'ATs',
          'A9s',
          'A8s',
          'A7s',
          'A6s',
          'A5s',
          'A4s',
          'A3s',
          'A2s',
        ]),
      );
    });
  });

  describe('55+', () => {
    it('expands to all 10 pocket pairs from 55 up to AA', () => {
      const { rankPairs } = shorthandByLabel('55+');
      expect(rankPairs).toEqual(
        new Set(['55', '66', '77', '88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA']),
      );
    });
  });

  describe('98s-54s', () => {
    it('expands to exactly the 5 suited connectors from 98s down to 54s', () => {
      const { rankPairs } = shorthandByLabel('98s-54s');
      expect(rankPairs).toEqual(new Set(['98s', '87s', '76s', '65s', '54s']));
    });
  });
});

/**
 * decodes exactly the espada range-notation shapes this project's three
 * shorthand tokens use — independently of `expandShorthand` in
 * `./hand-range-shorthand.ts` — so the test below cross-checks a
 * shorthand's `token` against its own hardcoded `rankPairs`, rather than
 * testing that module against itself. mirrors
 * modules/espada-engine/lib/espada-internal/src/hand_range/hand_range_token.rs's
 * grammar for a bottom-closed pocket-pair range ("NN+"), a bottom-closed
 * suited range ("ANs+"), and a comma-joined list of single suited pairs
 * ("XYs,XYs,..."); not a general parser, and not meant to grow into one —
 * see `./hand-range-shorthand.ts`'s own doc comment on why a fourth
 * shorthand is out of that module's scope, which this decoder inherits.
 */
function decodeToken(token: string): ReadonlySet<RankPairKey> {
  const bottomClosedPocket = /^([2-9TJQKA])\1\+$/.exec(token);
  if (bottomClosedPocket) {
    const fromIndex = RANKS.indexOf(bottomClosedPocket[1] as Rank);
    return new Set(RANKS.slice(fromIndex).map((rank) => rankPairKey(rankPair(rank, rank, false))));
  }

  const bottomClosedSuited = /^([2-9TJQKA])([2-9TJQKA])s\+$/.exec(token);
  if (bottomClosedSuited) {
    const [, high, kickerFrom] = bottomClosedSuited;
    const kickerFromIndex = RANKS.indexOf(kickerFrom as Rank);
    const highIndex = RANKS.indexOf(high as Rank);
    return new Set(
      RANKS.slice(kickerFromIndex, highIndex).map((kicker) =>
        rankPairKey(rankPair(high as Rank, kicker as Rank, true)),
      ),
    );
  }

  return new Set(
    token.split(',').map((single) => {
      const match = /^([2-9TJQKA])([2-9TJQKA])s$/.exec(single);
      if (!match) {
        throw new Error(
          `decodeToken cannot read "${single}" — did a fourth shorthand shape arrive?`,
        );
      }
      return rankPairKey(rankPair(match[1] as Rank, match[2] as Rank, true));
    }),
  );
}

describe('HAND_RANGE_SHORTHANDS token field', () => {
  it("carries each shorthand's own espada range-notation token", () => {
    expect(HAND_RANGE_SHORTHANDS.map((entry) => entry.token)).toEqual([
      'A2s+',
      '55+',
      '98s,87s,76s,65s,54s',
    ]);
  });

  it("decodes each shorthand's token to exactly what its rankPairs already hold", () => {
    for (const shorthand of HAND_RANGE_SHORTHANDS) {
      expect(decodeToken(shorthand.token)).toEqual(shorthand.rankPairs);
    }
  });
});
