/**
 * `bar-chart.tsx`'s own pixel-geometry math: mapping a bar's
 * value and index, and an axis label's own text width, to a rectangle or a
 * position on the canvas. Kept free of both Skia and Reanimated — this
 * module hands back plain numbers, never a drawable node or a shared value —
 * so it is unit-testable directly, without either library mocked.
 *
 * this project computes this geometry itself rather than reading it off a
 * charting library's own internals — see
 * docs/decisions/2026-09-04-drop-victory-native-for-a-hand-rolled-skia-bar-chart.md
 * for why. This module lives beside `bar-chart.tsx`, the one
 * component it is coupled to, per `docs/conventions/directory-structure.md`'s
 * MUST rule that a module coupled to exactly one component lives beside it;
 * a separate module rather than inlined into `bar-chart.tsx` itself is this
 * project's own implementer choice, made so the geometry can be asserted
 * directly rather than only through a mocked Skia boundary.
 */

/** the four frame-side stroke widths and their shared colour — one flat
 * colour for every side, matching this chart's own single
 * `border.neutral.unselectedControl` rule (`docs/specs/equity-analysis.md`).
 * A side at `0` is not drawn at all (`bar-chart.tsx`'s own render); passing
 * all four widths explicitly, rather than three defaulted to `0`, is the
 * caller's own choice to make plain which sides it wants, not a rule this
 * module enforces. */
export type BarChartFrame = {
  readonly color: string;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

/** the rectangle, in canvas pixels, the bars are actually drawn inside —
 * already net of the frame's own stroke widths and of the space reserved
 * for every axis label and title this primitive draws. */
export type PlotArea = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** the gap, in canvas pixels, this primitive leaves between a drawn rule and
 * the label text next to it, and between two stacked label lines (a tick
 * label and the title below it). Not a design-file measurement — this
 * primitive's own pick, the same "no design-file source, this project's own
 * pick" status `equity-breakdown-chart.tsx`'s own `CHART_HEIGHT` already
 * carries — small enough not to visibly steal room from the bars, large
 * enough that a label never touches the rule it annotates. */
export const AXIS_LABEL_GAP = 4;

/** the fraction of each bar's own evenly-divided slot width it actually
 * draws at, centred within that slot — the remainder is the gap between
 * neighbouring bars. Not a design-file measurement: this primitive's own
 * pick, confirmed on-device rather than derived from any existing
 * measurement. */
export const BAR_WIDTH_RATIO = 0.72;

/**
 * the rectangle bars are drawn inside, given the canvas's own full pixel
 * size, one shared line height (`SkFont.getSize()`, the same figure for
 * every label this primitive draws, tick or title), the frame's own four
 * stroke widths, and the widest of the two y-axis tick labels' own measured
 * text width (`SkFont.measureText(text).width`) — the space the y-axis's
 * own tick-label column needs, measured by the caller since only it holds
 * the loaded `SkFont`.
 *
 * Reserves, beyond the frame's own stroke widths, two full line heights on
 * both the top and the bottom of the plot — one row for that side's own two
 * end labels (or, above the plot, the y-axis's own end label alone, since
 * its other end label sits below the plot instead) and one more for that
 * side's own title, so neither row can ever overlap the other. Below the
 * plot (`bottom`): one row for the x-axis's own two end labels, and one
 * more below that for the x-axis's own title. Above it (`top`): one row for
 * the y-axis's own top end label — which would otherwise sit with its own
 * text centred exactly on the plot's top edge and half-clipped there —
 * and one more above that for the y-axis's own title. To the left (`left`), the y-axis's own tick-label column width plus
 * one gap, ahead of the frame's own left stroke.
 */
export function computePlotArea(params: {
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  readonly yAxisLabelWidth: number;
  readonly frame: BarChartFrame;
}): PlotArea {
  const { width, height, lineHeight, yAxisLabelWidth, frame } = params;
  const reservedRowsHeight = 2 * (lineHeight + AXIS_LABEL_GAP);
  return {
    left: frame.left + yAxisLabelWidth + AXIS_LABEL_GAP,
    right: width - frame.right,
    top: frame.top + reservedRowsHeight,
    bottom: height - frame.bottom - reservedRowsHeight,
  };
}

/** one bar's own evenly-divided slot width, given how many bars share the
 * plot area's own width — every bar takes the same slot, regardless of its
 * own value: bars are spaced evenly by index, not by value. */
export function barSlotWidth(barCount: number, plotArea: PlotArea): number {
  if (barCount <= 0) {
    return 0;
  }
  return (plotArea.right - plotArea.left) / barCount;
}

/** a bar's own drawn width — `BAR_WIDTH_RATIO` of its slot, the rest left as
 * the gap to its neighbours. */
export function barWidth(barCount: number, plotArea: PlotArea): number {
  return barSlotWidth(barCount, plotArea) * BAR_WIDTH_RATIO;
}

/** a bar's own left edge — its slot's own left edge, plus half of whatever
 * width `BAR_WIDTH_RATIO` leaves unused in that slot, so the bar sits
 * centred within it rather than flush against either neighbour. */
export function barX(index: number, barCount: number, plotArea: PlotArea): number {
  const slotWidth = barSlotWidth(barCount, plotArea);
  const drawnWidth = slotWidth * BAR_WIDTH_RATIO;
  return plotArea.left + index * slotWidth + (slotWidth - drawnWidth) / 2;
}

/** a bar's own drawn height, in pixels — `value`'s own fraction of
 * `valueAxisUpperBound`, against the plot area's own full height. Clamped
 * into `[0, 1]` before scaling, so a `value` this module is never actually
 * handed one for (every real caller's own `value` already sits inside
 * `[0, valueAxisUpperBound]`) still cannot draw a bar taller than the plot
 * or shorter than the baseline. `valueAxisUpperBound <= 0` (every bar at
 * zero — the practically-unreachable "no result" case
 * `equity-breakdown-chart.tsx`'s own doc comment describes) resolves to `0`
 * rather than dividing by it.
 *
 * marked `'worklet'` — like `@/core/motion/tokens.ts`'s `motionSpring` and
 * its own siblings — because `bar-chart.tsx`'s own `Bar` calls this from
 * inside a `useDerivedValue` callback, which Reanimated runs on the UI
 * thread: a plain function called from there, with no directive of its
 * own, is not one Reanimated's own Babel plugin has bundled for that
 * thread to run at all. */
export function barHeightPx(
  value: number,
  valueAxisUpperBound: number,
  plotArea: PlotArea,
): number {
  'worklet';
  if (valueAxisUpperBound <= 0) {
    return 0;
  }
  const fraction = Math.min(1, Math.max(0, value / valueAxisUpperBound));
  return fraction * (plotArea.bottom - plotArea.top);
}

/** a bar's own top edge — the plot area's own bottom (its baseline, value
 * `0`) less its own drawn height, so every bar grows upward from that same
 * baseline regardless of its own value. Marked `'worklet'` for the same
 * reason `barHeightPx` above is — `bar-chart.tsx`'s own `Bar` calls this
 * from inside a `useDerivedValue` callback too. */
export function barY(value: number, valueAxisUpperBound: number, plotArea: PlotArea): number {
  'worklet';
  return plotArea.bottom - barHeightPx(value, valueAxisUpperBound, plotArea);
}
