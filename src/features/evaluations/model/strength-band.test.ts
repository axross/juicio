import { CARD_PAIR_COUNT } from '@/shared/model/card-pair';

import { EQUITY_BIN_COUNTS, foldEquityBins } from './equity-breakdown';
import {
  bandEquityBinCounts,
  classifyCardPairBand,
  classifyCardPairBands,
  classifyPostflopBand,
  classifyPreflopBand,
  countStrengthBands,
  equityBinIndex,
  fairShare,
  liveCardPairsFromBuffers,
  majorityBandsPerBin,
  PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO,
  STRENGTH_BANDS,
  totalEquityBinCounts,
  TRASH_FAIR_SHARE_RATIO,
  type StrengthBand,
} from './strength-band';

/** builds `equities`/`strengths` buffers with `values[i]`'s own
 * `equity`/`strength` written at slot `i`, every other of `CARD_PAIR_COUNT`
 * slots left `NaN` — this file's own stand-in for a real
 * `EspadaEquityPlayerResult.equities`/`strengths` pair
 * (`@/modules/espada-engine/index`). */
function buffersFrom(values: readonly { equity: number; strength: number }[]): {
  equities: ArrayBuffer;
  strengths: ArrayBuffer;
} {
  const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  const strengths = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
  values.forEach((value, index) => {
    equities[index] = value.equity;
    strengths[index] = value.strength;
  });
  return { equities: equities.buffer, strengths: strengths.buffer };
}

describe('fairShare', () => {
  it('is 1/N for N players', () => {
    expect(fairShare(2)).toBe(0.5);
    expect(fairShare(3)).toBeCloseTo(1 / 3);
  });
});

