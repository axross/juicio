import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { matchFont } from '@shopify/react-native-skia';
import { Bar, CartesianChart } from 'victory-native';

import { barColors } from '../../model/band-color';
import {
  chooseBarCount,
  combosAxisUpperBound,
  EQUITY_BIN_COUNTS,
  equityBinWidth,
  foldEquityBins,
  PLACEHOLDER_EQUITY_DISTRIBUTION,
} from '../../model/equity-breakdown';
import { barLayers } from './bar-layers';

// no design-file measurement of the chart's own height alone — this is
// this project's own pick of how much vertical room the canvas gets
// inside the sheet, the same "implementer's own choice, not a design
// measurement" status `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
// own dismiss thresholds carry. Independent of the combos axis's own
// upper bound (`combosAxisUpperBound` below): Victory Native scales
// whatever `domain.y` it is handed to fill the plotted area, so a taller
// axis draws shorter bars at the same height rather than needing more of
// it.
//
// 220, not the 180 this canvas was before: the tick labels and axis names
// are drawn *inside* the canvas now rather than laid out above and below
// it, so the canvas has to carry roughly 40pt of axis furniture — one
// label line reserved above the plot (`CHART_PADDING` below) and, under
// it, the equity axis's own label line plus its name — that it did not
// carry before. Growing the canvas by about that much keeps the plotted
// area itself near the 180pt it drew at, which is what a reader actually
// compares against the design.
const CHART_HEIGHT = 220;

