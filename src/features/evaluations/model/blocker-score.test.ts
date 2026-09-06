import { cardPair, cardPairNumber, CARD_PAIR_COUNT, type CardPair } from '@/shared/model/card-pair';
import { SUITS } from '@/shared/model/card';

import {
  blockerScoreBarFraction,
  blockerScoreOpponentOrdinal,
  blockerScoreRowsForRankPair,
  blockerScoreScale,
  formatBlockerScore,
  isBlockerScoreSettled,
  readBlockerScore,
  roundBlockerScoreToOneDecimal,
  type BlockerScoreRow,
} from './blocker-score';

/** every Card Pair one Rank Pair stands for, sorted by **card pair number**
 * — this file's own stand-in for `./blocker-score.ts`'s private
 * `cardPairsForRankPair`, built independently so a test here exercises the
 * buffer contract rather than assuming the module's own internal
 * enumeration order. */
function cardPairsInCanonicalOrder(pairs: readonly CardPair[]): readonly CardPair[] {
  return [...pairs].sort((a, b) => cardPairNumber(a) - cardPairNumber(b));
}

const AA_CARD_PAIRS: readonly CardPair[] = (() => {
  const pairs: CardPair[] = [];
  for (let i = 0; i < SUITS.length; i++) {
    for (let j = i + 1; j < SUITS.length; j++) {
      pairs.push(cardPair({ rank: 'A', suit: SUITS[i] }, { rank: 'A', suit: SUITS[j] }));
    }
  }
  return pairs;
})();

const AK_SUITED_CARD_PAIRS: readonly CardPair[] = SUITS.map((suit) =>
  cardPair({ rank: 'A', suit }, { rank: 'K', suit }),
);

const KK_CARD_PAIRS: readonly CardPair[] = (() => {
  const pairs: CardPair[] = [];
  for (let i = 0; i < SUITS.length; i++) {
    for (let j = i + 1; j < SUITS.length; j++) {
      pairs.push(cardPair({ rank: 'K', suit: SUITS[i] }, { rank: 'K', suit: SUITS[j] }));
    }
  }
  return pairs;
})();

/** builds the `equities`/`blockerScores` pair `blockerScoreRowsForRankPair`
 * reads: `entries` names, for each live Card Pair, its own per-opponent
 * figures — every Card Pair not named stays non-live (`NaN` in `equities`,
 * never read).
 *
 * **`entries`' own `values` are display-scale, signed percentage points —
 * the same figures a test asserts back out — and this helper is what
 * converts each one down to `blockerScores`' own engine-scale fraction
 * before seeding the raw buffer**, dividing by 100 (the exact inverse of
 * `readBlockerScore`'s own `* 100`), so every test below stays written in
 * the same display-scale terms its assertions already use, while the raw
 * buffer this helper actually produces genuinely matches
 * `modules/espada-engine/src/specs/espada-engine.nitro.ts`'s own
 * `blockerScores` contract — a fraction in `[-1, 1]`, not a percentage
 * already multiplied out. Seeding this same division at the one place
 * every entry passes through, rather than dividing each literal by hand, is
 * what keeps every seed and its own displayed figure bit-exact inverses of
 * one another (`readBlockerScore`'s own doc comment; confirmed for every
 * value this file seeds). */
function buildBuffers(
  playerCount: number,
  entries: readonly { readonly pair: CardPair; readonly values: readonly number[] }[],
): { readonly equities: ArrayBuffer; readonly blockerScores: ArrayBuffer } {
  const opponentCount = playerCount - 1;
  const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  const blockerScores = new Float64Array(CARD_PAIR_COUNT * opponentCount).fill(NaN);
  for (const { pair, values } of entries) {
    const number = cardPairNumber(pair);
    equities[number] = 0.5; // any finite value marks this Card Pair live.
    values.forEach((value, ordinal) => {
      blockerScores[number * opponentCount + ordinal] = value / 100;
    });
  }
  return { equities: equities.buffer, blockerScores: blockerScores.buffer };
}