describe('classifyPostflopBand', () => {
  // wet fixture heads-up (`JsTs4h`), fair = 1/2 — docs/decisions/2026-09-04-
  // classify-strength-bands-from-fair-share-equity-and-current-strength.md's
  // own worked example table.
  describe('wet fixture, heads-up (fair = 0.5)', () => {
    const fair = fairShare(2);

    it('J♥J♣ (a set, 88.35% equity, P 1.000) is Nuts', () => {
      expect(classifyPostflopBand(0.8835, 1.0, fair)).toBe('nuts');
    });

    // A♥J♦ (67.84% equity, P 0.855) is Rule R1's own deliberately
    // counter-intuitive worked example: it lands in `Nuts` rather than
    // `Value` because P already clears the 0.85 cutoff on its own, before
    // the Value branch is ever reached — see the decision record's own
    // worked example (docs/decisions/2026-09-04-classify-strength-bands-
    // from-fair-share-equity-and-current-strength.md).
    it('A♥J♦ (top pair, 67.84% equity, P 0.855) is Nuts, not Value, per Rule R1', () => {
      expect(classifyPostflopBand(0.6784, 0.855, fair)).toBe('nuts');
    });

    it('A♥T♥ (middle pair, 60.31% equity, P 0.714) is Value', () => {
      expect(classifyPostflopBand(0.6031, 0.714, fair)).toBe('value');
    });

    it('K♠Q♠ (a draw, 63.41% equity, P 0.115) is Marginal', () => {
      expect(classifyPostflopBand(0.6341, 0.115, fair)).toBe('marginal');
    });

    it('A♠K♠ (a draw, 66.85% equity, P 0.374) is Marginal', () => {
      expect(classifyPostflopBand(0.6685, 0.374, fair)).toBe('marginal');
    });

    it('8♣7♣ (high card, 25.57% equity, P 0.021) is Trash', () => {
      expect(classifyPostflopBand(0.2557, 0.021, fair)).toBe('trash');
    });
  });

  // dry fixture three-handed (`Qs8d2h`), fair = 1/3 — same decision
  // record's own worked example table.
  describe('dry fixture, three-handed (fair = 1/3)', () => {
    const fair = fairShare(3);

    it('Q♥Q♦ (a set, 94.93% equity, P 1.000) is Nuts', () => {
      expect(classifyPostflopBand(0.9493, 1.0, fair)).toBe('nuts');
    });

    it('A♥A♦ (an overpair, 70.43% equity, P 0.826) is Value', () => {
      expect(classifyPostflopBand(0.7043, 0.826, fair)).toBe('value');
    });

    it('A♥Q♦ (top pair, 61.22% equity, P 0.708) is Value', () => {
      expect(classifyPostflopBand(0.6122, 0.708, fair)).toBe('value');
    });

    it('7♠7♦ (a middling pocket pair, 29.68% equity, P 0.373) is Marginal', () => {
      expect(classifyPostflopBand(0.2968, 0.373, fair)).toBe('marginal');
    });

    it('A♦2♦ (bottom pair, 22.68% equity, P 0.140) is Marginal', () => {
      expect(classifyPostflopBand(0.2268, 0.14, fair)).toBe('marginal');
    });

    it('A♣3♣ (high card, 6.28% equity, P 0.000) is Trash', () => {
      expect(classifyPostflopBand(0.0628, 0.0, fair)).toBe('trash');
    });
  });

  // these four values are Rule R1's own stated inclusive/exclusive
  // boundaries, each tested on both sides so the edge is pinned rather
  // than merely one side of it.
  describe('boundary values', () => {
    const fair = 0.5;

    it('P = 0.85 is already Nuts (inclusive)', () => {
      expect(classifyPostflopBand(0.9, 0.85, fair)).toBe('nuts');
    });

    it('P just under 0.85 is not Nuts', () => {
      expect(classifyPostflopBand(0.9, 0.849999, fair)).not.toBe('nuts');
    });

    it('P = 0.50 (with equity clearing fair share) is already Value (inclusive)', () => {
      expect(classifyPostflopBand(0.5, 0.5, fair)).toBe('value');
    });

    it('P just under 0.50 is not Value', () => {
      expect(classifyPostflopBand(0.5, 0.499999, fair)).not.toBe('value');
    });

    it('equity = fairShare (with P clearing 0.50) already clears the Value equity check (inclusive)', () => {
      expect(classifyPostflopBand(fair, 0.6, fair)).toBe('value');
    });

    it('equity just under fairShare does not clear the Value equity check', () => {
      expect(classifyPostflopBand(fair - 0.0001, 0.6, fair)).not.toBe('value');
    });

    it('equity = 0.6 × fairShare does not clear the Trash check (exclusive)', () => {
      expect(classifyPostflopBand(TRASH_FAIR_SHARE_RATIO * fair, 0.3, fair)).toBe('marginal');
    });

    it('equity just under 0.6 × fairShare clears the Trash check', () => {
      expect(classifyPostflopBand(TRASH_FAIR_SHARE_RATIO * fair - 0.0001, 0.3, fair)).toBe('trash');
    });
  });

  // the same four boundary values above, at the three-handed fair share
  // (`fairShare(3)`) rather than the hard-coded `0.5` two-handed value —
  // this is the fair share that actually distinguishes the real `equity <
  // TRASH_FAIR_SHARE_RATIO * fair` computation from a rule that hard-codes
  // the two-handed result: `0.6 * (1/2)` is exactly `0.3`, so a rule that
  // hard-coded `0.3` for the trash threshold would already pass every
  // two-handed boundary test above. `0.6 * (1/3)` is not exactly
  // representable as a float and rounds down to `0.19999999999999998`,
  // strictly less than the literal `0.2` — so a rule that hard-coded `0.2`
  // instead would wrongly read `equity === 0.6 * fairShare(3)` as still
  // clearing the Trash check. Every fair share and boundary below is
  // derived from the module's own `fairShare(3)` and `TRASH_FAIR_SHARE_RATIO`,
  // never a hard-coded `0.3333` or `0.2` literal.
  describe('boundary values, three-handed (fair = 1/3)', () => {
    const fair = fairShare(3);

    it('P = 0.85 is already Nuts (inclusive)', () => {
      expect(classifyPostflopBand(0.9, 0.85, fair)).toBe('nuts');
    });

    it('P just under 0.85 is not Nuts', () => {
      expect(classifyPostflopBand(0.9, 0.849999, fair)).not.toBe('nuts');
    });

    it('P = 0.50 (with equity clearing fair share) is already Value (inclusive)', () => {
      expect(classifyPostflopBand(fair, 0.5, fair)).toBe('value');
    });

    it('P just under 0.50 is not Value', () => {
      expect(classifyPostflopBand(fair, 0.499999, fair)).not.toBe('value');
    });

    it('equity = fairShare (with P clearing 0.50) already clears the Value equity check (inclusive)', () => {
      expect(classifyPostflopBand(fair, 0.6, fair)).toBe('value');
    });

    it('equity just under fairShare does not clear the Value equity check', () => {
      expect(classifyPostflopBand(fair - 0.0001, 0.6, fair)).not.toBe('value');
    });

    it('equity = 0.6 × fairShare does not clear the Trash check (exclusive)', () => {
      expect(classifyPostflopBand(TRASH_FAIR_SHARE_RATIO * fair, 0.3, fair)).toBe('marginal');
    });

    it('equity just under 0.6 × fairShare clears the Trash check', () => {
      expect(classifyPostflopBand(TRASH_FAIR_SHARE_RATIO * fair - 0.0001, 0.3, fair)).toBe('trash');
    });

    // isolates the representability fact above from the boundary rule
    // itself: a rule that hard-coded the trash threshold as the literal
    // `0.2` reads `0.19999999999999998 < 0.2` as `true` and wrongly
    // classifies this pair as Trash, where the real `equity <
    // TRASH_FAIR_SHARE_RATIO * fair` computation reads it as `false` and
    // leaves it Marginal — the two-handed boundary tests above cannot tell
    // the two rules apart, since `0.6 * (1/2)` lands on the exact literal
    // `0.3` either way.
    it('catches a hard-coded 0.2 trash threshold, which the two-handed boundary above cannot', () => {
      const trashBoundary = TRASH_FAIR_SHARE_RATIO * fair;

      expect(trashBoundary).toBeLessThan(0.2);
      expect(classifyPostflopBand(trashBoundary, 0.3, fair)).toBe('marginal');
      expect(classifyPostflopBand(0.2, 0.3, fair)).toBe('marginal');
    });
  });
});

