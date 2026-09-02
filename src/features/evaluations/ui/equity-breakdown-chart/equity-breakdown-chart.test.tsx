import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { chooseBarCount, MINIMUM_BAR_PITCH } from '../../model/equity-breakdown';
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

  it('hands CartesianChart a fixed [0, 100] x domain and [0, 20] y domain, whatever the bar count', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);

    const { domain } = MockedCartesianChart.mock.calls[0][0];
    expect(domain).toEqual({ x: [0, 100], y: [0, 20] });
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

  it('carries one accessibility label naming the resolved bar count, on the canvas alone', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);

    const canvas = screen.getByTestId('canvas');
    expect(canvas.props.accessible).toBe(true);
    expect(canvas.props.accessibilityLabel).toContain('20');
  });

  it('renders the axis labels for the equity and combos axes', async () => {
    await render(<EquityBreakdownChart testID="chart" />);

    expect(screen.getByTestId('combos-axis-label').props.children).toBe('combos');
    expect(screen.getByTestId('equity-axis-label').props.children).toBe('Equity');
  });
});