describe('roundBlockerScoreToOneDecimal', () => {
  it('rounds a positive half away from zero', () => {
    expect(roundBlockerScoreToOneDecimal(1.25)).toBe(1.3);
  });

  it('rounds a negative half away from zero, not toward positive infinity', () => {
    // `Math.round(-1.25 * 10) / 10` gives `-1.2` — the exact defect
    // docs/specs/equity-breakdown.md's "System design" section calls out.
    expect(roundBlockerScoreToOneDecimal(-1.25)).toBe(-1.3);
  });

  it('rounds an ordinary value to one decimal in both signs', () => {
    expect(roundBlockerScoreToOneDecimal(0.34)).toBe(0.3);
    expect(roundBlockerScoreToOneDecimal(-0.34)).toBe(-0.3);
  });
});

describe('formatBlockerScore', () => {
  it('formats a positive figure with an explicit leading +', () => {
    expect(formatBlockerScore(1.25)).toBe('+1.3');
  });

  it('formats a negative figure rounded away from zero', () => {
    expect(formatBlockerScore(-1.25)).toBe('-1.3');
  });

  it('formats exactly zero as +0.0, never -0.0', () => {
    expect(formatBlockerScore(0)).toBe('+0.0');
  });

  it('formats a value that rounds to zero as +0.0 regardless of its own sign', () => {
    expect(formatBlockerScore(-0.02)).toBe('+0.0');
    expect(formatBlockerScore(0.02)).toBe('+0.0');
  });
});

describe('blockerScoreOpponentOrdinal', () => {
  it('reads an opponent seated before the scoring player at its own seat index', () => {
    expect(blockerScoreOpponentOrdinal(0, 1)).toBe(0);
  });

  it('reads an opponent seated after the scoring player one ordinal lower', () => {
    expect(blockerScoreOpponentOrdinal(2, 1)).toBe(1);
  });

  it('agrees with both seat orders at a three-seat table', () => {
    // the scoring player at seat 1 reads seat 0 as ordinal 0 and seat 2 as
    // ordinal 1 — docs/specs/equity-breakdown.md's own worked example.
    expect(blockerScoreOpponentOrdinal(0, 1)).toBe(0);
    expect(blockerScoreOpponentOrdinal(2, 1)).toBe(1);
    // the scoring player at seat 0 reads seat 1 as ordinal 0 and seat 2 as
    // ordinal 1 — no seat sits ahead of it to shift down.
    expect(blockerScoreOpponentOrdinal(1, 0)).toBe(0);
    expect(blockerScoreOpponentOrdinal(2, 0)).toBe(1);
  });
});

describe('readBlockerScore', () => {
  it('reads the index arithmetic across both seat orders at a three-seat table, scaled ×100', () => {
    const playerCount = 3;
    const opponentCount = playerCount - 1;
    const cardPairNum = 5;
    const view = new Float64Array(CARD_PAIR_COUNT * opponentCount).fill(NaN);
    // the engine's own buffer carries a plain fraction in `[-1, 1]`
    // (`readBlockerScore`'s own doc comment) — seeded here as `1.1 / 100`
    // and `-2.2 / 100` rather than as `0.011`/`-0.022` by hand, so the seed
    // and the ×100-converted figure asserted below stay exact inverses of
    // one another regardless of floating-point rounding.
    view[cardPairNum * opponentCount + 0] = 1.1 / 100;
    view[cardPairNum * opponentCount + 1] = -2.2 / 100;

    expect(readBlockerScore(view.buffer, cardPairNum, 0, playerCount)).toBe(1.1);
    expect(readBlockerScore(view.buffer, cardPairNum, 1, playerCount)).toBeCloseTo(-2.2);
  });

  it('treats a non-live card pair slot as NaN', () => {
    const playerCount = 2;
    const view = new Float64Array(CARD_PAIR_COUNT).fill(NaN);
    expect(Number.isNaN(readBlockerScore(view.buffer, 0, 0, playerCount))).toBe(true);
  });

  it('treats an empty buffer as unsettled', () => {
    expect(Number.isNaN(readBlockerScore(new ArrayBuffer(0), 0, 0, 2))).toBe(true);
  });
});

