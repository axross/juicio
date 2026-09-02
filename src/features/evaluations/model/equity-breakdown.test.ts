import {
  chooseBarCount,
  EQUITY_BIN_COUNTS,
  equityBinWidth,
  foldEquityBins,
  MINIMUM_BAR_PITCH,
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
  it('chooses the widest count whose pitch clears MINIMUM_BAR_PITCH', () => {
    expect(chooseBarCount(20 * MINIMUM_BAR_PITCH)).toBe(20);
    expect(chooseBarCount(16 * MINIMUM_BAR_PITCH)).toBe(16);
    expect(chooseBarCount(12 * MINIMUM_BAR_PITCH)).toBe(12);
    expect(chooseBarCount(8 * MINIMUM_BAR_PITCH)).toBe(8);
  });

  it('falls back to the next-narrower tier just below a boundary', () => {
    expect(chooseBarCount(20 * MINIMUM_BAR_PITCH - 1)).toBe(16);
    expect(chooseBarCount(16 * MINIMUM_BAR_PITCH - 1)).toBe(12);
    expect(chooseBarCount(12 * MINIMUM_BAR_PITCH - 1)).toBe(8);
  });

  it('never returns fewer than the narrowest tier, even below its own floor', () => {
    expect(chooseBarCount(8 * MINIMUM_BAR_PITCH - 1)).toBe(8);
    expect(chooseBarCount(0)).toBe(8);
  });
});