describe('classifyPreflopBand', () => {
  const fair = 0.5;

  it('classifies below 0.6 × fairShare as Trash', () => {
    expect(classifyPreflopBand(0.1, fair)).toBe('trash');
  });

  it('classifies below fairShare (and at least 0.6 × fairShare) as Marginal', () => {
    expect(classifyPreflopBand(0.4, fair)).toBe('marginal');
  });

  it('classifies below fairShare + 0.6 × (1 - fairShare) (and at least fairShare) as Value', () => {
    expect(classifyPreflopBand(0.6, fair)).toBe('value');
  });

  it('classifies at or above fairShare + 0.6 × (1 - fairShare) as Nuts', () => {
    expect(classifyPreflopBand(0.9, fair)).toBe('nuts');
  });

  describe('boundary values', () => {
    it('equity = 0.6 × fairShare is already Marginal, not Trash (exclusive)', () => {
      expect(classifyPreflopBand(TRASH_FAIR_SHARE_RATIO * fair, fair)).toBe('marginal');
    });

    it('equity just under 0.6 × fairShare is Trash', () => {
      expect(classifyPreflopBand(TRASH_FAIR_SHARE_RATIO * fair - 0.0001, fair)).toBe('trash');
    });

    it('equity = fairShare is already Value, not Marginal (exclusive)', () => {
      expect(classifyPreflopBand(fair, fair)).toBe('value');
    });

    it('equity just under fairShare is Marginal', () => {
      expect(classifyPreflopBand(fair - 0.0001, fair)).toBe('marginal');
    });

    it('equity = fairShare + 0.6 × (1 - fairShare) is already Nuts, not Value (exclusive)', () => {
      const upperBound = fair + PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO * (1 - fair);
      expect(classifyPreflopBand(upperBound, fair)).toBe('nuts');
    });

    it('equity just under fairShare + 0.6 × (1 - fairShare) is Value', () => {
      const upperBound = fair + PREFLOP_VALUE_FAIR_SHARE_EXCESS_RATIO * (1 - fair);
      expect(classifyPreflopBand(upperBound - 0.0001, fair)).toBe('value');
    });
  });

  // the analogous three-handed coverage for this rule's own Trash/Marginal
  // cutoff, which shares the same `0.6 × fair` boundary — and the same
  // representability fact — `classifyPostflopBand`'s own three-handed
  // boundary values above rely on: `0.6 * (1/3)` rounds down to
  // `0.19999999999999998`, strictly less than the literal `0.2`, so a rule
  // that hard-coded `0.2` for this cutoff would wrongly read that value as
  // still Trash. Derived from the module's own `fairShare(3)`, never a
  // hard-coded `0.3333` or `0.2` literal.
  describe('boundary values, three-handed (fair = 1/3)', () => {
    const fair = fairShare(3);

    it('equity = 0.6 × fairShare is already Marginal, not Trash (exclusive)', () => {
      expect(classifyPreflopBand(TRASH_FAIR_SHARE_RATIO * fair, fair)).toBe('marginal');
    });

    it('equity just under 0.6 × fairShare is Trash', () => {
      expect(classifyPreflopBand(TRASH_FAIR_SHARE_RATIO * fair - 0.0001, fair)).toBe('trash');
    });

    // isolates the representability fact from the boundary rule itself —
    // see the analogous test on `classifyPostflopBand`'s own three-handed
    // boundary values above for the full reasoning.
    it('catches a hard-coded 0.2 trash threshold, which the two-handed boundary above cannot', () => {
      const trashBoundary = TRASH_FAIR_SHARE_RATIO * fair;

      expect(trashBoundary).toBeLessThan(0.2);
      expect(classifyPreflopBand(trashBoundary, fair)).toBe('marginal');
      expect(classifyPreflopBand(0.2, fair)).toBe('marginal');
    });
  });
});

