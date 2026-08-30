import { HapticEvent } from '@/core/haptics/haptics';

import { RANKS, type Rank } from './card';
import { HAND_RANGE_SHORTHANDS, isEverySelected, toggleShorthand } from './hand-range-shorthand';
import { rankPair, rankPairKey, type RankPairKey } from './rank-pair';

// this module's own `haptic` field is now `HapticEvent`, a real enum, so
// importing it above pulls in the real `@/core/haptics/haptics` — which,
// since the Sentry capture it added, reaches `@/core/instrumentation/
// report-error` and `@sentry/react-native`, starting a real `setInterval`
// nothing here ever clears. mocking `report-error` alone — same reasoning as
// `settings-screen.test.tsx`'s own comment on this — keeps that native SDK
// out of this test; nothing here needs `triggerHaptic` itself, only the
// `HapticEvent` values `toggleShorthand` returns.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

function shorthandByLabel(label: string) {
  const shorthand = HAND_RANGE_SHORTHANDS.find((entry) => entry.label === label);
  if (!shorthand) {
    throw new Error(`no shorthand named ${label} — did the fixture label change?`);
  }
  return shorthand;
}

describe('HAND_RANGE_SHORTHANDS', () => {
  it('has exactly the three named shorthands the design draws', () => {
    expect(HAND_RANGE_SHORTHANDS.map((entry) => entry.label)).toEqual(['A2s+', '55+', '98s-54s']);
  });

  describe('A2s+', () => {
    it('expands to all 12 suited aces, AKs down to A2s', () => {
      const { rankPairs } = shorthandByLabel('A2s+');
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

describe('toggleShorthand', () => {
  const fiftyFivePlus = shorthandByLabel('55+');

  it('selects every one of the shorthand’s own rank pairs when none of them is selected yet, reporting toggleOn', () => {
    const { next, haptic } = toggleShorthand(new Set(), fiftyFivePlus);

    expect(next).toEqual(fiftyFivePlus.rankPairs);
    expect(haptic).toBe(HapticEvent.ToggleOn);
  });

  it('selects every remaining one of the shorthand’s own rank pairs when only some are selected, reporting toggleOn', () => {
    const { next, haptic } = toggleShorthand(new Set(['55', '66']), fiftyFivePlus);

    expect(next).toEqual(fiftyFivePlus.rankPairs);
    expect(haptic).toBe(HapticEvent.ToggleOn);
  });

  it('deselects every one of the shorthand’s own rank pairs when all are already selected, reporting toggleOff', () => {
    const { next, haptic } = toggleShorthand(fiftyFivePlus.rankPairs, fiftyFivePlus);

    expect(next).toEqual(new Set());
    expect(haptic).toBe(HapticEvent.ToggleOff);
  });

  it('never touches a rank pair outside the shorthand’s own set, selecting', () => {
    const { next } = toggleShorthand(new Set(['22', 'AKo']), fiftyFivePlus);

    expect(next.has('22')).toBe(true);
    expect(next.has('AKo')).toBe(true);
  });

  it('never touches a rank pair outside the shorthand’s own set, deselecting', () => {
    const selected = new Set([...fiftyFivePlus.rankPairs, '22', 'AKo']);
    const { next } = toggleShorthand(selected, fiftyFivePlus);

    expect(next.has('22')).toBe(true);
    expect(next.has('AKo')).toBe(true);
    expect(next.has('55')).toBe(false);
  });
});

// exported so a chip caller can decide its own active state
// (docs/specs/hand-ranges.md's outlined active state) with the exact same
// predicate `toggleShorthand`'s own deselect branch already computes,
// rather than recomputing it — see `../ui/hand-range-pane/hand-range-pane.tsx`.
describe('isEverySelected', () => {
  const fiftyFivePlus = shorthandByLabel('55+');

  it('is true once every one of the shorthand’s own rank pairs is selected', () => {
    expect(isEverySelected(fiftyFivePlus.rankPairs, fiftyFivePlus.rankPairs)).toBe(true);
  });

  it('is true when the selection is a superset of the shorthand’s own rank pairs', () => {
    const selected = new Set([...fiftyFivePlus.rankPairs, '22', 'AKo']);
    expect(isEverySelected(selected, fiftyFivePlus.rankPairs)).toBe(true);
  });

  it('is false when even one of the shorthand’s own rank pairs is missing', () => {
    const selected = new Set([...fiftyFivePlus.rankPairs]);
    selected.delete('AA');
    expect(isEverySelected(selected, fiftyFivePlus.rankPairs)).toBe(false);
  });

  it('is false against an empty selection', () => {
    expect(isEverySelected(new Set(), fiftyFivePlus.rankPairs)).toBe(false);
  });
});
