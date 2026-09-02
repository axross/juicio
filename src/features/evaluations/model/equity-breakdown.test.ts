import {
  chooseBarCount,
  combosAxisUpperBound,
  COMBOS_AXIS_ROUND_TICK,
  EQUITY_BIN_COUNTS,
  equityBinWidth,
  foldEquityBins,
  PLACEHOLDER_EQUITY_DISTRIBUTION,
} from './equity-breakdown';

describe('PLACEHOLDER_EQUITY_DISTRIBUTION', () => {
  it('has 20 bins summing to a fixed total', () => {
    expect(PLACEHOLDER_EQUITY_DISTRIBUTION).toHaveLength(20);
    expect(PLACEHOLDER_EQUITY_DISTRIBUTION.reduce((sum, count) => sum + count, 0)).toBe(188);
  });
});

describe('foldEquityBins', () => {
  it('is a no-op at the input length', () => {
    expect(foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, 20)).toEqual(
      PLACEHOLDER_EQUITY_DISTRIBUTION,
    );
  });

  it.each(EQUITY_BIN_COUNTS)('folds to %i bins summing to the same total', (count) => {
    const folded = foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, count);

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

describe('equityBinWidth', () => {
  it.each(EQUITY_BIN_COUNTS)('spans the full 0-100 axis at %i bins', (count) => {
    expect(equityBinWidth(count) * count).toBe(100);
  });

  it('returns wider bins for fewer bars', () => {
    expect(equityBinWidth(8)).toBeGreaterThan(equityBinWidth(20));
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

  // the plan's own background states these exact figures: the sheet's
  // 430pt width ceiling and its side padding leave 401pt for the chart to
  // measure, and 320pt leaves 291pt. Those are the *measured* widths — the
  // canvas's own border box — and `../ui/equity-breakdown-chart/
  // equity-breakdown-chart.tsx` takes its start rule's width off each
  // before calling this function, so what reaches here is 400pt and 290pt.
  it('reaches 20 bars at the width a 430pt-wide sheet leaves the bars, and 12 at a 320pt-wide one', () => {
    expect(chooseBarCount(400)).toBe(20);
    expect(chooseBarCount(290)).toBe(12);
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
      const bins = foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, count);

      expect(combosAxisUpperBound(bins)).toBeGreaterThanOrEqual(Math.max(...bins));
    },
  );

  it.each(EQUITY_BIN_COUNTS)('rounds up to a multiple of the round tick at %i bars', (count) => {
    const bins = foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, count);

    expect(combosAxisUpperBound(bins) % COMBOS_AXIS_ROUND_TICK).toBe(0);
  });

  // pinned against the placeholder distribution's own known maxima at
  // each bar count, so folding bins can never silently push a bar past a
  // chart whose top this test failed to notice moved.
  it("matches the placeholder distribution's own upper bound at every bar count", () => {
    expect(combosAxisUpperBound(foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, 20))).toBe(20);
    expect(combosAxisUpperBound(foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, 16))).toBe(40);
    expect(combosAxisUpperBound(foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, 12))).toBe(40);
    expect(combosAxisUpperBound(foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, 8))).toBe(60);
  });
});
