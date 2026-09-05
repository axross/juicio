import {
  AXIS_LABEL_GAP,
  barHeightPx,
  BAR_WIDTH_RATIO,
  barSlotWidth,
  barWidth,
  barX,
  barY,
  computePlotArea,
  type BarChartFrame,
} from './geometry';

// a representative frame — nonzero on the two sides this chart actually
// draws, zero on the other two, the same shape `equity-breakdown-chart.tsx`
// hands this primitive.
const FRAME: BarChartFrame = { color: '#000000', top: 0, right: 0, bottom: 1, left: 1 };

describe('computePlotArea', () => {
  it('reserves the frame widths and two label rows above and below the plot', () => {
    const plotArea = computePlotArea({
      width: 400,
      height: 220,
      lineHeight: 10,
      yAxisLabelWidth: 20,
      frame: FRAME,
    });
    const reservedRowsHeight = 2 * (10 + AXIS_LABEL_GAP);

    expect(plotArea.left).toBe(FRAME.left + 20 + AXIS_LABEL_GAP);
    expect(plotArea.right).toBe(400 - FRAME.right);
    expect(plotArea.top).toBe(FRAME.top + reservedRowsHeight);
    expect(plotArea.bottom).toBe(220 - FRAME.bottom - reservedRowsHeight);
  });

  it("widens the left reservation when the y-axis's own tick labels measure wider", () => {
    const narrow = computePlotArea({
      width: 400,
      height: 220,
      lineHeight: 10,
      yAxisLabelWidth: 10,
      frame: FRAME,
    });
    const wide = computePlotArea({
      width: 400,
      height: 220,
      lineHeight: 10,
      yAxisLabelWidth: 30,
      frame: FRAME,
    });

    expect(wide.left).toBeGreaterThan(narrow.left);
    expect(wide.left - narrow.left).toBe(20);
  });
});

const PLOT_AREA = computePlotArea({
  width: 400,
  height: 220,
  lineHeight: 10,
  yAxisLabelWidth: 20,
  frame: FRAME,
});

describe('barSlotWidth', () => {
  it('divides the plot area evenly across every bar', () => {
    expect(barSlotWidth(20, PLOT_AREA)).toBeCloseTo((PLOT_AREA.right - PLOT_AREA.left) / 20);
  });

  it('resolves to zero rather than dividing by zero when handed no bars', () => {
    expect(barSlotWidth(0, PLOT_AREA)).toBe(0);
  });
});

describe('barWidth', () => {
  it('draws each bar at BAR_WIDTH_RATIO of its own slot, narrower at a higher bar count', () => {
    const wide = barWidth(8, PLOT_AREA);
    const narrow = barWidth(20, PLOT_AREA);

    expect(wide).toBeCloseTo(barSlotWidth(8, PLOT_AREA) * BAR_WIDTH_RATIO);
    expect(narrow).toBeCloseTo(barSlotWidth(20, PLOT_AREA) * BAR_WIDTH_RATIO);
    expect(narrow).toBeLessThan(wide);
  });
});

describe('barX', () => {
  it("centres the first bar's own drawn width inside its own slot, not flush against the plot's own left edge", () => {
    const slotWidth = barSlotWidth(8, PLOT_AREA);
    const drawnWidth = barWidth(8, PLOT_AREA);

    expect(barX(0, 8, PLOT_AREA)).toBeCloseTo(PLOT_AREA.left + (slotWidth - drawnWidth) / 2);
  });

  it('places each later bar one slot width further right than the one before it', () => {
    const slotWidth = barSlotWidth(8, PLOT_AREA);

    for (let index = 1; index < 8; index++) {
      expect(barX(index, 8, PLOT_AREA) - barX(index - 1, 8, PLOT_AREA)).toBeCloseTo(slotWidth);
    }
  });
});

describe('barHeightPx', () => {
  it("draws a bar at its own value's fraction of the axis upper bound", () => {
    const plotHeight = PLOT_AREA.bottom - PLOT_AREA.top;

    expect(barHeightPx(0, 100, PLOT_AREA)).toBe(0);
    expect(barHeightPx(50, 100, PLOT_AREA)).toBeCloseTo(plotHeight * 0.5);
    expect(barHeightPx(100, 100, PLOT_AREA)).toBeCloseTo(plotHeight);
  });

  it('clamps a value outside [0, upperBound] rather than drawing past the plot', () => {
    expect(barHeightPx(-10, 100, PLOT_AREA)).toBe(0);
    expect(barHeightPx(150, 100, PLOT_AREA)).toBeCloseTo(PLOT_AREA.bottom - PLOT_AREA.top);
  });

  it('resolves to zero rather than dividing by zero when the axis upper bound is zero', () => {
    expect(barHeightPx(0, 0, PLOT_AREA)).toBe(0);
  });
});

describe('barY', () => {
  it("grows every bar upward from the same baseline, the plot area's own bottom edge", () => {
    expect(barY(0, 100, PLOT_AREA)).toBeCloseTo(PLOT_AREA.bottom);
    expect(barY(100, 100, PLOT_AREA)).toBeCloseTo(PLOT_AREA.top);
  });
});