describe('blockerScoreRowsForRankPair', () => {
  it('collapses every live combination agreeing on the same figures into one rank-pair entry', () => {
    const playerCount = 2;
    const { equities, blockerScores } = buildBuffers(
      playerCount,
      AK_SUITED_CARD_PAIRS.map((pair) => ({ pair, values: [1.2] })),
    );

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    expect(rows).toEqual([
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 4, values: [1.2] },
    ]);
  });

  it('pulls one deviating combination onto its own row, leaving a rank-pair entry for the rest', () => {
    const playerCount = 2;
    const [first, ...rest] = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS);
    const { equities, blockerScores } = buildBuffers(playerCount, [
      { pair: first, values: [1.3] },
      ...rest.map((pair) => ({ pair, values: [1.1] })),
    ]);

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    // the plan's own worked example: the deviating combination's own row
    // first (it is the earliest Card Pair in canonical order), then the
    // rank-pair row standing for the other three.
    expect(rows).toEqual([
      { kind: 'cardPair', cardPair: first, values: [1.3] },
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 3, values: [1.1] },
    ]);
  });

  it('gives every live combination its own row, and no rank-pair row, once every one differs', () => {
    const playerCount = 2;
    const ordered = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS);
    const { equities, blockerScores } = buildBuffers(
      playerCount,
      ordered.map((pair, index) => ({ pair, values: [1.0 + index * 0.1] })),
    );

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    expect(rows.every((row) => row.kind === 'cardPair')).toBe(true);
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.values[0])).toEqual([1, 1.1, 1.2, 1.3]);
  });

  it('resolves a same-size tie toward the group containing the earliest canonical card pair', () => {
    const playerCount = 2;
    const ordered = cardPairsInCanonicalOrder(AA_CARD_PAIRS);
    // two groups of three, deterministic regardless of iteration order:
    // positions 0/2/4 read `1.0`, positions 1/3/5 read `2.0` — the earliest
    // member overall (position 0) sits in the first group, so that group
    // must win the tie every time this runs.
    const entries = ordered.map((pair, index) => ({
      pair,
      values: [index % 2 === 0 ? 1.0 : 2.0],
    }));
    const { equities, blockerScores } = buildBuffers(playerCount, entries);

    const rows = blockerScoreRowsForRankPair('AA', equities, blockerScores, playerCount);

    const rankPairRow = rows.find((row) => row.kind === 'rankPair');
    expect(rankPairRow).toEqual({
      kind: 'rankPair',
      rankPairKey: 'AA',
      combinationCount: 3,
      values: [1],
    });
    expect(rows.filter((row) => row.kind === 'cardPair')).toHaveLength(3);
    // repeating the same calculation produces the same rows — the grouping
    // and its tie-break do not depend on `Map` iteration order or on
    // anything else that could vary run to run.
    expect(blockerScoreRowsForRankPair('AA', equities, blockerScores, playerCount)).toEqual(rows);
  });

  it('excludes a non-live card pair from both the display and the grouping', () => {
    const playerCount = 2;
    const ordered = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS);
    const [excluded, ...rest] = ordered;
    // every live combination left agrees — `excluded` is left out of the
    // buffer entirely (`equities` stays `NaN` for it), so it must not
    // appear as a row and must not count toward the group it would
    // otherwise have joined.
    const { equities, blockerScores } = buildBuffers(
      playerCount,
      rest.map((pair) => ({ pair, values: [1.2] })),
    );

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    expect(rows).toEqual([
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 3, values: [1.2] },
    ]);
    expect(
      rows.some(
        (row) =>
          row.kind === 'cardPair' && cardPairNumber(row.cardPair) === cardPairNumber(excluded),
      ),
    ).toBe(false);
  });

  it('returns no rows at all for a rank pair with no live card pair', () => {
    const playerCount = 2;
    const { equities, blockerScores } = buildBuffers(playerCount, []);

    expect(blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount)).toEqual([]);
  });

  it('returns no rows for an empty equities buffer, rather than treating every card pair as live', () => {
    // hardening, not a reachable defect: every real call site guards on
    // `isBlockerScoreSettled` first, and a genuinely settled result always
    // carries an `equities` sized for every card pair number this function
    // looks up. This closes the gap in the function's own exported
    // signature, which documents no such precondition — an unbounded
    // `equityView[number]` on a zero-length `equities` reads `undefined`,
    // and `Number.isNaN(undefined)` is `false`, so every card pair would
    // wrongly be treated as live with `NaN` scores absent this guard.
    const playerCount = 2;
    const equities = new ArrayBuffer(0);
    const blockerScores = new Float64Array(CARD_PAIR_COUNT).fill(NaN).buffer;

    expect(blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount)).toEqual([]);
  });

  it('groups a difference below the displayed precision together, and keeps one at it apart', () => {
    const playerCount = 2;
    const ordered = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS);
    // 1.241 and 1.244 both round to 1.2 (a difference the display never
    // shows); 1.15 also rounds to 1.2 (round-half-away-from-zero); 1.05
    // rounds to 1.1 — a genuinely different displayed figure.
    const { equities, blockerScores } = buildBuffers(playerCount, [
      { pair: ordered[0], values: [1.241] },
      { pair: ordered[1], values: [1.244] },
      { pair: ordered[2], values: [1.15] },
      { pair: ordered[3], values: [1.05] },
    ]);

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    expect(rows).toEqual([
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 3, values: [1.2] },
      { kind: 'cardPair', cardPair: ordered[3], values: [1.1] },
    ]);
  });

  it('never groups card pairs from two different rank pairs, even at identical figures', () => {
    const playerCount = 2;
    const akEntries = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS).map((pair) => ({
      pair,
      values: [1.2],
    }));
    const kkEntries = cardPairsInCanonicalOrder(KK_CARD_PAIRS).map((pair) => ({
      pair,
      values: [1.2],
    }));
    const { equities, blockerScores } = buildBuffers(playerCount, [...akEntries, ...kkEntries]);

    const akRows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);
    const kkRows = blockerScoreRowsForRankPair('KK', equities, blockerScores, playerCount);

    expect(akRows).toEqual([
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 4, values: [1.2] },
    ]);
    expect(kkRows).toEqual([
      { kind: 'rankPair', rankPairKey: 'KK', combinationCount: 6, values: [1.2] },
    ]);
  });

  it('carries one figure per opponent at a three-seat table, never combined', () => {
    const playerCount = 3;
    const ordered = cardPairsInCanonicalOrder(AK_SUITED_CARD_PAIRS);
    const { equities, blockerScores } = buildBuffers(
      playerCount,
      ordered.map((pair) => ({ pair, values: [1.2, -0.5] })),
    );

    const rows = blockerScoreRowsForRankPair('AKs', equities, blockerScores, playerCount);

    expect(rows).toEqual([
      { kind: 'rankPair', rankPairKey: 'AKs', combinationCount: 4, values: [1.2, -0.5] },
    ]);
  });
});

