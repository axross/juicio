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

function fireCanvasLayout(width: number) {
  fireEvent(screen.getByTestId('canvas'), 'layout', {
    nativeEvent: { layout: { width, height: 180, x: 0, y: 0 } },
  });
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

    const width = 20 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(width);

    const { domain, data } = MockedCartesianChart.mock.calls[0][0];
    const barCount = chooseBarCount(width);
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
    const wideMax =
      MockedCartesianChart.mock.calls[MockedCartesianChart.mock.calls.length - 1][0].domain.y[1];

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

  it('hands CartesianChart exactly as many data rows as chooseBarCount resolves the measured width to', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const width = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(width);

    const { data } = MockedCartesianChart.mock.calls[0][0];
    expect(data).toHaveLength(chooseBarCount(width));
  });

  it('re-renders with a new bar count when the measured width crosses a boundary', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowRowCount = MockedCartesianChart.mock.calls[0][0].data.length;

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideRowCount =
      MockedCartesianChart.mock.calls[MockedCartesianChart.mock.calls.length - 1][0].data.length;

    expect(narrowRowCount).toBe(8);
    expect(wideRowCount).toBe(20);
    expect(wideRowCount).toBeGreaterThan(narrowRowCount);
  });

  it('carries one accessibility label naming the resolved bar count and the drawn axis max, on the canvas alone', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    // 12 bars, whose own upper bound (40) differs from its own bar count
    // (12) — unlike 20 bars, where both numbers coincide and a
    // `toContain` assertion could pass without the max ever being wired
    // in at all.
    const width = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(width);
    const barCount = chooseBarCount(width);
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

  it('draws the axis rules in the stronger of the two neutral border steps', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const canvasStyle = RNStyleSheet.flatten(screen.getByTestId('canvas').props.style);

    // step 7 (`interactive`), deliberately not step 6 (`subtle`): the
    // maintainer asked for these on the grounds that the axes be easy to
    // make out on device, so a later "normalisation" down to `subtle` has
    // to fail here.
    //
    // Only one theme renders under this suite, and which one is not this
    // test's business — so the assertion is against **both** themes'
    // resolved values for the role, which pins the rule to the role rather
    // than to one hex value without claiming to have rendered both. That
    // the role resolves at all in each scheme is the token layer's own
    // property, covered by `../../../../core/theme/tokens.test.ts`'s ramp-
    // slot sweep; this asserts only that the canvas takes that role rather
    // than the weaker step beside it.
    expect([
      lightTheme.colors.border.neutral.interactive,
      darkTheme.colors.border.neutral.interactive,
    ]).toContain(canvasStyle.borderColor);
    expect([
      lightTheme.colors.border.neutral.subtle,
      darkTheme.colors.border.neutral.subtle,
    ]).not.toContain(canvasStyle.borderColor);
  });

  it('renders the axis labels for the equity and combos axes', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    expect(screen.getByTestId('combos-axis-label').props.children).toBe('combos');
    expect(screen.getByTestId('equity-axis-label').props.children).toBe('Equity');
  });

  it('renders the combos axis value as its own computed upper bound, not a fixed figure', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    const width = 8 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(width);
    const barCount = chooseBarCount(width);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(PLACEHOLDER_EQUITY_DISTRIBUTION, barCount),
    );

    expect(screen.getByTestId('combos-axis-max').props.children).toBe(expectedMax);
  });
});
