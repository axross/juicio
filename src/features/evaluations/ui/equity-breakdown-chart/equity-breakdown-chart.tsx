import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFont } from '@shopify/react-native-skia';
import { Bar, CartesianChart } from 'victory-native';

import { barColors } from '../../model/band-color';
import {
  chooseBarCount,
  combosAxisUpperBound,
  EQUITY_BIN_COUNTS,
  equityBinWidth,
  foldEquityBins,
} from '../../model/equity-breakdown';
import { barLayers } from './bar-layers';

/**
 * the "no result" input this chart folds when `distribution` is `null` —
 * every bin at zero, the same 20-bin shape a real
 * `EspadaEquityPlayerResult.distribution` carries. Folding this through
 * the same `foldEquityBins`/`combosAxisUpperBound` pipeline every real
 * distribution goes through, rather than special-casing the derived
 * values, is what keeps this one small array the only place "no data"
 * is decided — everything downstream (`combosAxisMax`, the accessibility
 * label) falls out of it the same way it would for a real, merely-empty
 * distribution.
 */
const NO_RESULT_DISTRIBUTION: readonly number[] = new Array(EQUITY_BIN_COUNTS[0]).fill(0);

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
// label line reserved above the plot (the `padding` handed to
// `CartesianChart` below) and, under it, the equity axis's own label line
// plus its name — that it did not carry before. Growing the canvas by
// about that much keeps the plotted area itself near the 180pt it drew at,
// which is what a reader actually compares against the design.
const CHART_HEIGHT = 220;

