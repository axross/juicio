import '@/core/theme/unistyles';

import { render } from '@testing-library/react-native';

import { barHeightPx, barWidth, barX, barY, computePlotArea } from './geometry';
import { BarChart } from './bar-chart';

// `bar-chart.tsx` imports `react-native-reanimated` at module scope, which
// reaches into `react-native-worklets`' native module at load time and
// fails under Jest without both mocks — the same pair
// `equity-breakdown-chart.test.tsx` and `bottom-sheet.test.tsx` already
// carry for the identical reason. `require()` inside the factory, not a
// same-file `import`, per both libraries' own Jest guides.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// this suite needs more than the published mock's own `useSharedValue` and
// `withSpring` hand back: `mockSharedValueAssignments` below is what proves
// this component's own two transitions (entrance: zero-then-`withSpring`;
// update: `withSpring` alone, no zero reset) assign a shared value's own
// `.value` in the exact sequence its own doc comment describes — something
// no mocked `Rect`/`Text` prop, captured only once per render, could show on
// its own, since a shared-value assignment inside `useEffect` does not by
// itself trigger a React re-render under this mock any more than it does in
// the real runtime. Named with the `mock` prefix Jest requires of any
// variable a `jest.mock(...)` factory below closes over — Jest's own
// hoisting moves that factory's registration above this declaration, and
// only a `mock`-prefixed identifier is exempted from the "no out-of-scope
// variable" restriction that hoisting would otherwise make this reference.
let mockSharedValueAssignments: unknown[][] = [];

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = require('react-native-reanimated/mock');
  return {
    ...actual,
    useSharedValue: jest.fn((init: unknown) => {
      const box = { value: init };
      return {
        get value() {
          return box.value;
        },
        set value(next: unknown) {
          mockSharedValueAssignments.push(next as unknown[]);
          box.value = next;
        },
      };
    }),
    withSpring: jest.fn(actual.withSpring),
  };
});

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  useSharedValue: mockedUseSharedValue,
  withSpring: mockedWithSpring,
} = require('react-native-reanimated');
/* eslint-enable @typescript-eslint/no-require-imports */

// Skia is not exercisable under this project's Jest setup
// (docs/conventions/testing.md) — mocked at the module boundary. `Canvas`
// renders its own `children` (a plain React children prop) so `bar-chart.tsx`'s
// own `Bar` subcomponent — real code, not part of this mock — actually
// mounts underneath it and calls the mocked Reanimated hooks above and the
// mocked `Rect` below. `Line`/`Rect`/`Text` are leaf drawing primitives with
// nothing this suite reads back from their own render, so each is a
// `jest.fn` returning `null`, captured only for the props this project
// itself computed and handed them.
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: jest.fn((props: { children?: unknown }) => props.children ?? null),
  Line: jest.fn(() => null),
  Rect: jest.fn(() => null),
  Text: jest.fn(() => null),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  Canvas: MockedCanvas,
  Line: MockedLine,
  Rect: MockedRect,
  Text: MockedText,
} = require('@shopify/react-native-skia');
/* eslint-enable @typescript-eslint/no-require-imports */

// a fake `SkFont` — this suite never loads a real one
// (docs/conventions/testing.md's boundary), only asserts what this
// component hands to `Text`/`Rect` given one. `getSize` stands in for the
// axis label's own line height; `measureText` returns a width proportional
// to the label's own length, so two labels of different lengths reserve
// visibly different column widths — a property
// `equity-breakdown-chart.test.tsx`'s own `useFont` mock never needs to
// prove.
const FONT = {
  getSize: () => 10,
  measureText: (text: string) => ({ width: text.length * 6 }),
} as unknown as Parameters<typeof BarChart>[0]['font'];

const FRAME = { color: '#333333', top: 0, right: 0, bottom: 1, left: 1 };

function baseProps(overrides: Partial<Parameters<typeof BarChart>[0]> = {}) {
  return {
    bars: [
      { value: 10, color: '#111111' },
      { value: 20, color: '#222222' },
      { value: 5, color: '#444444' },
    ],
    valueAxisUpperBound: 20,
    width: 400,
    height: 220,
    font: FONT,
    labelColor: '#666666',
    frame: FRAME,
    xAxis: { startLabel: '0', endLabel: '100', title: 'Equity' },
    yAxis: { startLabel: '0', endLabel: '20', title: 'combos' },
    // `true` by default — every existing test in this file below predates
    // this prop and asserts against the entrance running immediately, the
    // behaviour this default preserves; the `hasFinishedOpening` describe
    // block further down is what overrides it to exercise the gate itself.
    hasFinishedOpening: true,
    ...overrides,
  };
}

