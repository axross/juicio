import '@/core/theme/unistyles';
import '@/core/i18n';

import { StyleSheet as RNStyleSheet } from 'react-native';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { darkTheme, lightTheme } from '@/core/theme/tokens';

import {
  chooseBarCount,
  combosAxisUpperBound,
  equityBinWidth,
  foldEquityBins,
  MINIMUM_BAR_PITCH,
  PLACEHOLDER_EQUITY_DISTRIBUTION,
} from '../../model/equity-breakdown';
import { EquityBreakdownChart } from './equity-breakdown-chart';

// Skia and Victory Native are not exercisable under this project's Jest
// setup (docs/conventions/testing.md) — mocked at the module boundary, per
// issue #102's own manifest. `CartesianChart` is a plain `jest.fn`
// returning `null`, so a test can read back exactly what this component
// handed it (`data`, `domain`) without Victory Native ever rendering
// anything; `Bar` is never actually invoked in that case, since this
// component's own `children` render prop — the thing that would call
// `Bar` — never runs against a mock that ignores its `children` prop
// entirely.
jest.mock('victory-native', () => ({
  CartesianChart: jest.fn(() => null),
  Bar: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CartesianChart: MockedCartesianChart } = require('victory-native');

// `onLayout` reports the canvas's border box, borders included, and the
// component chooses its bar count from that measurement as it arrives (see
// `equity-breakdown-chart.tsx`'s own doc comment for why the axis rule is
// deliberately not taken off first) — so every test below fires a
// measurement and reads the count back against `chooseBarCount` of that
// same measurement.
function fireCanvasLayout(measuredWidth: number) {
  fireEvent(screen.getByTestId('canvas'), 'layout', {
    nativeEvent: { layout: { width: measuredWidth, height: 180, x: 0, y: 0 } },
  });
}

function lastChartProps() {
  return MockedCartesianChart.mock.calls[MockedCartesianChart.mock.calls.length - 1][0];
}

describe('<EquityBreakdownChart />', () => {
  beforeEach(() => {
    MockedCartesianChart.mockClear();
  });

  it('renders nothing to CartesianChart before its first layout measurement', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    expect(MockedCartesianChart).not.toHaveBeenCalled();
  });

  it('hands CartesianChart a fixed [0, 100] x domain and a y domain covering every drawn bar', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const measuredWidth = 20 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { domain, data } = MockedCartesianChart.mock.calls[0][0];
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount),
    );
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
    await render(<EquityBreakdownChart testID="chart" />);

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
      await render(<EquityBreakdownChart testID="chart" />);

      fireCanvasLayout(barCount * MINIMUM_BAR_PITCH);

      const { data } = MockedCartesianChart.mock.calls[0][0];
      const binWidth = equityBinWidth(barCount);
      expect(data[0].x).toBeCloseTo(binWidth / 2);
      expect(data[data.length - 1].x).toBeCloseTo(100 - binWidth / 2);
    },
  );

  it('hands CartesianChart exactly as many data rows as chooseBarCount resolves the drawing width to', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { data } = MockedCartesianChart.mock.calls[0][0];
    expect(data).toHaveLength(chooseBarCount(measuredWidth));
  });

  it('re-renders with a new bar count when the measured width crosses a boundary', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowRowCount = MockedCartesianChart.mock.calls[0][0].data.length;

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideRowCount = lastChartProps().data.length;

    expect(narrowRowCount).toBe(8);
    expect(wideRowCount).toBe(20);
    expect(wideRowCount).toBeGreaterThan(narrowRowCount);
  });

  // issue #102's acceptance criteria state two *sheet* widths, 430pt and
  // 320pt; these two are what the plan's own System design section derives
  // from them — the sheet's ceiling and its side padding hand the chart
  // 401pt to measure on the first and 291pt on the second. Both are
  // measurements, so they are fired as measurements here.
  it.each([
    [401, 20],
    [291, 12],
  ])(
    'folds to the bar count issue #102 asks for at the %ipt a supported phone actually measures',
    async (measuredWidth, expectedBarCount) => {
      await render(<EquityBreakdownChart testID="chart" />);

      fireCanvasLayout(measuredWidth);

      expect(lastChartProps().data).toHaveLength(expectedBarCount);
    },
  );

  // the fragility the count deliberately does not carry: a measurement
  // arriving fractionally under 401 — Android's pixel-grid rounding of a
  // 430dp panel less two 14.5dp paddings lands either side of the integer
  // — still resolves to 20 bars. Taking the axis rule off the measurement
  // before choosing would drop it to 16 here, so this is the guard behind
  // `equity-breakdown-chart.tsx`'s "do not subtract the rule".
  it('still folds to 20 bars when the widest sheet measures fractionally under 401pt', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    fireCanvasLayout(400.9);

    expect(lastChartProps().data).toHaveLength(20);
  });

  it('carries one accessibility label naming the resolved bar count and the drawn axis max, on the canvas alone', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    // 12 bars, whose own upper bound (40) differs from its own bar count
    // (12) — unlike 20 bars, where both numbers coincide and a
    // `toContain` assertion could pass without the max ever being wired
    // in at all.
    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount),
    );

    const canvas = screen.getByTestId('canvas');
    expect(canvas.props.accessible).toBe(true);
    expect(canvas.props.accessibilityLabel).toContain(String(barCount));
    expect(canvas.props.accessibilityLabel).toContain(String(expectedMax));
  });

  // RNTL runs no layout engine and draws nothing (docs/conventions/
  // testing.md), so this pins the resolved style values Yoga would act on
  // rather than an observed rule. That is exactly why the rules are React
  // Native borders on the canvas container instead of Victory Native's own
  // Skia-drawn axis chrome — nothing Skia paints is assertable here at all.
  it('bounds the canvas with a rule on its bottom and start edges only', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const canvasStyle = RNStyleSheet.flatten(screen.getByTestId('canvas').props.style);

    expect(canvasStyle.borderBottomWidth).toBe(lightTheme.borderWidth.base);
    expect(canvasStyle.borderStartWidth).toBe(lightTheme.borderWidth.base);
    // the other two edges stay open — a full box would read as a frame
    // around the chart rather than as two axes.
    expect(canvasStyle.borderTopWidth).toBeUndefined();
    expect(canvasStyle.borderEndWidth).toBeUndefined();
  });

  it('draws the axis rules in the role that clears the non-text contrast floor on a neutral ground', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const canvasStyle = RNStyleSheet.flatten(screen.getByTestId('canvas').props.style);

    // `border.neutral.unselectedControl`, not a step of the neutral border
    // ramp: the rules stand on the sheet panel's `background.neutral.app`,
    // where every one of those steps falls under the WCAG 2 AA 3:1
    // non-text floor (docs/conventions/design-system.md's "Brand Accent and
    // Unselected-Control-Border Roles"). This asserts only which role the
    // canvas takes — the ratios themselves are the token layer's own
    // property, asserted in `../../../../core/theme/tokens.test.ts`, and
    // nothing here claims to have measured a rendered rule.
    //
    // Only one theme renders under this suite, and which one is not this
    // test's business — so the assertion is against **both** themes'
    // resolved values for the role, which pins the rule to the role rather
    // than to one hex value without claiming to have rendered both.
    expect([
      lightTheme.colors.border.neutral.unselectedControl,
      darkTheme.colors.border.neutral.unselectedControl,
    ]).toContain(canvasStyle.borderColor);
    // the three ramp steps this must not regress to, weakest first.
    for (const step of ['subtle', 'interactive', 'hovered'] as const) {
      expect([
        lightTheme.colors.border.neutral[step],
        darkTheme.colors.border.neutral[step],
      ]).not.toContain(canvasStyle.borderColor);
    }
  });

  // the maintainer's own on-device pass over PR #116's preview build found
  // both axis labels reading too large at `caption`, and this component's
  // own type role must not drift back there. `../../../../core/theme/
  // tokens.test.ts` pins what `chartAxisLabel` *is*; this pins that these
  // call sites actually take it, which is the half a token test cannot see.
  it.each(['combos-axis-label', 'equity-axis-label', 'combos-axis-max'])(
    'sets %s in the chart axis type role rather than the caption it shipped at',
    async (labelTestID) => {
      await render(<EquityBreakdownChart testID="chart" />);

      const labelStyle = RNStyleSheet.flatten(screen.getByTestId(labelTestID).props.style);

      expect(labelStyle).toMatchObject(lightTheme.typography.chartAxisLabel);
    },
  );

  it('renders the axis labels for the equity and combos axes', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    expect(screen.getByTestId('combos-axis-label').props.children).toBe('combos');
    expect(screen.getByTestId('equity-axis-label').props.children).toBe('Equity');
  });

  it('renders the combos axis value as its own computed upper bound, not a fixed figure', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const measuredWidth = 8 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount),
    );

    expect(screen.getByTestId('combos-axis-max').props.children).toBe(expectedMax);
  });
});
