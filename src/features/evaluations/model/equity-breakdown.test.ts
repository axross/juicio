import {
  chooseBarCount,
  combosAxisUpperBound,
  COMBOS_AXIS_ROUND_TICK,
  EQUITY_BIN_COUNTS,
  foldEquityBins,
} from './equity-breakdown';

// stands in for a real player's own `EspadaEquityPlayerResult.distribution`
// (`@/modules/espada-engine/index`) below — a fixed sample this suite
// defines locally, per issue #138's own decision boundary, rather than the
// shared placeholder export this module no longer carries. This module's
// own folding arithmetic (`foldEquityBins`, `combosAxisUpperBound`) treats
// its input the same regardless of where that input comes from, so this
// sample exercises it exactly as the removed placeholder distribution did.
const SAMPLE_DISTRIBUTION: readonly number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

describe('foldEquityBins', () => {
  it('is a no-op at the input length', () => {
    expect(foldEquityBins(SAMPLE_DISTRIBUTION, 20)).toEqual(SAMPLE_DISTRIBUTION);
  });

  it.each(EQUITY_BIN_COUNTS)('folds to %i bins summing to the same total', (count) => {
    const folded = foldEquityBins(SAMPLE_DISTRIBUTION, count);

    expect(folded).toHaveLength(count);
    expect(folded.reduce((sum, value) => sum + value, 0)).toBe(188);
  });

  it('merges by even position, not a fixed run length, for an uneven fold', () => {
    // 20 into 16: runs of 20/16 = 1.25 input bins per output bin — the
    // first output bin collects input bins [0, 1.25) → just index 0; the
    // fourth collects [3.75, 5) → indices 4 (since floor(3*20/16)=3,
    // floor(4*20/16)=5, so this is actually the 4th, 0-indexed as 3).
    const folded = foldEquityBins(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      16,
    );

    expect(folded).toHaveLength(16);
    // every input value still appears exactly once, in one output bin:
    // (1+2+...+10) + (1*10) = 55 + 10 = 65.
    expect(folded.reduce((sum, value) => sum + value, 0)).toBe(65);
  });

  it('merges adjacent pairs evenly at a fold that does divide evenly', () => {
    expect(foldEquityBins([1, 2, 3, 4, 5, 6, 7, 8], 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('chooseBarCount', () => {
  // issue #102's plan states these thresholds directly — 20 times its own
  // 20pt legible-pitch floor, per tier — so this asserts against those
  // literal numbers rather than against `MINIMUM_BAR_PITCH * count`: a
  // test built from the constant under test cannot fail when that
  // constant itself regresses to the wrong value.
  it('selects each tier at its own legible-pitch threshold, from both sides', () => {
    expect(chooseBarCount(400)).toBe(20);
    expect(chooseBarCount(399)).toBe(16);
    expect(chooseBarCount(320)).toBe(16);
    expect(chooseBarCount(319)).toBe(12);
    expect(chooseBarCount(240)).toBe(12);
    expect(chooseBarCount(239)).toBe(8);
  });

  // the plan's own System design section states these exact figures: the
  // widest supported phone's own 430pt width and the sheet's side padding
  // leave 401pt for the chart to measure, and a 320pt-wide phone leaves
  // 291pt. Those are the *measured* widths — the canvas's own border box —
  // and `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx` hands
  // them to this function as measured, so they are asserted here as they
  // arrive. 401 rather than the 400 threshold above is the point: the
  // widest supported phone clears that threshold, it does not land on it.
  it('reaches 20 bars at the width a 430pt-wide phone leaves the chart, and 12 at a 320pt-wide one', () => {
    expect(chooseBarCount(401)).toBe(20);
    expect(chooseBarCount(291)).toBe(12);
  });

  it('falls back to 8 bars for a width below the narrowest tier this module defines', () => {
    expect(chooseBarCount(159)).toBe(8);
    expect(chooseBarCount(0)).toBe(8);
  });
});

describe('combosAxisUpperBound', () => {
  it.each(EQUITY_BIN_COUNTS)(
    'is at least as large as the tallest bin actually drawn at %i bars',
    (count) => {
      const bins = foldEquityBins(SAMPLE_DISTRIBUTION, count);

      expect(combosAxisUpperBound(bins)).toBeGreaterThanOrEqual(Math.max(...bins));
    },
  );

  it.each(EQUITY_BIN_COUNTS)('rounds up to a multiple of the round tick at %i bars', (count) => {
    const bins = foldEquityBins(SAMPLE_DISTRIBUTION, count);

    expect(combosAxisUpperBound(bins) % COMBOS_AXIS_ROUND_TICK).toBe(0);
  });

  // pinned against this sample distribution's own known maxima at each bar
  // count, so folding bins can never silently push a bar past a chart whose
  // top this test failed to notice moved.
  it("matches this sample distribution's own upper bound at every bar count", () => {
    expect(combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, 20))).toBe(20);
    expect(combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, 16))).toBe(40);
    expect(combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, 12))).toBe(40);
    expect(combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, 8))).toBe(60);
  });

  // issue #138: every player's own real distribution can differ from every
  // other's, so this bound has to be derived per render from whatever bins
  // that render actually drew — not carry a fixed set of possible values
  // the way the removed placeholder distribution's own four bar counts
  // happened to produce above. An all-zero distribution (this component's
  // own "result unavailable" case) resolves to a bound of zero, the
  // smallest multiple of the round tick — not a crash, and not the
  // previous render's own leftover bound.
  it('resolves to zero for an all-zero distribution, rather than a stale or fixed bound', () => {
    const bins = foldEquityBins(new Array(20).fill(0), 20);

    expect(combosAxisUpperBound(bins)).toBe(0);
  });
});
