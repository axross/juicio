import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { darkTheme, lightTheme } from '@/core/theme/tokens';

import {
  chooseBarCount,
  combosAxisUpperBound,
  equityBinWidth,
  foldEquityBins,
  MINIMUM_BAR_PITCH,
} from '../../model/equity-breakdown';
import { EquityBreakdownChart } from './equity-breakdown-chart';

// Skia and Victory Native are not exercisable under this project's Jest
// setup (docs/conventions/testing.md) — mocked at the module boundary, per
// issue #102's own manifest. `CartesianChart` is a plain `jest.fn`
// returning `null`, so a test can read back exactly what this component
// handed it (`data`, `domain`, `frame`, `xAxis`, `yAxis`) without Victory
// Native ever rendering anything; `Bar` is never actually invoked in that
// case, since this component's own `children` render prop — the thing that
// would call `Bar` — never runs against a mock that ignores its `children`
// prop entirely.
jest.mock('victory-native', () => ({
  CartesianChart: jest.fn(() => null),
  Bar: jest.fn(() => null),
}));

// `@shopify/react-native-skia` ships ESM that this project's
// `transformIgnorePatterns` does not transform, so importing it for real
// under Jest fails to parse before any test runs. The component reaches it
// for `matchFont` alone, and what a test has to see is the size this
// project asked for — not the `SkFont` the platform's font manager would
// hand back, which is exactly the drawn-output side of the boundary
// docs/conventions/testing.md draws.
jest.mock('@shopify/react-native-skia', () => ({
  matchFont: jest.fn(() => ({ getSize: () => 0 })),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { CartesianChart: MockedCartesianChart } = require('victory-native');
const { matchFont: mockedMatchFont } = require('@shopify/react-native-skia');
/* eslint-enable @typescript-eslint/no-require-imports */

// `onLayout` reports the canvas's border box, and the component chooses
// its bar count from that measurement as it arrives (see
// `equity-breakdown-chart.tsx`'s own doc comment for why neither the axis
// rule nor the label gutter is taken off first) — so every test below
// fires a measurement and reads the count back against `chooseBarCount` of
// that same measurement.
function fireCanvasLayout(measuredWidth: number) {
  fireEvent(screen.getByTestId('canvas'), 'layout', {
    nativeEvent: { layout: { width: measuredWidth, height: 220, x: 0, y: 0 } },
  });
}

// stands in for a real player's own `EspadaEquityPlayerResult.distribution`
// (`@/modules/espada-engine/index`) below — a fixed sample this suite
// defines locally, per issue #138's own decision boundary, rather than the
// shared placeholder export this component no longer reads. Kept at the
// same 20-entry bell shape the removed placeholder had, so every numeric
// expectation this suite already pinned against that shape (the specific
// `combosAxisUpperBound` figures below, among others) still holds under
// its new name.
const SAMPLE_DISTRIBUTION: readonly number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

// a second, deliberately different shape — every one of this player's own
// card pairs landing in one bin rather than spread bell-like across every
// bin — so a test can assert two different real distributions actually
// draw two different sets of bars, not merely that some data was handed
// to `CartesianChart`.
const OTHER_DISTRIBUTION: readonly number[] = [
  20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

function lastChartProps() {
  return MockedCartesianChart.mock.calls[MockedCartesianChart.mock.calls.length - 1][0];
}

describe('<EquityBreakdownChart />', () => {
  beforeEach(() => {
    MockedCartesianChart.mockClear();
    mockedMatchFont.mockClear();
  });

  it('renders nothing to CartesianChart before its first layout measurement', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    expect(MockedCartesianChart).not.toHaveBeenCalled();
  });

  it('hands CartesianChart a fixed [0, 100] x domain and a y domain covering every drawn bar', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 20 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { domain, data } = MockedCartesianChart.mock.calls[0][0];
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, barCount));
    expect(domain.x).toEqual([0, 100]);
    expect(domain.y).toEqual([0, expectedMax]);
    // no drawn bar is ever taller than the axis it is drawn against — the
    // property issue #102's revised plan actually asks for, not merely
    // that some upper bound was supplied.
    for (const row of data) {
      expect(row.count).toBeLessThanOrEqual(expectedMax);
    }
  });

  it("recomputes the y domain's own upper bound when the bar count changes", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowMax = MockedCartesianChart.mock.calls[0][0].domain.y[1];

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideMax = lastChartProps().domain.y[1];

    // the placeholder distribution's own fold concentrates more of the
    // same fixed total into fewer bins, so 8 bars need a taller axis than
    // 20 do — this is not merely "the two differ," it is which direction.
    expect(narrowMax).toBeGreaterThan(wideMax);
  });

  // Victory Native's `Bar` mark centres a bar on its own point
  // (`getVerticalBarRect` in `node_modules/victory-native/src/cartesian/
  // utils/getVerticalBarRect.ts` sets the drawn rect's left edge to
  // `point.x - barThickness / 2`), so a bin spanning `[0, binWidth)` must
  // hand that mark its own centre, `binWidth / 2`, not its left edge `0` —
  // and the last bin, spanning `[100 - binWidth, 100)`, must hand
  // `100 - binWidth / 2`. This pins the `data` derivation's own arithmetic
  // at more than one bar count; it does not prove Victory Native actually
  // draws the bar there, since `CartesianChart` and `Bar` are both mocked
  // above and neither renders anything a test could measure — that half
  // rests on the source read cited in this test's own comment, not on
  // anything this suite can observe.
  it.each([8, 20] as const)(
    "places the first bar's point at its bin's own centre and the last at its own, not either bin's edge, at %d bars",
    async (barCount) => {
      await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

      fireCanvasLayout(barCount * MINIMUM_BAR_PITCH);

      const { data } = MockedCartesianChart.mock.calls[0][0];
      const binWidth = equityBinWidth(barCount);
      expect(data[0].x).toBeCloseTo(binWidth / 2);
      expect(data[data.length - 1].x).toBeCloseTo(100 - binWidth / 2);
    },
  );

  it('hands CartesianChart exactly as many data rows as chooseBarCount resolves the drawing width to', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { data } = MockedCartesianChart.mock.calls[0][0];
    expect(data).toHaveLength(chooseBarCount(measuredWidth));
  });

  it('re-renders with a new bar count when the measured width crosses a boundary', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowRowCount = MockedCartesianChart.mock.calls[0][0].data.length;

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideRowCount = lastChartProps().data.length;

    expect(narrowRowCount).toBe(8);
    expect(wideRowCount).toBe(20);
    expect(wideRowCount).toBeGreaterThan(narrowRowCount);
  });

  // issue #102's acceptance criteria state two phone widths, 430pt (the
  // widest supported phone) and 320pt (the narrowest); these two are what
  // the plan's own System design section derives from them — each phone's
  // own screen width and the sheet's side padding hand the chart 401pt to
  // measure on the first and 291pt on the second. Both are measurements,
  // so they are fired as measurements here.
  it.each([
    [401, 20],
    [291, 12],
  ])(
    'folds to the bar count issue #102 asks for at the %ipt a supported phone actually measures',
    async (measuredWidth, expectedBarCount) => {
      await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

      fireCanvasLayout(measuredWidth);

      expect(lastChartProps().data).toHaveLength(expectedBarCount);
    },
  );

  // the fragility the count deliberately does not carry: a measurement
  // arriving fractionally under 401 — Android's pixel-grid rounding of the
  // widest supported phone's own 430dp width less two 14.5dp paddings
  // lands either side of the integer — still resolves to 20 bars. Taking
  // the axis rule or the combos axis's own label gutter off the
  // measurement before choosing would drop it to 16 here, so this is the
  // guard behind `equity-breakdown-chart.tsx`'s "do not subtract either".
  it('still folds to 20 bars when the widest supported phone measures fractionally under 401pt', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(400.9);

    expect(lastChartProps().data).toHaveLength(20);
  });

  it('carries one accessibility label naming the resolved bar count and the drawn axis max, on the canvas alone', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    // 12 bars, whose own upper bound (40) differs from its own bar count
    // (12) — unlike 20 bars, where both numbers coincide and a
    // `toContain` assertion could pass without the max ever being wired
    // in at all.
    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, barCount));

    const canvas = screen.getByTestId('canvas');
    expect(canvas.props.accessible).toBe(true);
    expect(canvas.props.accessibilityLabel).toContain(String(barCount));
    expect(canvas.props.accessibilityLabel).toContain(String(expectedMax));
  });

  // nothing inside a Skia canvas reaches a screen reader, so this one
  // label is the whole of what the chart says (issue #102's own
  // Accessibility section). It has to name which axis runs where, not only
  // the two figures above — which the axis labels themselves said back
  // when they were laid-out text.
  it('names both axes and the equity range in that same one label', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(12 * MINIMUM_BAR_PITCH);

    const label = screen.getByTestId('canvas').props.accessibilityLabel;
    expect(label).toContain('horizontal axis is equity');
    expect(label).toContain('vertical axis is card-pair count');
    expect(label).toContain('100');
  });

  // Everything below asserts the configuration this component hands
  // Victory Native, and nothing about what Victory Native then draws from
  // it — the boundary docs/conventions/testing.md states. The rules, the
  // tick labels and the axis names are all painted into a Skia canvas the
  // runner replaces with a stand-in, so there is no drawn output here to
  // assert even if the boundary allowed it.

  it('bounds the plot on its bottom and start edges only, with all four frame widths given', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { frame } = lastChartProps();
    // all four, deliberately: Victory Native's `Frame` decides whether to
    // draw a side from a copy of `lineWidth` defaulted to
    // `StyleSheet.hairlineWidth`, but strokes it with the raw prop — so an
    // omitted side is drawn at Skia's own default stroke, not omitted.
    expect(frame.lineWidth).toEqual({
      top: 0,
      right: 0,
      bottom: lightTheme.borderWidth.base,
      left: lightTheme.borderWidth.base,
    });
  });

  it('draws the axis rules in the role that clears the non-text contrast floor on a neutral ground', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    // `border.neutral.unselectedControl`, not a step of the neutral border
    // ramp: the rules stand on the sheet panel's `background.neutral.app`,
    // where every one of those steps falls under the WCAG 2 AA 3:1
    // non-text floor (docs/conventions/design-system.md's "Brand Accent and
    // Unselected-Control-Border Roles"). This asserts only which role the
    // chart is handed — the ratios themselves are the token layer's own
    // property, asserted in `../../../../core/theme/tokens.test.ts`.
    //
    // Only one theme renders under this suite, and which one is not this
    // test's business — so the assertion is against **both** themes'
    // resolved values for the role, which pins the rule to the role rather
    // than to one hex value without claiming to have rendered both.
    const { frame } = lastChartProps();
    expect([
      lightTheme.colors.border.neutral.unselectedControl,
      darkTheme.colors.border.neutral.unselectedControl,
    ]).toContain(frame.lineColor);
    // the three ramp steps this must not regress to, weakest first.
    for (const step of ['subtle', 'interactive', 'hovered'] as const) {
      expect([
        lightTheme.colors.border.neutral[step],
        darkTheme.colors.border.neutral[step],
      ]).not.toContain(frame.lineColor);
    }
  });

  // Victory Native draws a y axis whether or not one is asked for
  // (`useBuildChartAxis` falls back to a defaulted axis and the render gate
  // reads it as present), and an axis's `lineWidth` draws a gridline
  // spanning the plot rather than a tick mark. Both axes therefore have to
  // be passed, and both at zero width.
  it('passes both axes at zero line width, so no gridline crosses the plot', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis, yAxis } = lastChartProps();
    expect(xAxis.lineWidth).toBe(0);
    expect(yAxis).toHaveLength(1);
    expect(yAxis[0].lineWidth).toBe(0);
  });

  it("names each axis through the charting library, in this project's own copy", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis, yAxis } = lastChartProps();
    expect(xAxis.title.text).toBe('Equity');
    expect(yAxis[0].title.text).toBe('combos');
  });

  it('labels the equity axis at its two ends only', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { formatXLabel } = lastChartProps().xAxis;
    expect(formatXLabel(0)).toBe('0');
    expect(formatXLabel(100)).toBe('100');
    for (const interior of [20, 40, 60, 80]) {
      expect(formatXLabel(interior)).toBe('');
    }
  });

  it('labels the combos axis at its own computed upper bound, not a fixed figure', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 8 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(measuredWidth)),
    );

    const { formatYLabel } = lastChartProps().yAxis[0];
    expect(formatYLabel(0)).toBe('0');
    expect(formatYLabel(expectedMax)).toBe(String(expectedMax));
    // the bound 20 bars would have drawn — an interior tick at this bar
    // count, so a formatter closed over a fixed figure rather than over
    // this render's own bound would label it and fail here.
    expect(formatYLabel(20)).toBe('');
  });

  it("sets both axes' labels in the neutral text role the rest of the chart's annotation takes", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis, yAxis } = lastChartProps();
    for (const color of [
      xAxis.labelColor,
      xAxis.title.color,
      yAxis[0].labelColor,
      yAxis[0].title.color,
    ]) {
      expect([lightTheme.colors.text.neutral.low, darkTheme.colors.text.neutral.low]).toContain(
        color,
      );
    }
  });

  // the maintainer's own on-device pass over PR #116's preview build found
  // both axis labels reading too large at `caption`, and this component's
  // own size must not drift back there. A Skia font takes a size rather
  // than a text style, so `chartAxisLabel`'s own `fontSize` is what reaches
  // it — the type scale stays the single source of the number either way.
  it("builds its tick-label font at the chart axis type role's own size", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    expect(mockedMatchFont).toHaveBeenCalledWith({
      fontSize: lightTheme.typography.chartAxisLabel.fontSize,
    });
  });

  it('hands the same font object to both axes', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis, yAxis } = lastChartProps();
    expect(xAxis.font).toBeDefined();
    expect(yAxis[0].font).toBe(xAxis.font);
  });

  // Victory Native centres a y tick label on its own tick and drops it
  // when it would overflow the canvas's top edge (`YAxis.tsx`'s
  // `canFitLabelContent`); the topmost tick sits exactly on the plot's top
  // edge, so without a line's worth of padding above it the one label the
  // combos axis must end at is the one that never renders.
  it("reserves a label line above the plot so the combos axis's upper bound can render", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    expect(lastChartProps().padding.top).toBeGreaterThanOrEqual(
      lightTheme.typography.chartAxisLabel.fontSize,
    );
  });

  // the equity axis's own tick-label line and its title line both draw
  // *inside* the canvas, below `chartBounds.bottom` — a `padding.bottom` of
  // `0` (this chart's own regression, issue #188) pushes both of them past
  // the canvas's own bottom edge, where neither is ever visible. Two label
  // lines' worth of clearance is the floor this asserts, mirroring the
  // single-line floor the top-padding test above asserts for the combos
  // axis; `equity-breakdown-chart.tsx`'s own `padding` doc comment derives
  // the exact figure this component actually reserves.
  it("reserves the equity axis's own tick-label and title lines beneath the plot", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    expect(lastChartProps().padding.bottom).toBeGreaterThanOrEqual(
      2 * lightTheme.typography.chartAxisLabel.fontSize,
    );
  });

  // issue #138: this component now folds the acting player's own real
  // `EspadaEquityPlayerResult.distribution`, not one shape shared by every
  // player — these are the tests that shape of change actually asks for,
  // per that issue's own verification strategy: that a real per-player
  // breakdown folds correctly, and that two different ones draw two
  // different sets of bars.
  it('folds two different distributions to two different sets of bar heights', async () => {
    const { rerender } = await render(
      <EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />,
    );
    fireCanvasLayout(401);
    const sampleCounts = lastChartProps().data.map((row: { count: number }) => row.count);

    await rerender(<EquityBreakdownChart distribution={OTHER_DISTRIBUTION} testID="chart" />);
    const otherCounts = lastChartProps().data.map((row: { count: number }) => row.count);

    expect(otherCounts).not.toEqual(sampleCounts);
  });

  // issue #138's own functional requirements: if the acting player's
  // result is unavailable while the sheet stays open, the histogram draws
  // no bars rather than a stale or fabricated shape — never
  // `SAMPLE_DISTRIBUTION` or any other player's own real data.
  it('draws every bar at zero height when distribution is null (the result is unavailable)', async () => {
    await render(<EquityBreakdownChart distribution={null} testID="chart" />);

    fireCanvasLayout(401);

    const { data, domain } = lastChartProps();
    expect(domain.y).toEqual([0, 0]);
    for (const row of data) {
      expect(row.count).toBe(0);
    }
  });
});
