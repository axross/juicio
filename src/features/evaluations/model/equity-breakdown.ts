/**
 * the Equity Breakdown sheet's histogram (docs/specs/equity-analysis.md,
 * issue #102): the placeholder distribution every player's chart draws
 * until the equity engine exists ([#103](https://github.com/axross/juicio/issues/103)),
 * and the pure arithmetic that folds it down to fewer, wider bins and picks
 * how many bins fit the sheet's own measured drawing width. No I/O, no
 * React, no Skia — `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx`
 * is the only caller, and it hands this module's output straight to
 * Victory Native.
 *
 * **the distribution is one fixed placeholder, identical for every
 * player** — the maintainer's own settled decision (issue #102's plan): the
 * number of card pairs in a range says nothing about their equity without
 * the engine, and a derived-looking shape would read as a real result. It
 * is a bell-ish curve over 20 equally-wide bins spanning the equity axis
 * 0–100, summing to 188 — a round total with no significance beyond
 * summing correctly at every fold.
 */
export const PLACEHOLDER_EQUITY_DISTRIBUTION: readonly number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

/**
 * the bar counts the chart ever draws, widest first — every other export
 * in this module is typed against this exact tuple, so a count outside it
 * is a type error rather than a silently-accepted value nothing folds
 * correctly for. `PLACEHOLDER_EQUITY_DISTRIBUTION`'s own 20 bins is not a
 * fifth, wider tier: it is `EQUITY_BIN_COUNTS[0]`, the input `foldEquityBins`
 * below takes, not a count `chooseBarCount` can ever choose past.
 */
export const EQUITY_BIN_COUNTS = [20, 16, 12, 8] as const;

export type EquityBinCount = (typeof EQUITY_BIN_COUNTS)[number];

/**
 * folds `bins` — always `PLACEHOLDER_EQUITY_DISTRIBUTION`'s own 20 entries,
 * in this module's real callers — down to `count` entries by summing each
 * run of `bins.length / count` adjacent values, left to right. The result
 * always sums to the same total as `bins` itself: folding narrows the bins
 * (wider equity ranges, same 0–100 axis — see `equityBinWidth` below), it
 * never drops a combo. `count === bins.length` (20 in, 20 out) is a no-op
 * fold, kept rather than special-cased, since `bins.length / 20 === 1` and
 * every one-element run sums to itself.
 *
 * `bins.length` need not divide evenly by `count` — 20 (this module's own
 * input length) is not a multiple of 16 or 12, only of 20, 10, 5, 4, 2, and
 * 1 — so this does not merge fixed-size runs of adjacent entries. It merges
 * by **position** instead, the same even-partition rule a pixel-perfect
 * canvas resize needs: an uneven fold (20 into 16, say) still lands exactly
 * bin `i` of the output collects every input bin whose own index falls in
 * `[floor(i * bins.length / count), floor((i + 1) * bins.length / count))`,
 * the same even-partition rule `Array.prototype` has no built-in for but a
 * pixel-perfect canvas resize always needs. This keeps every output bin's
 * own width in the *original* 20-bin units within one of the other bins',
 * rather than a handful of oversized bins from truncating division.
 */
export function foldEquityBins(bins: readonly number[], count: EquityBinCount): readonly number[] {
  const folded: number[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * bins.length) / count);
    const end = Math.floor(((i + 1) * bins.length) / count);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += bins[j];
    }
    folded.push(sum);
  }
  return folded;
}

/**
 * one bin's own width along the fixed 0–100 equity axis, at a given bar
 * count — the axis itself never changes range or moves, only how finely
 * `foldEquityBins` above divides it. `100 / count`, not `100 / (count -
 * 1)`: a bin is a *span*, not a tick, and `count` spans always cover `[0,
 * 100]` exactly (`count * (100 / count) === 100`).
 */
export function equityBinWidth(count: EquityBinCount): number {
  return 100 / count;
}

/**
 * the smallest per-bar pitch (in the same unit as the width
 * `chooseBarCount` below is handed — this project's density-independent
 * `pt`) this project treats as legible: a bar narrower than this reads as a
 * hairline rather than a distinguishable column. Not this module's own
 * call — issue #102's plan states this figure directly ("a legible floor
 * of 20pt"), so `chooseBarCount` needs twenty times it, per tier, before
 * that tier is selected: 400pt for 20 bars, 320pt for 16, 240pt for 12.
 * The sheet's own 430pt width ceiling and its side padding leave between
 * 291pt and 401pt of drawing width on a phone this app supports — inside
 * the 320-to-400pt band, so **20, 16, and 12 are the tiers a phone actually
 * reaches; 8 is what this floor answers for a drawing area narrower than
 * any supported phone leaves** (a split-screen or a future narrower host),
 * not a phone layout. Bars carry no touch target of their own — this is a
 * visual-legibility floor, not an accessibility one, so it is not derived
 * from this project's 44pt touch-target floor the way an earlier revision
 * of this plan's own 13pt guess was.
 */
export const MINIMUM_BAR_PITCH = 20;

/**
 * the widest count in `EQUITY_BIN_COUNTS` whose own per-bar pitch
 * (`width / count`) still clears `MINIMUM_BAR_PITCH`, falling back through
 * the narrower tiers — `chooseBarCount(width)` reads a bar's own pitch,
 * never a device breakpoint, exactly as issue #102's plan asks: the sheet's
 * own 430pt width ceiling and its side padding mean the chart's actual
 * drawing width is not a pure function of device width alone, so this
 * function takes whatever `../ui/equity-breakdown-chart/
 * equity-breakdown-chart.tsx` measures off its own `onLayout` instead.
 *
 * Never returns fewer than `EQUITY_BIN_COUNTS`'s own narrowest tier (8):
 * there is no fifth, narrower tier this module defines, so a width below
 * even that floor still draws 8 bars, at whatever pitch that leaves — a
 * chart that refused to draw at all below some width has nothing this
 * plan asks for to fall back to instead.
 */
export function chooseBarCount(width: number): EquityBinCount {
  for (const count of EQUITY_BIN_COUNTS) {
    if (width / count >= MINIMUM_BAR_PITCH) {
      return count;
    }
  }
  return EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];
}