/**
 * the Equity Breakdown sheet's own bar chart (docs/specs/
 * equity-analysis.md, issues #102 and #138): the acting player's own real
 * per-card-pair `distribution` prop, folded to whatever bar count this
 * component's own measured drawing width supports
 * (`../../model/equity-breakdown.ts`), drawn through Victory Native on the
 * Skia runtime it requires (`@shopify/react-native-skia`).
 *
 * **`distribution` is `null` only in the practically-unreachable case
 * `../equity-breakdown-sheet/equity-breakdown-sheet.tsx` already documents
 * for its own header** — the acting player removed, or a new calculation
 * restarted, while this sheet somehow stays open. That case folds
 * `NO_RESULT_DISTRIBUTION` (every bin at zero) through the exact same
 * pipeline a real distribution goes through, rather than a second code
 * path: every drawn bar's own count is `0`, so nothing is drawn, without
 * this component needing to special-case "no bars" separately from
 * "bars that happen to be short."
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
 * At the widest supported phone the measurement is 401pt, one point clear
 * of the 400pt the 20-bar tier needs. Subtracting either the label gutter
 * or the bounding rule first would drop that tier: the gutter outright,
 * and the rule by putting the tier exactly on its threshold, where a
 * measurement arriving as 400.9 rather than 401 — Android's pixel-grid
 * rounding of the widest supported phone's own 430dp width less two
 * 14.5dp paddings lands either side of the integer — would silently drop
 * the widest phone to 16 bars. Which tier a phone lands on is an
 * acceptance criterion issue #102 states, while `MINIMUM_BAR_PITCH` is a
 * legibility heuristic neither a rule's width nor a label's decides, so
 * the headroom is spent on the criterion. **A later pass must not
 * "correct" this by subtracting either of them.**
 *
 * Before the first layout pass reports a real width, no chart is drawn at
 * all: the canvas below renders `null` while `width` is still `0`, and
 * only the accessibility label is resolved in that state, from the
 * narrowest tier `../../model/equity-breakdown.ts` ever chooses
 * (`EQUITY_BIN_COUNTS`'s own last entry). Drawing nothing for that one
 * frame beats drawing at a count the real measurement is about to
 * contradict. The same render guard now also requires `axisFont` (below) to
 * be loaded — `useFont` returns `null` until its asset finishes loading, and
 * this chart draws nothing rather than a frame with no axis text for
 * exactly the same "draw nothing until ready" reason.
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
 * **the tick labels need an `SkFont`, loaded from this project's own
 * bundled asset — not asked of the platform by family name.** This chart
 * used to build that font with `matchFont({ fontSize: axisLabelFontSize })`
 * (no `fontFamily`), which defaults to the literal family name `"System"`
 * and resolves it through `Skia.FontMgr.System()`. That path shipped
 * (rounds 1-2 of issue #188) and passed every mocked Jest test and every
 * source-level read of Victory Native this project could do — but the
 * maintainer's own on-device test of that build found **both** axes'
 * text completely invisible on a real Android device, not only the equity
 * axis's captions issue #188 originally reported. Reading
 * `node_modules/@shopify/react-native-skia@2.6.2`'s own source confirmed
 * why: iOS resolves the literal string `"System"` through a native alias
 * (`.AppleSystemUIFont`) before handing it to the font manager, so it
 * matches and renders; Android has no equivalent alias, so `"System"` is
 * asked for verbatim against Android's real font families (`sans-serif`,
 * `Roboto`, …), fails to match anything, and silently produces a font that
 * draws no visible glyphs at all — no error, nothing a mocked test or a
 * source read could have caught, only a real device. Both axes shared that
 * one `SkFont` object, which is why both failed together even though only
 * the equity axis's captions were originally reported.
 *
 * The fix (issue #188 revision 2, approved by the maintainer on 2026-09-04)
 * replaces `matchFont` with Skia's `useFont`
 * (`@shopify/react-native-skia`'s `src/skia/core/Font.ts`), loading this
 * project's own bundled `assets/fonts/InnovatorGrotesk-Regular.otf` by its
 * actual bytes rather than asking the platform to resolve a family name —
 * sidestepping the whole class of platform-dependent alias-resolution
 * failure `matchFont` was exposed to. `useFont(source, size)` reads
 * `theme.typography.chartAxisLabel`'s own size the same way `matchFont` did,
 * for the same reason (this project's type scale stays the single source of
 * that number; only the size reaches Skia, since a font has no line height
 * to take — docs/conventions/design-system.md's Typography section records
 * that). Unlike `matchFont`, `useFont` is already memoised internally on
 * `[size, typeface]` (`Font.ts`'s own `useMemo`), so this component does not
 * wrap it in a second one.
 *
 * **this is a reversal of a deliberate prior choice, not an oversight
 * corrected.** Since `docs/decisions/2026-09-02-bundle-innovator-grotesk-
 * and-diverge-from-figmas-inter.md`, the rest of this app renders in the
 * bundled Innovator Grotesk face — `theme.typography.chartAxisLabel.
 * fontFamily` already names `fontFaces.regular` (`InnovatorGrotesk-Regular`)
 * for this exact role, matching every other text role in the app. This
 * component's own prior code simply never read that field, only the role's
 * `fontSize`. On 2026-09-03 the maintainer was asked and chose to keep the
 * system face here anyway, specifically to avoid `useFont`'s asynchronous
 * load: unlike `matchFont`'s synchronous `Skia.FontMgr.System()` path, a
 * loaded font asset is not available on the first frame, so the chart draws
 * with no axis labels at all for one or more frames while the load
 * completes. That was a real, disclosed cost, not a hypothetical one — see
 * the render-guard paragraph above `axisFont`'s own declaration below. On
 * 2026-09-04, after the system-face path's Android failure above, the
 * maintainer was asked again and chose to accept that async-load cost in
 * exchange for exact brand-font consistency and a fix that does not depend
 * on any platform resolving any family name at all. A later change MUST NOT
 * revert to `matchFont` or any other system-font path without going back to
 * the maintainer once more — the failure mode above is Android-only and
 * device-specific, so it will not resurface in this project's mocked tests
 * either.
 *
 * **each axis keeps only its two ends, and the formatters are what blank
 * the rest** — not the tick count, which still resolves the five ticks
 * whose positions the plot is laid out against. `formatEquityAxisLabel`
 * and `combosAxisLabelFormatter` below return `''` for every interior
 * tick. `getTextLayout` measures that empty string at width 0, and `XAxis`
 * additionally gates a label on that width being non-zero — but the combos
 * axis's `YAxis` does not: the default label branch it takes here renders
 * `labelLayout.lines` with no width check at all (only its `labelRenderer`
 * branch gates on width, and this chart does not use that branch). So on
 * the combos axis the interior ticks are blank because the string itself
 * is empty, not because a width check filters them.
 */
