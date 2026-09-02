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
 */
export function EquityBreakdownChart({
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & { testID?: string }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');

  const [width, setWidth] = useState(0);

  // issue #102's own non-functional requirements: "the chart re-renders
  // only when the sheet's own width or open player changes; scrolling the
  // list behind the sheet must not recompute it." this component takes no
  // `player` prop at all — `../equity-breakdown-sheet/
  // equity-breakdown-sheet.tsx` is what owns that, and every player draws
  // the identical placeholder distribution regardless
  // (`../../model/equity-breakdown.ts`'s own doc comment) — so `width` and
  // `theme` are the only two inputs this whole derivation actually reads,
  // and exactly this `useMemo`'s dependency array: whenever this
  // component's own function body re-runs for a reason that changes
  // neither one — its parent sheet re-rendering because a state change
  // elsewhere in `../analyze-screen/analyze-screen.tsx` re-rendered the
  // tree, such as the list scrolling behind an open sheet — this reuses
  // the previous `barCount`/`colors`/`data`/`combosAxisMax` rather than
  // calling `barColors`, `foldEquityBins`, and `combosAxisUpperBound`
  // again.
  const { barCount, colors, data, combosAxisMax } = useMemo(() => {
    const barCount =
      width > 0 ? chooseBarCount(width) : EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];
    const counts = foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount);
    const binWidth = equityBinWidth(barCount);
    // `theme.bands`'s own shape (`../../../../core/theme/tokens.ts`'s
    // `buildBands`) pairs each band with both its `solid` fill and its
    // `text` counterpart; `barColors` wants only the four `solid` anchors.
    const colors = barColors(barCount, {
      trash: theme.bands.trash.solid,
      marginal: theme.bands.marginal.solid,
      value: theme.bands.value.solid,
      nuts: theme.bands.nuts.solid,
    });
    const data = counts.map((count, index) => ({ x: index * binWidth, count }));
    // derived from `counts` above, not a fixed figure — see
    // `combosAxisUpperBound`'s own doc comment
    // (`../../model/equity-breakdown.ts`) for why a fixed axis top cannot
    // hold across every bar count `chooseBarCount` can resolve to.
    const combosAxisMax = combosAxisUpperBound(counts);

    return { barCount, colors, data, combosAxisMax };
    // `width` and `theme` are the only two reactive values this callback
    // reads — `chooseBarCount`, `foldEquityBins`, `barColors`, and
    // `combosAxisUpperBound` are module-level pure functions, not values a
    // dependency array needs to name.
  }, [width, theme]);

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
                  innerPadding={0.2}
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
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
  axisValue: {
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
  canvas: {
    width: '100%',
    height: CHART_HEIGHT,
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
