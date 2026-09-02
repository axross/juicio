import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
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
// whatever `domain.y` it is handed to fill this fixed pixel height, so a
// taller axis draws shorter bars at the same height rather than needing
// more of it.
const CHART_HEIGHT = 180;

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
 * (docs/conventions/testing.md). This component is asserted only on what
 * it hands those two libraries and on its own accessibility label; the two
 * mocked in `equity-breakdown-chart.test.tsx`.
 *
 * **measures its own drawing width via `onLayout`, not a device
 * breakpoint** — issue #102's own plan is explicit that the sheet's
 * `PANEL_MAX_WIDTH` and its own side padding mean the chart's actual
 * drawing width is not a pure function of device width alone. Before the
 * first layout pass reports a real width, this draws at the narrowest tier
 * `../../model/equity-breakdown.ts` ever chooses (`EQUITY_BIN_COUNTS`'s
 * own last entry): an under-count that briefly fills less of the width
 * than it could reads better for one frame than an over-count that would
 * have to shrink a moment later once the real measurement arrives.
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
 * shows and how many bars it drew (issue #102's own Accessibility
 * section); Victory Native's own Skia-drawn bars carry no accessibility
 * tree of their own for a screen reader to otherwise stumble into.
 *
 * **the axis labels are plain themed `Text`, not Victory Native's own
 * Skia-rendered tick labels** — this project bundles no font file for
 * `@shopify/react-native-skia`'s `useFont` to load, and the chart only
 * ever needs to show each axis's own two endpoints plus its name, never a
 * tick per bar; reaching for Victory Native's own axis chrome for that
 * would need a bundled font this project has no other reason to carry.
 * The equity axis's endpoints are fixed (`0`/`100`); the combos axis's
 * upper endpoint is not — `combosAxisUpperBound`
 * (`../../model/equity-breakdown.ts`) derives it from `counts` below, so it
 * always covers whatever `barCount` this render actually drew, at every
 * bar count `chooseBarCount` can resolve to.
 *
 * **the two axis rules are React Native borders on the canvas container,
 * not Victory Native axis chrome either** — same reason as the labels
 * above (no bundled font for `useFont`), plus one this project's own test
 * setup adds: a border side on a `View` is a style a component test can
 * assert, while anything Skia draws inside the canvas is not observable
 * under this project's Jest setup at all (docs/conventions/testing.md).
 * The rules bound the plotted area on its bottom and start edges so the
 * bars read as sitting in a chart rather than floating on the sheet — see
 * `styles.canvas` below for why they take the stronger of the two neutral
 * border steps.
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
  // are the only four scalars this component reads off `theme` at all.
  // Reading them here, outside the `useMemo` below, still goes through
  // `useUnistyles`'s own proxy `get` trap and registers this component's
  // `UnistyleDependency.Theme` subscription exactly as reading them inside
  // the memo would have (`node_modules/react-native-unistyles/src/core/
  // useProxifiedUnistyles/useProxifiedUnistyles.ts`'s `get` handler adds the
  // dependency on every property access, regardless of which caller made
  // it) — so pulling them out here costs the theme subscription nothing.
  const trashColor = theme.bands.trash.solid;
  const marginalColor = theme.bands.marginal.solid;
  const valueColor = theme.bands.value.solid;
  const nutsColor = theme.bands.nuts.solid;

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
    // `width` and the four anchor strings are the only reactive values this
    // callback reads — `chooseBarCount`, `foldEquityBins`, `barColors`, and
    // `combosAxisUpperBound` are module-level pure functions, not values a
    // dependency array needs to name.
  }, [width, trashColor, marginalColor, valueColor, nutsColor]);

  const accessibilityLabel = t('equityBreakdown.chart.accessibilityLabel', {
    count: barCount,
    max: combosAxisMax,
  });

  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View style={styles.axisHeader}>
        <Text style={styles.axisCaption} testID={testID ? 'combos-axis-label' : undefined}>
          {t('equityBreakdown.chart.combosAxisLabel')}
        </Text>
        <Text style={styles.axisValue} testID={testID ? 'combos-axis-max' : undefined}>
          {combosAxisMax}
        </Text>
      </View>
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
            yKeys={['count']}
            domain={{ x: [0, 100], y: [0, combosAxisMax] }}
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
      <View style={styles.axisFooter}>
        <Text style={styles.axisValue}>0</Text>
        <View style={styles.axisFooterEnd}>
          <Text style={styles.axisValue}>100</Text>
          <Text style={styles.axisCaption} testID={testID ? 'equity-axis-label' : undefined}>
            {t('equityBreakdown.chart.equityAxisLabel')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    gap: theme.space.x8,
  },
  axisHeader: {
    gap: theme.space.x4,
  },
  axisCaption: {
    ...theme.typography.chartAxisLabel,
    color: theme.colors.text.neutral.low,
  },
  axisValue: {
    ...theme.typography.chartAxisLabel,
    color: theme.colors.text.neutral.low,
  },
  canvas: {
    width: '100%',
    height: CHART_HEIGHT,
    // the chart's own two axis rules — bottom and start edges only, so the
    // plotted area reads as bounded. `border.neutral.interactive` (Radix
    // step 7) rather than `border.neutral.subtle` (step 6) is deliberate:
    // the maintainer asked for these on the grounds that the axes be easy
    // to make out on a real device, and step 6 is the step that reads as a
    // hairline separator. do not "normalise" this down to `subtle`.
    borderBottomWidth: theme.borderWidth.base,
    borderStartWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.interactive,
  },
  axisFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  axisFooterEnd: {
    alignItems: 'flex-end',
  },
}));
