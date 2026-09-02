import {
  chooseBarCount,
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
  // 430pt width ceiling and its side padding leave 401pt of drawing width,
  // and 320pt leaves 291pt — the widths a widest and a narrowest supported
  // phone actually hand this chart.
  it('reaches 20 bars at the drawing width a 430pt-wide sheet leaves, and 12 at a 320pt-wide one', () => {
    expect(chooseBarCount(401)).toBe(20);
    expect(chooseBarCount(291)).toBe(12);
  });

  it('falls back to 8 bars for a width below the narrowest tier this module defines', () => {
    expect(chooseBarCount(159)).toBe(8);
    expect(chooseBarCount(0)).toBe(8);
  });
});