export function EquityBreakdownChart({
  distribution,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** the acting player's own real per-card-pair equity distribution — a
   * fixed-length array of counts, one per equal-width equity slice,
   * exactly the shape `EspadaEquityPlayerResult.distribution`
   * (`@/modules/espada-engine/index`) carries, or `null` when no result
   * is currently available for that player (see this component's own
   * doc comment). `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`
   * is this prop's only source — it owns which player this chart is
   * currently open for. */
  distribution: readonly number[] | null;
  testID?: string;
}) {
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

  // loads the bundled `InnovatorGrotesk-Regular` face by its actual bytes,
  // not by asking the platform to resolve a family name — see this
  // component's own doc comment for why `matchFont`'s system-font path is
  // gone. `useFont` returns `null` until the asset finishes loading (or on
  // load failure), and is already memoised internally on `[size, typeface]`
  // (`@shopify/react-native-skia`'s `Font.ts`), so this component does not
  // wrap it in its own `useMemo` the way it did for `matchFont`. The render
  // guard below must not hand `CartesianChart` a `null` font.
  const axisFont = useFont(
    require('../../../../../assets/fonts/InnovatorGrotesk-Regular.otf'),
    axisLabelFontSize,
  );

  // issue #102's own non-functional requirements: "the chart re-renders
  // only when the sheet's own width or open player changes; scrolling the
  // list behind the sheet must not recompute it." this component takes no
  // `player` prop at all — `../equity-breakdown-sheet/
  // equity-breakdown-sheet.tsx` is what owns which player is open, and
  // hands this component that player's own real `distribution` (issue
  // #138) rather than this component reading it itself — so `width`,
  // `distribution`, and the four band anchors above are the only inputs
  // this whole derivation actually reads.
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
    // `distribution === null` is the practically-unreachable "no result"
    // case (see this component's own doc comment) — folding
    // `NO_RESULT_DISTRIBUTION` through the same pipeline a real
    // distribution goes through draws every bar at count `0`, so no bars
    // are drawn, without a second "no data" branch below this line.
    const counts = foldEquityBins(distribution ?? NO_RESULT_DISTRIBUTION, barCount);
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
    // `width`, `distribution`, and the four anchor strings are the only
    // reactive values this callback reads — `chooseBarCount`,
    // `foldEquityBins`, `barColors`, and `combosAxisUpperBound` are
    // module-level pure functions, not values a dependency array needs to
    // name.
  }, [width, distribution, trashColor, marginalColor, valueColor, nutsColor]);

  // a title's own descender — the part of a glyph like the "y" in "Equity"
  // that drops below the text baseline — commonly runs to roughly a quarter
  // to a third of a system sans-serif font's own em size; this takes the
  // top of that range (`0.3`) and rounds the result up to the next whole
  // pixel, so the same margin also clears the antialiased fringe of a glyph
  // sitting exactly on the baseline, not only its descender. This is the
  // only clearance `padding.bottom` below actually needs — see its own doc
  // comment for why the equity axis's tick-label and title lines themselves
  // need no further reservation there.
  const equityAxisBottomPaddingBuffer = Math.ceil(axisLabelFontSize * 0.3);

  // memoised for the same reason the derivation above is, and additionally
  // because `useBuildChartAxis` inside Victory Native memoises on these
  // objects' own identities: handing it a freshly-built `xAxis`/`yAxis`/
  // `frame` every render would rebuild the whole normalised axis set on
  // every render of the tree behind the sheet.
  const { domain, padding, frame, xAxis, yAxis } = useMemo(
    () => ({
      // `data`, `domain`, `padding` and the normalised axis props are all
      // dependencies of `CartesianChart`'s own transform memo, so `domain`
      // is built here alongside the rest rather than inline at the call
      // site: one freshly-built object among them defeats that memo for
      // all of them.
      domain: { x: [0, 100] as [number, number], y: [0, combosAxisMax] as [number, number] },
      // one label line of clearance above the plot. Victory Native draws a
      // y tick label centred on its own tick and drops it when it would
      // overflow the canvas's top edge (`YAxis.tsx`'s
      // `canFitLabelContent`), and the topmost tick sits exactly on the
      // plot's top edge — so without this the combos axis's own upper
      // bound, the one label issue #102 requires it to end at, is the one
      // label that never renders.
      //
      // below the plot, the equity axis's own tick-label line and its title
      // line both draw *inside* the canvas too, past `chartBounds.bottom` —
      // but Victory Native already reserves the space for both, one layer
      // further in, independently of this `bottom` value. Read directly off
      // the installed library's source at 42.0.1 (`victory-native@42.0.1`,
      // confirmed against `node_modules/victory-native/package.json`):
      // `transformInputData.ts` shrinks the y-scale's own output *range* —
      // which `getCartesianChartBounds.ts` reads `chartBounds.bottom`
      // directly off — by `xAxisOutset` (the title line's own height+offset
      // plus the tick-label line's own height+offset) before `bottom` is
      // even applied to it, and `XAxis.tsx` then adds that exact same
      // quantity back on top of `chartBounds.bottom` when placing the
      // title's own baseline (`titleY`) — so it cancels out exactly:
      // `titleY = canvasHeight - padding.bottom`, for any
      // `axisLabelFontSize`. `bottom` therefore maps one-to-one onto the
      // title's own clearance from the canvas's bottom edge; it does not
      // need to reserve the label/title space a second time. A `bottom`
      // derived from `axisLabelFontSize` the way `top` above reserves a
      // whole label line would double-reserve that already-reserved space
      // and shrink the plotted bars themselves — see issue #188's own
      // investigation. `equityAxisBottomPaddingBuffer` above is exactly the
      // small margin that one-to-one mapping actually needs.
      padding: {
        top: axisLabelFontSize,
        right: 0,
        bottom: equityAxisBottomPaddingBuffer,
        left: 0,
      },
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
      equityAxisBottomPaddingBuffer,
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
        {width > 0 && axisFont ? (
          <CartesianChart
            data={data}
            xKey="x"
            yKeys={COMBOS_Y_KEYS}
            domain={domain}
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

/** the combos axis's own two ends, the second of which is not fixed: `max`
 * is `combosAxisUpperBound` for the bins this render actually drew
 * (`../../model/equity-breakdown.ts`). This formatter can only label a
 * value Victory Native actually produced a tick for — it resolves ticks
 * through d3's `scale.ticks(tickCount)` (`node_modules/victory-native/src/
 * cartesian/CartesianChart.tsx`, `transformInputData.ts`), and d3 does not
 * put every multiple of `COMBOS_AXIS_ROUND_TICK` on the axis: over `[0, b]`
 * at this chart's tick count (5, victory-native's own default —
 * `axisDefaults.ts`; `yAxis` below sets no `tickCount`) it omits the top
 * tick for many values of `b` — 90, 110, and 130 among them, verified
 * directly against the installed `d3-scale` package.
 *
 * Each hand-range player's own real distribution
 * (`EspadaEquityPlayerResult.distribution`, `@/modules/espada-engine/
 * index`) can drive `max` to any multiple of `COMBOS_AXIS_ROUND_TICK`, not
 * only the small, fixed set the removed placeholder distribution once
 * produced — so the top combos label can go missing for a real player
 * whose largest folded bin happens to land on one of the bounds above.
 * That gap is a property of `combosAxisUpperBound`'s own round-to-nearest-
 * `COMBOS_AXIS_ROUND_TICK` rule and of this formatter's own "only a value
 * Victory Native actually ticked" contract, neither of which issue #138
 * changes: its own acceptance criteria ask this histogram's axis behavior
 * stay exactly as shipped, so a bound-choosing rule immune to this gap is
 * left as a follow-up, not folded into that change. */
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
