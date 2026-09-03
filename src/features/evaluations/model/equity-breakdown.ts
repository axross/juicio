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
 * whole of it: which tier a phone lands on is an acceptance criterion
 * issue #102 states, while this figure is a legibility heuristic one
 * rule's width does not decide, so the margin is spent on the criterion.
 *
 * Bars carry no touch target of their own — this is a visual-legibility
 * floor, not an accessibility one, so it is not derived from this
 * project's 44pt touch-target floor the way an earlier revision of this
 * plan's own 13pt guess was.
 */
export const MINIMUM_BAR_PITCH = 20;

/**
 * the widest count in `EQUITY_BIN_COUNTS` whose own per-bar pitch
 * (`width / count`) still clears `MINIMUM_BAR_PITCH`, falling back through
 * the narrower tiers — `chooseBarCount(width)` reads a bar's own pitch,
 * never a device breakpoint, exactly as issue #102's plan asks: the widest
 * supported phone's own 430pt width and the sheet's side padding mean the
 * chart's actual drawing width is not a pure function of device width
 * alone, so this
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

/**
 * the round tick `combosAxisUpperBound` below rounds up to — an
 * implementer choice, not a figure issue #102's plan states: the plan says
 * only that the bound is "rounded up to a round tick," not what counts as
 * one. 10 keeps every axis label (`0`, `20`, `40`, `60`, at this module's
 * own four bar counts — see `combosAxisUpperBound`'s own doc comment) a
 * round number without needing a tick any coarser. Changing it also changes
 * which bound the combos axis's top label can land on, and that bound has
 * to already be a tick Victory Native's underlying d3 scale actually
 * produces — see `combosAxisLabelFormatter`'s own doc comment
 * (`../ui/equity-breakdown-chart/equity-breakdown-chart.tsx`).
 */
export const COMBOS_AXIS_ROUND_TICK = 10;

/**
 * the Equity Breakdown chart's own combination-count axis upper bound, for
 * a chart drawing `counts` (`foldEquityBins`'s own output, at whichever bar
 * count `chooseBarCount` resolved to): the largest entry in `counts`,
 * rounded up to the next multiple of `COMBOS_AXIS_ROUND_TICK` — always at
 * least that largest entry, so no bar is ever drawn taller than the axis
 * that draws it, and exactly that entry only when it already lands on a
 * round tick (20 bars' own case below).
 *
 * **This is a placeholder rule, standing in for a decision issue #102's own
 * Open Questions section records as unsettled** — what the axis's upper
 * bound should be once the equity engine ([#103](https://github.com/axross/juicio/issues/103))
 * makes each player's distribution different from every other player's.
 * Deriving the bound from the bins actually drawn is what keeps that
 * decision from mattering yet: every player is drawn from the same
 * `PLACEHOLDER_EQUITY_DISTRIBUTION`, so this already produces one bound
 * shared by every chart on screen, which is the direction (not yet the
 * mechanism) the plan's own Open Questions section records.
 *
 * At `PLACEHOLDER_EQUITY_DISTRIBUTION`'s own four bar counts this resolves
 * to 20 (20 bars, `foldEquityBins`'s own no-op fold, whose largest bin is
 * already 20), 40 (16 and 12 bars alike, both folding to a largest bin of
 * 38), and 60 (8 bars, largest bin 54) — see this file's own tests. Folding
 * to fewer, wider bins concentrates more of the same fixed total into each
 * one, which is exactly why a fixed axis top (this module's own previous
 * shape) cannot hold across every bar count `chooseBarCount` can return.
 */
export function combosAxisUpperBound(counts: readonly number[]): number {
  const max = Math.max(...counts);
  return Math.ceil(max / COMBOS_AXIS_ROUND_TICK) * COMBOS_AXIS_ROUND_TICK;
}