describe('blockerScoreScale', () => {
  const row = (values: readonly number[]): BlockerScoreRow => ({
    kind: 'cardPair',
    cardPair: AK_SUITED_CARD_PAIRS[0],
    values,
  });

  it('reads the largest absolute figure across every row and every opponent', () => {
    expect(blockerScoreScale([row([1.2, -0.4]), row([-2.1, 0.3])])).toBe(2.1);
  });

  it('reads zero for an empty list', () => {
    expect(blockerScoreScale([])).toBe(0);
  });

  it('reads zero when every figure rounds to zero', () => {
    expect(blockerScoreScale([row([0, 0])])).toBe(0);
  });
});

describe('isBlockerScoreSettled', () => {
  it('reads a non-empty buffer as settled', () => {
    expect(isBlockerScoreSettled(new Float64Array(1).buffer)).toBe(true);
  });

  it('reads an empty buffer — a progress tick, or no result at all — as not settled', () => {
    expect(isBlockerScoreSettled(new ArrayBuffer(0))).toBe(false);
  });
});

describe('blockerScoreBarFraction', () => {
  it('reaches the end of its track at the scale itself', () => {
    expect(blockerScoreBarFraction(2.1, 2.1)).toBe(1);
  });

  it('draws proportionally to the scale', () => {
    expect(blockerScoreBarFraction(1.05, 2.1)).toBe(0.5);
  });

  it('draws no bar at all for an all-zero list, rather than dividing by zero', () => {
    expect(blockerScoreBarFraction(0, 0)).toBe(0);
  });
});