describe('classifyCardPairBand', () => {
  it('dispatches to the postflop rule when isPreflop is false', () => {
    // P = 0.9 alone would be Nuts under the postflop rule; a low equity
    // changes nothing here since Nuts checks only current strength.
    expect(classifyCardPairBand({ equity: 0.05, strength: 0.9 }, 0.5, false)).toBe('nuts');
  });

  it('dispatches to the preflop rule when isPreflop is true, ignoring strength entirely', () => {
    // `strength` carries the preflop sentinel `0` in a real payload, but
    // this asserts the dispatch never reads it at all — a non-sentinel
    // value here still must not influence the preflop result.
    expect(classifyCardPairBand({ equity: 0.9, strength: 0 }, 0.5, true)).toBe('nuts');
    expect(classifyCardPairBand({ equity: 0.9, strength: 0.02 }, 0.5, true)).toBe('nuts');
  });
});

describe('liveCardPairsFromBuffers', () => {
  // `Math.fround` rounds an expected literal to the identical 32-bit float
  // `Float32Array` itself stores it as (`buffersFrom`'s own write) — a
  // plain `0.9` literal and the `0.9` a `Float32Array` slot round-trips are
  // two different `number`s at full `float64` precision, so comparing
  // against the unrounded literal would fail on precision alone, not on
  // this function's own behaviour.
  it('reads a live pair back from the slot it was written to, in ascending slot order', () => {
    const { equities, strengths } = buffersFrom([
      { equity: 0.9, strength: 0.9 },
      { equity: 0.1, strength: 0.05 },
    ]);

    expect(liveCardPairsFromBuffers(equities, strengths)).toEqual([
      { equity: Math.fround(0.9), strength: Math.fround(0.9) },
      { equity: Math.fround(0.1), strength: Math.fround(0.05) },
    ]);
  });

  // a slot is live exactly when its own `equities` value is not `NaN` — a
  // gap between two live slots (a card pair sharing a card with the board,
  // or with no live opponent combo left against it) is skipped entirely,
  // never surfaced as a placeholder entry.
  it('skips a NaN slot rather than surfacing it as a live pair', () => {
    const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
    const strengths = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
    equities[0] = 0.9;
    strengths[0] = 0.9;
    // slot 1 is left NaN in both — not live.
    equities[2] = 0.4;
    strengths[2] = 0.3;

    expect(liveCardPairsFromBuffers(equities.buffer, strengths.buffer)).toEqual([
      { equity: Math.fround(0.9), strength: Math.fround(0.9) },
      { equity: Math.fround(0.4), strength: Math.fround(0.3) },
    ]);
  });

  // preflop, every `strengths` slot is `NaN` regardless of liveness
  // (`EspadaEquityPlayerResult.strengths`'s own doc comment) — liveness is
  // read off `equities` alone, so a preflop pair is still returned, `NaN`
  // strength and all; `classifyCardPairBand`'s own `isPreflop` dispatch,
  // not this function, is what keeps that `NaN` from ever being classified.
  it('treats a pair as live from its equities slot alone, even when strengths is NaN (preflop)', () => {
    const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
    const strengths = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
    equities[0] = 0.6;

    const live = liveCardPairsFromBuffers(equities.buffer, strengths.buffer);

    expect(live).toHaveLength(1);
    expect(live[0].equity).toBe(Math.fround(0.6));
    expect(Number.isNaN(live[0].strength)).toBe(true);
  });

  it('returns an empty array when every slot is NaN', () => {
    const equities = new Float32Array(CARD_PAIR_COUNT).fill(NaN);
    const strengths = new Float32Array(CARD_PAIR_COUNT).fill(NaN);

    expect(liveCardPairsFromBuffers(equities.buffer, strengths.buffer)).toEqual([]);
  });
});