/**
 * the Equity Breakdown sheet's own bar chart (docs/specs/
 * equity-analysis.md, issue #102): the placeholder distribution
 * (`../../model/equity-breakdown.ts`), folded to whatever bar count this
 * component's own measured drawing width supports, drawn through Victory
 * Native on the Skia runtime it requires (`@shopify/react-native-skia`).
 *
 * **all the real logic lives in plain, unit-tested modules** —
 * `../../model/equity-breakdown.ts`'s `chooseBarCount`/`foldEquityBins` and
 * `../../model/band-color.ts`'s `barColors` — because Skia and Victory
 * Native are not exercisable under this project's Jest setup
 * (docs/conventions/testing.md). This component is asserted on the
 * configuration it hands those two libraries and on its own accessibility
 * label, and on nothing either library draws from that configuration; both
 * are mocked in `equity-breakdown-chart.test.tsx`.
 *
 * **measures its own width via `onLayout`, then chooses the bar count from
 * that measurement as it arrives** — issue #102's own plan is explicit that
 * the sheet's `PANEL_MAX_WIDTH` and its own side padding mean the chart's
 * actual drawing width is not a pure function of device width alone. What
 * `onLayout` reports is the canvas's **border box**: React Native's own
 * `LayoutMetrics.h` documents a `frame` as covering border, padding and
 * content, and `BaseViewEventEmitter::onLayout` dispatches that frame, not
 * the content one. The strip the bars actually get is narrower still — the
 * combos axis's own labels and name sit outside the plot, reserving their
 * width plus an offset off its left edge, tens of points rather than one
 * — and the count is chosen from the measurement anyway, deliberately.
 * At the widest sheet this app supports the measurement is 401pt, one
 * point clear of the 400pt the 20-bar tier needs. Subtracting either the
 * label gutter or the bounding rule first would drop that tier: the gutter
 * outright, and the rule by putting the tier exactly on its threshold,
 * where a measurement arriving as 400.9 rather than 401 — Android's
 * pixel-grid rounding of a 430dp panel less two 14.5dp paddings lands
 * either side of the integer — would silently drop the widest phone to 16
 * bars. Which tier a phone lands on is an acceptance criterion issue #102
 * states, while `MINIMUM_BAR_PITCH` is a legibility heuristic neither a
 * rule's width nor a label's decides, so the headroom is spent on the
 * criterion. **A later pass must not "correct" this by subtracting either
 * of them.**
 *
 * Before the first layout pass reports a real width, no chart is drawn at
 * all: the canvas below renders `null` while `width` is still `0`, and
 * only the accessibility label is resolved in that state, from the
 * narrowest tier `../../model/equity-breakdown.ts` ever chooses
 * (`EQUITY_BIN_COUNTS`'s own last entry). Drawing nothing for that one
 * frame beats drawing at a count the real measurement is about to
 * contradict.
 *
 * **twenty flat colours, never a gradient fill** — `barColors` resolves
 * one solid colour per bar from `theme.bands`
 * (`../../../../core/theme/tokens.ts`), and each bar below is its own
 * Victory Native `Bar` mark: `bar-layers.ts`'s `barLayers` pairs each point
 * in the `points.count` array `CartesianChart` hands `children` with its own
 * single colour, so one flat colour per bar means one `Bar` layer per bar,
 * given exactly that bar's own point — never the full array, and never a
 * `Bar` painted from a multi-stop gradient. `bar-layers.ts`'s own doc
 * comment records why the array is now sliced to one point per layer
 * (paired with an explicit `barCount`) rather than zeroed to hide every
 * sibling: zeroing a point's `y` to `0` does not hide it, since `y` is
 * already a pixel coordinate by the time `children` receives it — it draws
 * a full-height bar instead.
 *
 * **one labelled element, not one stop per bar** — the canvas container
 * below carries `accessible`/`accessibilityLabel` naming what the chart
 * shows, how many bars it drew, and what each axis runs from and to (issue
 * #102's own Accessibility section). Everything the chart says is now
 * painted by Skia rather than laid out as text, so that one label is the
 * only thing about this chart a screen reader can reach at all: it has to
 * carry what the axis labels used to say by themselves.
 *
 * **the axis furniture is Victory Native's own, not assembled around it**
 * — the bounding rules come from `frame`, the tick labels and axis names
 * from `xAxis`/`yAxis`, and every colour and size they take is passed in
 * from this project's tokens rather than left at the library's defaults.
 * Three details of that are worth knowing before editing any of it, all
 * read off `node_modules/victory-native/src/` at 42.0.1:
 *
 * - **a y axis renders whether or not it is asked for.**
 *   `useBuildChartAxis` falls back to `[{ ...YAxisDefaults, yKeys }]` when
 *   no `yAxis` prop is given, and `CartesianChart`'s own render gate reads
 *   that fallback as an axis to draw — five hairline gridlines across the
 *   plot in the library's own `hsla(0, 0%, 0%, 0.25)`. Passing `yAxis`
 *   with `lineWidth: 0` is what stops it. Removing that prop does not
 *   restore a plain chart; it restores the gridlines.
 * - **`lineWidth`/`lineColor` on an axis draw gridlines spanning the plot,
 *   not tick marks** (`XAxis.tsx`, `YAxis.tsx` draw a `Line` from one
 *   plot edge to the other). This library has no tick marks at all, so
 *   both axes run at `lineWidth: 0` and the two rules come from `frame`
 *   alone.
 * - **`frame` needs all four side widths given explicitly.** `Frame.tsx`
 *   decides whether to draw a side from a copy of `lineWidth` defaulted to
 *   `StyleSheet.hairlineWidth`, but passes the *raw* prop as that side's
 *   `strokeWidth` — so an omitted side is drawn at Skia's own default
 *   stroke rather than omitted.
 *
 * **the tick labels need an `SkFont`, and no font file is added to get
 * one** — `matchFont` (`@shopify/react-native-skia`) defaults its font
 * manager to `Skia.FontMgr.System()` and returns synchronously, so the
 * platform's own system face is reachable at render with no asset, no
 * asynchronous load, and no first frame without labels. It is built from
 * `theme.typography.chartAxisLabel`'s own size rather than a literal, so
 * this project's type scale stays the single source of that number even
 * though a Skia font takes a size rather than a text style; the line
 * height in that role reaches the legend's ordinary text, not these.
 * `matchFont` reaches native code, so it is memoised on that size rather
 * than rebuilt every render.
 *
 * **each axis keeps only its two ends, and the formatters are what blank
 * the rest** — not the tick count, which still resolves the five ticks
 * whose positions the plot is laid out against. `formatEquityAxisLabel`
 * and `combosAxisLabelFormatter` below return `''` for every interior
 * tick, and a zero-width label is one Victory Native draws nothing for
 * (`getTextLayout` measures the empty string at width 0; `XAxis`/`YAxis`
 * both gate a label on a non-zero width).
 */