describe('<BarChart />', () => {
  beforeEach(() => {
    mockSharedValueAssignments = [];
    MockedCanvas.mockClear();
    MockedLine.mockClear();
    MockedRect.mockClear();
    MockedText.mockClear();
    mockedUseSharedValue.mockClear();
    mockedWithSpring.mockClear();
  });

  it('draws one Rect per bar, in the order given', async () => {
    await render(<BarChart {...baseProps()} />);

    expect(MockedRect).toHaveBeenCalledTimes(3);
    expect(MockedRect.mock.calls.map((call: [{ color: string }]) => call[0].color)).toEqual([
      '#111111',
      '#222222',
      '#444444',
    ]);
  });

  it("derives each bar's own rectangle from its value, its index among the bar count, and the measured panel size", async () => {
    const props = baseProps();

    await render(<BarChart {...props} />);

    const plotArea = computePlotArea({
      width: props.width,
      height: props.height,
      lineHeight: FONT.getSize(),
      yAxisLabelWidth: Math.max(
        FONT.measureText(props.yAxis.startLabel).width,
        props.yAxis.endLabel !== undefined ? FONT.measureText(props.yAxis.endLabel).width : 0,
      ),
      frame: props.frame,
    });
    const barCount = props.bars.length;

    for (const [index, bar] of props.bars.entries()) {
      const [call] = MockedRect.mock.calls[index];
      expect(call.x).toBeCloseTo(barX(index, barCount, plotArea));
      expect(call.width).toBeCloseTo(barWidth(barCount, plotArea));
      // no `springConfig` is given by `baseProps()`, so every bar's own
      // shared-value seed is already its real target — see this
      // component's own doc comment on why that seed depends on whether a
      // spring config is given at all.
      expect(call.y.value).toBeCloseTo(barY(bar.value, props.valueAxisUpperBound, plotArea));
      expect(call.height.value).toBeCloseTo(
        barHeightPx(bar.value, props.valueAxisUpperBound, plotArea),
      );
    }
  });

  it('seeds every bar at zero, not at its real value, when a spring config is given (grows in from zero on mount)', async () => {
    await render(<BarChart {...baseProps({ springConfig: { duration: 320 } })} />);

    // the very first argument `useSharedValue` was ever constructed with —
    // this component's own render, before its mount effect has had a
    // chance to run at all.
    expect(mockedUseSharedValue.mock.calls[0][0]).toEqual([0, 0, 0]);
  });

  it('seeds every bar directly at its real value, never at zero, when no spring config is given (the reduced-motion case)', async () => {
    const props = baseProps();

    await render(<BarChart {...props} />);

    expect(mockedUseSharedValue.mock.calls[0][0]).toEqual(props.bars.map((bar) => bar.value));
  });

  it('assigns zero, then immediately calls withSpring toward the real targets, on mount', async () => {
    const props = baseProps({ springConfig: { duration: 320 } });

    await render(<BarChart {...props} />);

    const targets = props.bars.map((bar) => bar.value);
    expect(mockSharedValueAssignments).toEqual([[0, 0, 0], targets]);
    expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
  });

  it('assigns zero, then withSpring again, when the bar count changes — not merely when a value does', async () => {
    const props = baseProps({ springConfig: { duration: 320 } });
    const { rerender } = await render(<BarChart {...props} />);
    mockSharedValueAssignments = [];
    mockedWithSpring.mockClear();

    const widerBars = [
      { value: 1, color: '#111111' },
      { value: 2, color: '#222222' },
      { value: 3, color: '#333333' },
      { value: 4, color: '#444444' },
    ];
    await rerender(<BarChart {...props} bars={widerBars} />);

    const targets = widerBars.map((bar) => bar.value);
    expect(mockSharedValueAssignments).toEqual([[0, 0, 0, 0], targets]);
    expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
  });

  // issue #228: the entrance (mount, or a bar count change) holds at the
  // zero height it is already seeded at until `hasFinishedOpening` arrives,
  // rather than springing toward the real targets immediately — see this
  // prop's own doc comment.
  describe('hasFinishedOpening gate (issue #228)', () => {
    it('holds every bar at zero, with no withSpring call, on mount while hasFinishedOpening is false', async () => {
      const props = baseProps({ springConfig: { duration: 320 }, hasFinishedOpening: false });

      await render(<BarChart {...props} />);

      // the zero assignment from the entrance's own reset still happens —
      // this is the same visual state the entrance already starts from —
      // but nothing springs it further while the gate is closed.
      expect(mockSharedValueAssignments).toEqual([[0, 0, 0]]);
      expect(mockedWithSpring).not.toHaveBeenCalled();
    });

    it('springs toward the real targets, from the zero it is already holding at, once hasFinishedOpening turns true', async () => {
      const props = baseProps({ springConfig: { duration: 320 }, hasFinishedOpening: false });
      const { rerender } = await render(<BarChart {...props} />);
      mockSharedValueAssignments = [];

      await rerender(<BarChart {...props} hasFinishedOpening />);

      const targets = props.bars.map((bar) => bar.value);
      // no second zero reset here — the bars are already at zero from the
      // mount above; only the `withSpring` call this render finally reaches.
      expect(mockSharedValueAssignments).toEqual([targets]);
      expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
    });

    // the plan's own verification strategy names this scenario directly: a
    // bar count change (a fresh entrance of its own) reaching this
    // component while still waiting must not let a stale `withSpring` call
    // slip through — it stays held at whatever the *new* bar count's own
    // zero looks like until `hasFinishedOpening` arrives.
    it('keeps holding at the new zero when the bar count changes while still waiting for hasFinishedOpening', async () => {
      const props = baseProps({ springConfig: { duration: 320 }, hasFinishedOpening: false });
      const { rerender } = await render(<BarChart {...props} />);
      mockSharedValueAssignments = [];

      const widerBars = [
        { value: 1, color: '#111111' },
        { value: 2, color: '#222222' },
        { value: 3, color: '#333333' },
        { value: 4, color: '#444444' },
      ];
      await rerender(<BarChart {...props} bars={widerBars} />);

      expect(mockSharedValueAssignments).toEqual([[0, 0, 0, 0]]);
      expect(mockedWithSpring).not.toHaveBeenCalled();

      mockSharedValueAssignments = [];
      await rerender(<BarChart {...props} bars={widerBars} hasFinishedOpening />);

      const targets = widerBars.map((bar) => bar.value);
      expect(mockSharedValueAssignments).toEqual([targets]);
      expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
    });

    // a same-bar-count render (a live-update tick) landing before
    // `hasFinishedOpening` arrives must keep holding at zero rather than
    // springing — matching the bar count of the render just before it is
    // not, on its own, licence to spring; only a render that actually
    // reads `hasFinishedOpening` as `true` is.
    it('keeps holding at zero through a same-bar-count update reached before hasFinishedOpening, then springs once it turns true', async () => {
      const props = baseProps({ springConfig: { duration: 320 }, hasFinishedOpening: false });
      const { rerender } = await render(<BarChart {...props} />);
      mockSharedValueAssignments = [];

      const liveUpdateBars = [
        { value: 9, color: '#111111' },
        { value: 4, color: '#222222' },
        { value: 7, color: '#333333' },
      ];
      await rerender(<BarChart {...props} bars={liveUpdateBars} />);

      expect(mockedWithSpring).not.toHaveBeenCalled();
      expect(mockSharedValueAssignments).toEqual([]);

      await rerender(<BarChart {...props} bars={liveUpdateBars} hasFinishedOpening />);

      const targets = liveUpdateBars.map((bar) => bar.value);
      expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
      expect(mockSharedValueAssignments).toEqual([targets]);
    });

    // the live-update transition (a stable bar count, a changed value) is
    // untouched by this gate — the plan's own Non-goals name it explicitly.
    // Reached here with `hasFinishedOpening` still `false`, on purpose: an
    // update in practice only ever happens once the sheet is already open
    // (`hasFinishedOpening` already `true` by then), but this proves the
    // update path itself reads no signal from this prop at all, rather than
    // happening to pass only because the two states usually coincide.
    it('still springs a same-bar-count update immediately, ignoring hasFinishedOpening entirely', async () => {
      const props = baseProps({ springConfig: { duration: 320 }, hasFinishedOpening: true });
      const { rerender } = await render(<BarChart {...props} />);
      mockSharedValueAssignments = [];
      mockedWithSpring.mockClear();

      const changedBars = [
        { value: 15, color: '#111111' },
        { value: 1, color: '#222222' },
        { value: 8, color: '#444444' },
      ];
      await rerender(<BarChart {...props} bars={changedBars} hasFinishedOpening={false} />);

      const targets = changedBars.map((bar) => bar.value);
      expect(mockSharedValueAssignments).toEqual([targets]);
      expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
    });

    // the Reduced Motion path (no `springConfig`) is untouched too — the
    // plan's own Non-goals name it explicitly: there is no entrance
    // transition here for this gate to hold back at all.
    it('assigns every height directly regardless of hasFinishedOpening when no spring config is supplied', async () => {
      const props = baseProps({ hasFinishedOpening: false });

      await render(<BarChart {...props} />);

      expect(mockedWithSpring).not.toHaveBeenCalled();
      expect(mockSharedValueAssignments).toEqual([props.bars.map((bar) => bar.value)]);
    });
  });

  it('calls withSpring directly from the current heights, with no zero reset, when only values change at a stable bar count', async () => {
    const props = baseProps({ springConfig: { duration: 320 } });
    const { rerender } = await render(<BarChart {...props} />);
    mockSharedValueAssignments = [];
    mockedWithSpring.mockClear();

    const changedBars = [
      { value: 15, color: '#111111' },
      { value: 1, color: '#222222' },
      { value: 8, color: '#444444' },
    ];
    await rerender(<BarChart {...props} bars={changedBars} />);

    const targets = changedBars.map((bar) => bar.value);
    // exactly one assignment — the `withSpring` result — never a zero
    // reset first, which is what would make this indistinguishable from a
    // second entrance.
    expect(mockSharedValueAssignments).toEqual([targets]);
    expect(mockedWithSpring).toHaveBeenCalledWith(targets, props.springConfig);
  });

  it('assigns every height directly, with no withSpring call at all, when no spring config is supplied — on mount and on every later change', async () => {
    const props = baseProps();
    const { rerender } = await render(<BarChart {...props} />);

    expect(mockedWithSpring).not.toHaveBeenCalled();
    expect(mockSharedValueAssignments).toEqual([props.bars.map((bar) => bar.value)]);

    mockSharedValueAssignments = [];
    const changedBars = [
      { value: 1, color: '#111111' },
      { value: 2, color: '#222222' },
      { value: 3, color: '#444444' },
    ];
    await rerender(<BarChart {...props} bars={changedBars} />);

    expect(mockedWithSpring).not.toHaveBeenCalled();
    expect(mockSharedValueAssignments).toEqual([changedBars.map((bar) => bar.value)]);
  });

  it('draws only the given frame sides, at their own given widths and colour', async () => {
    await render(
      <BarChart
        {...baseProps({ frame: { color: '#abcdef', top: 0, right: 0, bottom: 2, left: 3 } })}
      />,
    );

    expect(MockedLine).toHaveBeenCalledTimes(2);
    for (const call of MockedLine.mock.calls) {
      expect(call[0].color).toBe('#abcdef');
    }
    const widths = MockedLine.mock.calls.map(
      (call: [{ strokeWidth: number }]) => call[0].strokeWidth,
    );
    expect(widths.sort()).toEqual([2, 3]);
  });

  it("draws all four frame sides when given all four, since bottom-and-left-only is the caller's own configuration", async () => {
    await render(
      <BarChart
        {...baseProps({ frame: { color: '#abcdef', top: 1, right: 1, bottom: 1, left: 1 } })}
      />,
    );

    expect(MockedLine).toHaveBeenCalledTimes(4);
  });

  it('draws no frame side at all when every width is zero', async () => {
    await render(
      <BarChart
        {...baseProps({ frame: { color: '#abcdef', top: 0, right: 0, bottom: 0, left: 0 } })}
      />,
    );

    expect(MockedLine).not.toHaveBeenCalled();
  });

  it("draws exactly the six given axis labels — both axes' own start label, end label, and title — and nothing else", async () => {
    const props = baseProps();

    await render(<BarChart {...props} />);

    const drawnTexts = MockedText.mock.calls.map((call: [{ text: string }]) => call[0].text);
    expect(drawnTexts.sort()).toEqual(
      [
        props.xAxis.startLabel,
        props.xAxis.endLabel,
        props.xAxis.title,
        props.yAxis.startLabel,
        props.yAxis.endLabel,
        props.yAxis.title,
      ].sort(),
    );
  });

  it('draws only five labels, omitting the combos axis end label, when yAxis.endLabel is undefined', async () => {
    const props = baseProps({ yAxis: { startLabel: '0', title: 'combos' } });

    await render(<BarChart {...props} />);

    const drawnTexts = MockedText.mock.calls.map((call: [{ text: string }]) => call[0].text);
    expect(drawnTexts.sort()).toEqual(
      [props.xAxis.startLabel, props.xAxis.endLabel, props.xAxis.title, '0', 'combos'].sort(),
    );
  });

  it('draws every axis label in the given label colour, with the given font', async () => {
    const props = baseProps();

    await render(<BarChart {...props} />);

    for (const call of MockedText.mock.calls) {
      expect(call[0].color).toBe(props.labelColor);
      expect(call[0].font).toBe(props.font);
    }
  });

  it("merges the caller's own style last, after this component's own width/height, onto its own Canvas root, and forwards other rest props there too", async () => {
    const props = baseProps();

    await render(
      <BarChart {...props} style={{ opacity: 0.5 }} testID="equity-breakdown-bar-chart" />,
    );

    const [call] = MockedCanvas.mock.calls;
    expect(call[0].style).toEqual([{ width: props.width, height: props.height }, { opacity: 0.5 }]);
    expect(call[0].testID).toBe('equity-breakdown-bar-chart');
  });
});