describe('classifyCardPairBands', () => {
  it('classifies every pair, in order, one band per pair', () => {
    const pairs = [
      { equity: 0.9, strength: 0.9 }, // nuts
      { equity: 0.6, strength: 0.6 }, // value
      { equity: 0.6, strength: 0.2 }, // marginal
      { equity: 0.1, strength: 0.05 }, // trash
    ];

    expect(classifyCardPairBands(pairs, 2, false)).toEqual(['nuts', 'value', 'marginal', 'trash']);
  });

  // a card pair with no live opponent holding carries no entry in `pairs`
  // at all (`EspadaEquityPlayerResult.pairs`'s own doc comment) — this
  // function classifies exactly what it is handed and nothing more, so a
  // shorter `pairs` array (some combos already excluded upstream) yields
  // exactly that many bands, never a band standing in for an excluded
  // combo.
  it('excludes nothing on its own — a card pair already absent from pairs never appears in the result', () => {
    const pairs = [
      { equity: 0.9, strength: 0.9 },
      { equity: 0.1, strength: 0.05 },
    ];

    const bands = classifyCardPairBands(pairs, 2, false);

    expect(bands).toHaveLength(2);
    expect(countStrengthBands(bands).nuts + countStrengthBands(bands).trash).toBe(2);
  });

  it('returns an empty array for an empty pairs list, with no division-by-zero crash', () => {
    expect(classifyCardPairBands([], 2, false)).toEqual([]);
  });
});

describe('countStrengthBands', () => {
  it('tallies every band, zero for one none of the pairs landed in', () => {
    const bands: StrengthBand[] = ['nuts', 'nuts', 'value', 'trash', 'trash', 'trash'];

    expect(countStrengthBands(bands)).toEqual({ nuts: 2, value: 1, marginal: 0, trash: 3 });
  });

  it('sums to the input length, always', () => {
    const bands: StrengthBand[] = ['nuts', 'value', 'marginal', 'trash'];
    const counts = countStrengthBands(bands);

    expect(counts.nuts + counts.value + counts.marginal + counts.trash).toBe(bands.length);
  });

  it('counts every band at zero for an empty input', () => {
    expect(countStrengthBands([])).toEqual({ nuts: 0, value: 0, marginal: 0, trash: 0 });
  });
});

describe('equityBinIndex', () => {
  it('bins 0 into the first slice', () => {
    expect(equityBinIndex(0)).toBe(0);
  });

  it('clamps an equity of exactly 1 into the last bin rather than one past it', () => {
    expect(equityBinIndex(1)).toBe(EQUITY_BIN_COUNTS[0] - 1);
  });

  it('bins a mid-range equity into the slice its own fraction names', () => {
    // 0.5 * 20 = 10 exactly — the 11th slice, index 10.
    expect(equityBinIndex(0.5)).toBe(10);
  });
});

