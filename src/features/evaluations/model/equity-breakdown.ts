/**
 * the Equity Breakdown sheet's histogram (docs/specs/equity-analysis.md):
 * the pure arithmetic that folds a player's own real
 * per-card-pair equity distribution down to fewer, wider bins and picks
 * how many bins fit the sheet's own measured drawing width. No I/O, no
 * React, no Skia — `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx`
 * is the only caller, and it hands this module's output straight to
 * `../ui/equity-breakdown-chart/bar-chart.tsx`'s own bar-chart primitive.
 *
 * **the distribution itself is not this module's own concern.** the equity
 * engine computes each player's own real distribution — a count of that
 * player's own card pairs per equal-width equity slice, carried on
 * `EspadaEquityPlayerResult.distribution` (`@/modules/espada-engine/index`)
 * — and `equity-breakdown-chart.tsx` folds that distribution through the
 * exact same functions below.
 */

/**
 * the bar counts the chart ever draws, widest first — every other export
 * in this module is typed against this exact tuple, so a count outside it
 * is a type error rather than a silently-accepted value nothing folds
 * correctly for. The real per-player `distribution`'s own 20 bins
 * (`EspadaEquityPlayerResult.distribution`, `@/modules/espada-engine/
 * index`) are not a fifth, wider tier: they are `EQUITY_BIN_COUNTS[0]`,
 * the input `foldEquityBins` below takes, not a count `chooseBarCount` can
 * ever choose past.
 */
export const EQUITY_BIN_COUNTS = [20, 16, 12, 8] as const;

export type EquityBinCount = (typeof EQUITY_BIN_COUNTS)[number];

/**
 * folds `bins` — always a real per-player `distribution`'s own 20 entries
 * (`EspadaEquityPlayerResult.distribution`, `@/modules/espada-engine/
 * index`), in this module's real callers — down to `count` entries by
 * summing each
 * run of `bins.length / count` adjacent values, left to right. The result
 * always sums to the same total as `bins` itself: folding narrows the bins
 * (wider equity ranges, same 0–100 axis), it never drops a combo.
 * `count === bins.length` (20 in, 20 out) is a no-op
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
 * the smallest per-bar pitch (in the same unit as the width
 * `chooseBarCount` below is handed — this project's density-independent
 * `pt`) this project treats as legible: a bar narrower than this reads as a
 * hairline rather than a distinguishable column. Not this module's own
 * call — a legible floor of 20pt, so `chooseBarCount` needs twenty times
 * it, per tier, before
 * that tier is selected: 400pt for 20 bars, 320pt for 16, 240pt for 12.
 * The widest supported phone's own 430pt width and the sheet's side
 * padding leave between 291pt and 401pt of **measured** width on a
 * phone this app supports —
 * that is the canvas's border box, and it is what `chooseBarCount` below
 * is handed; the strip the bars are actually drawn in sits inside the
 * chart's own start rule, one point narrower, so 290pt to 400pt. Both
 * ranges fall in the 320-to-400pt band, so **20, 16, and 12 are the tiers
 * a phone actually reaches; 8 is what this floor answers for a width
 * narrower than any supported phone leaves** (a split-screen or a future
 * narrower host), not a phone layout.
 *
 * At the widest tier that measured width clears the 400pt threshold by
 * exactly one point, which leaves the pitch the bars actually get there —
 * 400pt of drawing strip across 20 bars — sitting on this floor exactly
 * rather than above it. That is the deliberate trade, and
 * `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx` records the
 * whole of it: which tier a phone lands on is a stated requirement,
 * while this figure is a legibility heuristic one
 * rule's width does not decide, so the margin is spent on the requirement.
 *
 * Bars carry no touch target of their own — this is a visual-legibility
 * floor, not an accessibility one, so it is not derived from this
 * project's 44pt touch-target floor.
 */
export const MINIMUM_BAR_PITCH = 20;

/**
 * the widest count in `EQUITY_BIN_COUNTS` whose own per-bar pitch
 * (`width / count`) still clears `MINIMUM_BAR_PITCH`, falling back through
 * the narrower tiers — `chooseBarCount(width)` reads a bar's own pitch,
 * never a device breakpoint: the widest
 * supported phone's own 430pt width and the sheet's side padding mean the
 * chart's actual drawing width is not a pure function of device width
 * alone, so this
 * function takes whatever `../ui/equity-breakdown-chart/
 * equity-breakdown-chart.tsx` measures off its own `onLayout` instead.
 *
 * Never returns fewer than `EQUITY_BIN_COUNTS`'s own narrowest tier (8):
 * there is no fifth, narrower tier this module defines, so a width below
 * even that floor still draws 8 bars, at whatever pitch that leaves — a
 * chart that refused to draw at all below some width has nothing narrower
 * to fall back to instead.
 */
export function chooseBarCount(width: number): EquityBinCount {
  for (const count of EQUITY_BIN_COUNTS) {
    if (width / count >= MINIMUM_BAR_PITCH) {
      return count;
    }
  }
  return EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];
}

/**
 * the round tick `combosAxisUpperBound` below rounds up to — an
 * implementer choice, not a fully specified figure: only that the bound is
 * rounded up to "a round tick," not what counts as
 * one. 10 keeps every axis top a round number without needing a tick any
 * coarser. Changing it only changes which number the combos axis's top
 * label reads: `../ui/equity-breakdown-chart/bar-chart.tsx`'s `BarChart`
 * draws whatever string `yAxis.endLabel` is given directly, with no
 * tick-resolution step of its own that could fail to render a bound this
 * function produces.
 */
export const COMBOS_AXIS_ROUND_TICK = 10;

/**
 * the Equity Breakdown chart's own combination-count axis upper bound, for
 * a chart drawing `counts` (`foldEquityBins`'s own output, at whichever bar
 * count `chooseBarCount` resolved to): the largest entry in `counts`,
 * rounded up to the next multiple of `COMBOS_AXIS_ROUND_TICK` — always at
 * least that largest entry, so no bar is ever drawn taller than the axis
 * that draws it, and exactly that entry only when it already lands on a
 * round tick.
 *
 * Deriving the bound from the bins actually drawn, rather than from a
 * figure fixed once for every chart, is what lets two players who differ
 * in holdings, board, or opponents draw two histograms whose bar heights —
 * and now whose axis tops — genuinely differ: each player's own real
 * `distribution` (`EspadaEquityPlayerResult.distribution`,
 * `@/modules/espada-engine/index`) drives its own bound, independent of
 * every other chart on screen.
 *
 * Folding to fewer, wider bins concentrates more of the same fixed total
 * into each one — see this file's own tests for worked examples — which is
 * why a fixed axis top cannot hold across every bar count `chooseBarCount`
 * can return, and why this bound is computed per render rather than fixed
 * once.
 */
export function combosAxisUpperBound(counts: readonly number[]): number {
  const max = Math.max(...counts);
  return Math.ceil(max / COMBOS_AXIS_ROUND_TICK) * COMBOS_AXIS_ROUND_TICK;
}