export function EquityBreakdownChart({
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & { testID?: string }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');

  const [width, setWidth] = useState(0);

  // `theme.bands`'s own shape (`../../../../core/theme/tokens.ts`'s
  // `buildBands`) pairs each band with both its `solid` fill and its `text`
  // counterpart; `barColors` wants only the four `solid` anchors, so those
  // are the only four scalars this component reads off `theme` for the
  // bars at all. Reading them here, outside the `useMemo` below, still goes
  // through `useUnistyles`'s own proxy `get` trap and registers this
  // component's `UnistyleDependency.Theme` subscription exactly as reading
  // them inside the memo would have (`node_modules/react-native-unistyles/
  // src/core/useProxifiedUnistyles/useProxifiedUnistyles.ts`'s `get`
  // handler adds the dependency on every property access, regardless of
  // which caller made it) — so pulling them out here costs the theme
  // subscription nothing.
  const trashColor = theme.bands.trash.solid;
  const marginalColor = theme.bands.marginal.solid;
  const valueColor = theme.bands.value.solid;
  const nutsColor = theme.bands.nuts.solid;

  // the four scalars the axis furniture takes, read off `theme` the same
  // way and for the same reason: every one of them is a plain number or
  // hex string, so the memos below can depend on them by value.
  //
  // `border.neutral.unselectedControl`, not any step of the neutral border
  // ramp: the rules stand on the sheet panel's `background.neutral.app`
  // ground, where every one of those steps falls under the WCAG 2 AA 3:1
  // non-text floor a rule is held to, while `unselectedControl` — the role
  // this project already added for exactly that failure — clears it.
  // docs/conventions/design-system.md's "Brand Accent and Unselected-
  // Control-Border Roles" section carries the measurements and settles
  // this, and `../../../../core/theme/tokens.test.ts` asserts them; the
  // maintainer's own ask was that the axes be easy to make out on a real
  // device, which points the same way. do not "normalise" this back to a
  // ramp step.
  const axisRuleColor = theme.colors.border.neutral.unselectedControl;
  const axisRuleWidth = theme.borderWidth.base;
  const axisLabelColor = theme.colors.text.neutral.low;
  const axisLabelFontSize = theme.typography.chartAxisLabel.fontSize;

  const equityAxisName = t('equityBreakdown.chart.equityAxisLabel');
  const combosAxisName = t('equityBreakdown.chart.combosAxisLabel');

  // `matchFont` reaches native code through `Skia.FontMgr.System()`, so it
  // is built once per size rather than on every render. It is reached only
  // from here, where `useUnistyles` has already resolved the theme the
  // size comes from.
  const axisFont = useMemo(() => matchFont({ fontSize: axisLabelFontSize }), [axisLabelFontSize]);

  // issue #102's own non-functional requirements: "the chart re-renders
  // only when the sheet's own width or open player changes; scrolling the
  // list behind the sheet must not recompute it." this component takes no
  // `player` prop at all — `../equity-breakdown-sheet/
  // equity-breakdown-sheet.tsx` is what owns that, and every player draws
  // the identical placeholder distribution regardless
  // (`../../model/equity-breakdown.ts`'s own doc comment) — so `width` and
  // the four band anchors above are the only inputs this whole derivation
  // actually reads.
  //
  // The dependency array below names those four anchor **strings**, not
  // `theme` itself, and that difference is load-bearing rather than
  // stylistic: `useUnistyles()`'s returned `theme` is a `Proxy` that
  // `useProxifiedUnistyles` constructs fresh on every call — unconditionally,
  // whether or not the underlying theme actually changed
  // (`useProxifiedUnistyles.ts`'s `const proxifiedTheme = new Proxy(theme,
  // { ... })`, itself rebuilt every render because the `get` trap needs a
  // closure over that render's own `dependencies` set). A dependency array
  // holding `theme` therefore never has two equal values across renders —
  // `Object.is` compares the previous render's `Proxy` wrapper against this
  // render's new one, never the wrapped theme underneath — so a `useMemo`
  // depending on `theme` recomputes on every render regardless of whether
  // the theme changed, silently discarding the whole point of memoizing.
  // The four anchors are plain hex strings (`theme/tokens.ts`'s `buildBands`),
  // so `Object.is` compares them by value: unchanged strings compare equal
  // across renders, and the previous `barCount`/`colors`/`data`/
  // `combosAxisMax` are genuinely reused whenever this component's own
  // function body re-runs for a reason that changes neither `width` nor the
  // theme — its parent sheet re-rendering because a state change elsewhere
  // in `../analyze-screen/analyze-screen.tsx` re-rendered the tree, such as
  // the list scrolling behind an open sheet — rather than calling
  // `barColors`, `foldEquityBins`, and `combosAxisUpperBound` again on every
  // such render.
  const { barCount, colors, data, combosAxisMax } = useMemo(() => {
    // `width` is the canvas's border box — wider than the strip the bars
    // are drawn in, by both the bounding rule and the combos axis's own
    // label gutter — and the count is chosen from it as measured, so the
    // widest supported phone keeps a point of headroom above the 20-bar
    // threshold instead of falling below it. See this component's own doc
    // comment; do not subtract either here.
    const barCount =
      width > 0 ? chooseBarCount(width) : EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];
    const counts = foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount);
    const binWidth = equityBinWidth(barCount);
    const colors = barColors(barCount, {
      trash: trashColor,
      marginal: marginalColor,
      value: valueColor,
      nuts: nutsColor,
    });
    // each bin's own **centre**, not its left edge: a bin spans
    // `[index * binWidth, (index + 1) * binWidth)` on the equity axis
    // (`equityBinWidth`'s own doc comment, `../../model/equity-breakdown.ts`),
    // but Victory Native's `Bar` mark centres a bar on its own point —
    // `getVerticalBarRect` in `node_modules/victory-native/src/cartesian/
    // utils/getVerticalBarRect.ts` sets the drawn rect's left edge to
    // `point.x - barThickness / 2`, so `point.x` is read as the bar's
    // middle, never its edge. Handing it `index * binWidth` (this
    // component's own previous shape) drew every bar half a bin to the
    // left of the span it represents: bar 0 straddled equity 0 rather than
    // sitting inside `[0, binWidth)`, and the last bar left a gap the size
    // of one bin before the axis's own `100` end. `(index + 0.5) *
    // binWidth` is that span's own centre, so the bar Victory Native draws
    // around it lands back on the span it is meant to represent — do not
    // "correct" this back to the bin's edge without re-reading that file.
    const data = counts.map((count, index) => ({ x: (index + 0.5) * binWidth, count }));
    // derived from `counts` above, not a fixed figure — see
    // `combosAxisUpperBound`'s own doc comment
    // (`../../model/equity-breakdown.ts`) for why a fixed axis top cannot
    // hold across every bar count `chooseBarCount` can resolve to.
    const combosAxisMax = combosAxisUpperBound(counts);

    return { barCount, colors, data, combosAxisMax };
    // `width` and the four anchor strings are the only reactive values
    // this callback reads — `chooseBarCount`, `foldEquityBins`,
    // `barColors`, and `combosAxisUpperBound` are module-level pure
    // functions, not values a dependency array needs to name.
  }, [width, trashColor, marginalColor, valueColor, nutsColor]);

  // memoised for the same reason the derivation above is, and additionally
  // because `useBuildChartAxis` inside Victory Native memoises on these
  // objects' own identities: handing it a freshly-built `xAxis`/`yAxis`/
  // `frame` every render would rebuild the whole normalised axis set on
  // every render of the tree behind the sheet.
  const { padding, frame, xAxis, yAxis } = useMemo(
    () => ({
      // one label line of clearance above the plot. Victory Native draws a
      // y tick label centred on its own tick and drops it when it would
      // overflow the canvas's top edge (`YAxis.tsx`'s
      // `canFitLabelContent`), and the topmost tick sits exactly on the
      // plot's top edge — so without this the combos axis's own upper
      // bound, the one label issue #102 requires it to end at, is the one
      // label that never renders.
      padding: { top: axisLabelFontSize, right: 0, bottom: 0, left: 0 },
      frame: {
        lineColor: axisRuleColor,
        // all four sides, deliberately — see this component's own doc
        // comment on `Frame.tsx`: an omitted side is drawn, not omitted.
        // The top and right edges stay open, since a full box would read
        // as a frame around the chart rather than as two axes.
        lineWidth: { top: 0, right: 0, bottom: axisRuleWidth, left: axisRuleWidth },
      },
      xAxis: {
        font: axisFont,
        labelColor: axisLabelColor,
        // gridlines, not tick marks — off entirely.
        lineWidth: 0,
        formatXLabel: formatEquityAxisLabel,
        title: { text: equityAxisName, color: axisLabelColor, position: 'end' as const },
      },
      yAxis: [
        {
          font: axisFont,
          labelColor: axisLabelColor,
          lineWidth: 0,
          formatYLabel: combosAxisLabelFormatter(combosAxisMax),
          title: { text: combosAxisName, color: axisLabelColor, position: 'start' as const },
        },
      ],
    }),
    [
      axisFont,
      axisLabelColor,
      axisLabelFontSize,
      axisRuleColor,
      axisRuleWidth,
      combosAxisMax,
      combosAxisName,
      equityAxisName,
    ],
  );

  const accessibilityLabel = t('equityBreakdown.chart.accessibilityLabel', {
    count: barCount,
    max: combosAxisMax,
  });

  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View
        style={styles.canvas}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={accessibilityLabel}
        testID={testID ? 'canvas' : undefined}
      >
        {width > 0 ? (
          <CartesianChart
            data={data}
            xKey="x"
            yKeys={COMBOS_Y_KEYS}
            domain={{ x: [0, 100], y: [0, combosAxisMax] }}
            padding={padding}
            frame={frame}
            xAxis={xAxis}
            yAxis={yAxis}
          >
            {({ points, chartBounds }) =>
              barLayers(points.count, colors).map((layer, index) => (
                <Bar
                  key={index}
                  points={layer.points}
                  chartBounds={chartBounds}
                  color={layer.color}
                  // the real bar count, not this layer's own one-element
                  // `points` array's length — see `bar-layers.ts`'s doc
                  // comment for why both are needed together.
                  barCount={points.count.length}
                />
              ))
            }
          </CartesianChart>
        ) : null}
      </View>
    </View>
  );
}

/** module-level so `CartesianChart` is handed the same array identity on
 * every render — `useBuildChartAxis` memoises on it. */
const COMBOS_Y_KEYS: 'count'[] = ['count'];

/** the equity axis is labelled at its two ends only, `0` and `100`; every
 * interior tick formats to the empty string, which Victory Native measures
 * at zero width and draws nothing for. */
function formatEquityAxisLabel(value: number): string {
  return value === 0 || value === 100 ? String(value) : '';
}

/** the combos axis's own two ends, the second of which is not fixed:
 * `max` is `combosAxisUpperBound` for the bins this render actually drew
 * (`../../model/equity-breakdown.ts`), so the label the axis ends at is
 * always the bound the axis was given. */
function combosAxisLabelFormatter(max: number): (value: number) => string {
  return (value) => (value === 0 || value === max ? String(value) : '');
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  canvas: {
    width: '100%',
    height: CHART_HEIGHT,
  },
});