describe('bandEquityBinCounts', () => {
  it('buckets every equity into its own bin, under its own band', () => {
    const equities = [0.01, 0.02, 0.51];
    const bands: StrengthBand[] = ['nuts', 'nuts', 'trash'];

    const counts = bandEquityBinCounts(equities, bands);

    expect(counts.nuts[0]).toBe(2);
    expect(counts.trash[10]).toBe(1);
    // every other bin, and every other band, stays at zero.
    expect(counts.nuts.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(counts.value.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(counts.marginal.reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(counts.trash.reduce((sum, value) => sum + value, 0)).toBe(1);
  });

  it('returns every band at all-zero for an empty input', () => {
    const counts = bandEquityBinCounts([], []);

    for (const band of STRENGTH_BANDS) {
      expect(counts[band]).toHaveLength(EQUITY_BIN_COUNTS[0]);
      expect(counts[band].every((count) => count === 0)).toBe(true);
    }
  });
});

describe('totalEquityBinCounts', () => {
  // the same fixture `bandEquityBinCounts`'s own first test uses, so a bar's
  // own height total and its own per-band composition are pinned against
  // the identical input — the property this function exists for: no live
  // card pair can count toward one bin's height while a different bin gets
  // its own colour.
  it('sums every band at each bin, agreeing with the per-band counts that produced it', () => {
    const equities = [0.01, 0.02, 0.51];
    const bands: StrengthBand[] = ['nuts', 'nuts', 'trash'];
    const bandBinCounts = bandEquityBinCounts(equities, bands);

    const totals = totalEquityBinCounts(bandBinCounts);

    expect(totals[0]).toBe(2);
    expect(totals[10]).toBe(1);
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(3);
  });

  it('returns every bin at zero for an all-zero input', () => {
    const bandBinCounts = bandEquityBinCounts([], []);

    expect(totalEquityBinCounts(bandBinCounts).every((total) => total === 0)).toBe(true);
  });
});

describe('majorityBandsPerBin', () => {
  function zeroBinCounts(): Record<StrengthBand, number[]> {
    return {
      nuts: new Array(EQUITY_BIN_COUNTS[0]).fill(0),
      value: new Array(EQUITY_BIN_COUNTS[0]).fill(0),
      marginal: new Array(EQUITY_BIN_COUNTS[0]).fill(0),
      trash: new Array(EQUITY_BIN_COUNTS[0]).fill(0),
    };
  }

  it('resolves each bin to whichever band holds the most card pairs in it', () => {
    const counts = zeroBinCounts();
    counts.nuts[0] = 3;
    counts.trash[0] = 1;
    counts.value[5] = 2;

    const majorities = majorityBandsPerBin(counts, 20);

    expect(majorities[0]).toBe('nuts');
    expect(majorities[5]).toBe('value');
  });

  it('resolves a tie between two bands to the stronger one', () => {
    const counts = zeroBinCounts();
    counts.value[2] = 4;
    counts.marginal[2] = 4;

    expect(majorityBandsPerBin(counts, 20)[2]).toBe('value');

    const nutsVsTrash = zeroBinCounts();
    nutsVsTrash.nuts[3] = 1;
    nutsVsTrash.trash[3] = 1;

    expect(majorityBandsPerBin(nutsVsTrash, 20)[3]).toBe('nuts');
  });

  it('resolves a bin with no live card pair under any band to null', () => {
    const counts = zeroBinCounts();

    expect(majorityBandsPerBin(counts, 20)[0]).toBeNull();
  });

  it('folds down to a narrower bar count the same position-based way foldEquityBins does', () => {
    const counts = zeroBinCounts();
    // every one of the first five raw bins (folded into output bin 0 at
    // count 8 — floor(0*20/8)=0 to floor(1*20/8)=2, so really bins [0,2) —
    // kept simple here by only touching bins the fold puts in the same
    // output bin.
    counts.nuts[0] = 5;
    counts.nuts[1] = 5;

    const totalRaw = counts.nuts.map((_, i) => counts.nuts[i] + counts.trash[i]);
    const foldedTotal = foldEquityBins(totalRaw, 8);
    const majorities = majorityBandsPerBin(counts, 8);

    // output bin 0 collects raw bins [0, 2) at count 8 — exactly where both
    // nonzero entries above sit — so its own total must agree with folding
    // the combined per-band totals the identical way.
    expect(foldedTotal[0]).toBe(10);
    expect(majorities[0]).toBe('nuts');
  });
});
