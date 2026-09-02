import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  chooseBarCount,
  combosAxisUpperBound,
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
