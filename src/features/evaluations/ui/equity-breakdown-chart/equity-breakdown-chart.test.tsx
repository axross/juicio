import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { darkTheme, lightTheme } from '@/core/theme/tokens';

import {
  chooseBarCount,
  combosAxisUpperBound,
  foldEquityBins,
  MINIMUM_BAR_PITCH,
} from '../../model/equity-breakdown';
import { EquityBreakdownChart } from './equity-breakdown-chart';

// this component now imports `@/core/motion/tokens` (issue #197), which
// imports `react-native-reanimated` at module scope regardless of whether
// this suite ever exercises an actual animation — that import alone reaches
// into `react-native-worklets`' native module at load time and fails under
// Jest without both mocks, the same pair `bottom-sheet.test.tsx` already
// carries for the same reason. `require()` inside the factory, not a
// same-file `import`, per both libraries' own Jest guides and that file's
// own doc comment on why the load order needs it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// `./bar-chart.tsx` is mocked wholesale at the module boundary — its own
// drawing and animation behaviour is `bar-chart.test.tsx`'s suite to cover
// (docs/conventions/testing.md), and its own pixel-geometry math is
// `geometry.test.ts`'s. What this suite reads back is exactly what this
// component hands `BarChart`: the folded bar values and colours, the value
// axis's own upper bound, the frame, the axis label text, and the spring
// config — the same boundary `equity-breakdown-chart.test.tsx` already drew
// around Victory Native and Skia before this change, moved to this
// project's own new primitive instead of a third-party one.
jest.mock('./bar-chart', () => ({
  BarChart: jest.fn(() => null),
}));

// `@shopify/react-native-skia` ships ESM that this project's
// `transformIgnorePatterns` does not transform, so importing it for real
// under Jest fails to parse before any test runs. The component reaches it
// for `useFont` alone, and what a test has to see is the asset and size
// this project asked for — not the `SkFont` a real font load would hand
// back, which is exactly the drawn-output side of the boundary
// docs/conventions/testing.md draws. The default return value stands in for
// the loaded-font case: every existing test below assumes a font is already
// present and does not itself exercise the loading (`null`) state, so the
// mock defaults to "loaded" and only the one loading-state test below
// overrides it.
jest.mock('@shopify/react-native-skia', () => ({
  useFont: jest.fn(() => ({ getSize: () => 0 })),
}));

// `usePrefersReducedMotion` resolves asynchronously and returns `false` on
// first render (`bottom-sheet.test.tsx`'s own comment on the same hook) —
// mocking it directly is what lets a test reach the reduced-motion branch
// synchronously, on the very first render, rather than racing a real
// `AccessibilityInfo` promise.
jest.mock('@/core/motion/use-prefers-reduced-motion');

/* eslint-disable @typescript-eslint/no-require-imports */
const { BarChart: MockedBarChart } = require('./bar-chart');
const { useFont: mockedUseFont } = require('@shopify/react-native-skia');
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);

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
// to `BarChart`.
const OTHER_DISTRIBUTION: readonly number[] = [
  20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

function lastBarChartProps() {
  return MockedBarChart.mock.calls[MockedBarChart.mock.calls.length - 1][0];
}

describe('<EquityBreakdownChart />', () => {
  beforeEach(() => {
    MockedBarChart.mockClear();
    mockedUseFont.mockClear();
    // reset every test to the "loaded" case explicitly, rather than relying
    // on `mockClear` (which does not touch a mock's return-value override):
    // the one loading-state test below sets `mockReturnValue(null)` for the
    // whole of its own run, since the component calls `useFont` again on
    // every re-render (`fireCanvasLayout` triggers one), and a `...Once`
    // override would only survive that render's first call.
    mockedUseFont.mockReturnValue({ getSize: () => 0 });
    mockedUsePrefersReducedMotion.mockReturnValue(false);
  });

  it('renders nothing to BarChart before its first layout measurement', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    expect(MockedBarChart).not.toHaveBeenCalled();
  });

  // issue #188 revision 2's own new acceptance criterion: `useFont` returns
  // `null` while its asset is still loading (or on load failure), and this
  // chart must draw nothing rather than a broken/unstyled frame in that
  // state — the same "draw nothing until ready" pattern the test above
  // already covers for `width === 0`, now also covering the font.
  it('renders nothing to BarChart while the axis font is still loading', async () => {
    mockedUseFont.mockReturnValue(null);

    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);
    fireCanvasLayout(401);

    expect(MockedBarChart).not.toHaveBeenCalled();
  });

  it('hands BarChart a value-axis upper bound no drawn bar ever exceeds', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 20 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { valueAxisUpperBound, bars } = lastBarChartProps();
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(foldEquityBins(SAMPLE_DISTRIBUTION, barCount));
    expect(valueAxisUpperBound).toBe(expectedMax);
    // no drawn bar is ever taller than the axis it is drawn against — the
    // property issue #102's revised plan actually asks for, not merely
    // that some upper bound was supplied.
    for (const bar of bars) {
      expect(bar.value).toBeLessThanOrEqual(expectedMax);
    }
  });

  it("recomputes the value axis's own upper bound when the bar count changes", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowMax = lastBarChartProps().valueAxisUpperBound;

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideMax = lastBarChartProps().valueAxisUpperBound;

    // the placeholder distribution's own fold concentrates more of the
    // same fixed total into fewer bins, so 8 bars need a taller axis than
    // 20 do — this is not merely "the two differ," it is which direction.
    expect(narrowMax).toBeGreaterThan(wideMax);
  });

  it('hands BarChart exactly as many bars as chooseBarCount resolves the drawing width to', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    const { bars } = lastBarChartProps();
    expect(bars).toHaveLength(chooseBarCount(measuredWidth));
  });

  it('re-renders with a new bar count when the measured width crosses a boundary', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowBarCount = lastBarChartProps().bars.length;

    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideBarCount = lastBarChartProps().bars.length;

    expect(narrowBarCount).toBe(8);
    expect(wideBarCount).toBe(20);
    expect(wideBarCount).toBeGreaterThan(narrowBarCount);
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

      expect(lastBarChartProps().bars).toHaveLength(expectedBarCount);
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

    expect(lastBarChartProps().bars).toHaveLength(20);
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
  // `BarChart`, and nothing about what `BarChart` then draws from it — the
  // boundary docs/conventions/testing.md states. The rules, the tick
  // labels and the axis names are all painted into a Skia canvas the
  // runner replaces with a stand-in, so there is no drawn output here to
  // assert even if the boundary allowed it.

  it('hands BarChart all four frame widths, bottom and left only, at the axis rule width', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { frame } = lastBarChartProps();
    // all four, deliberately: an omitted side is `BarChart`'s own decision
    // to make, not this component's — see this component's own doc
    // comment.
    expect(frame).toEqual({
      color: expect.any(String),
      top: 0,
      right: 0,
      bottom: lightTheme.borderWidth.base,
      left: lightTheme.borderWidth.base,
    });
  });

  it('hands BarChart a frame colour in the role that clears the non-text contrast floor on a neutral ground', async () => {
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
    const { frame } = lastBarChartProps();
    expect([
      lightTheme.colors.border.neutral.unselectedControl,
      darkTheme.colors.border.neutral.unselectedControl,
    ]).toContain(frame.color);
    // the three ramp steps this must not regress to, weakest first.
    for (const step of ['subtle', 'interactive', 'hovered'] as const) {
      expect([
        lightTheme.colors.border.neutral[step],
        darkTheme.colors.border.neutral[step],
      ]).not.toContain(frame.color);
    }
  });

  it("names each axis through BarChart's own title text, in this project's own copy", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis, yAxis } = lastBarChartProps();
    expect(xAxis.title).toBe('Equity');
    expect(yAxis.title).toBe('combos');
  });

  it('labels the equity axis at its two fixed ends, 0 and 100, and nothing else', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { xAxis } = lastBarChartProps();
    expect(xAxis.startLabel).toBe('0');
    expect(xAxis.endLabel).toBe('100');
  });

  it('labels the combos axis at its own computed upper bound, not a fixed figure', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    const measuredWidth = 8 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(measuredWidth)),
    );

    const { yAxis } = lastBarChartProps();
    expect(yAxis.startLabel).toBe('0');
    expect(yAxis.endLabel).toBe(String(expectedMax));
  });

  it("hands BarChart the neutral text role the rest of the chart's annotation takes as the label colour", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const { labelColor } = lastBarChartProps();
    expect([lightTheme.colors.text.neutral.low, darkTheme.colors.text.neutral.low]).toContain(
      labelColor,
    );
  });

  // the maintainer's own on-device pass over PR #116's preview build found
  // both axis labels reading too large at `caption`, and this component's
  // own size must not drift back there. A Skia font takes a size rather
  // than a text style, so `chartAxisLabel`'s own `fontSize` is what reaches
  // it — the type scale stays the single source of the number either way.
  it("builds its tick-label font at the chart axis type role's own size", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    // the second argument is `useFont`'s own size parameter
    // (`node_modules/@shopify/react-native-skia`'s `useFont(font, size,
    // onError)`); the first is whatever `require(...)` resolves the bundled
    // `InnovatorGrotesk-Regular.otf` asset reference to, and the third is
    // this component's own `onError` reporter — this test does not pin
    // either further, only that a size was passed through in position two.
    expect(mockedUseFont).toHaveBeenCalledWith(
      expect.anything(),
      lightTheme.typography.chartAxisLabel.fontSize,
      expect.any(Function),
    );
  });

  it('hands BarChart the loaded font, once, for both axes to share', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    expect(lastBarChartProps().font).toBeDefined();
  });

  // issue #138: this component now folds the acting player's own real
  // `EspadaEquityPlayerResult.distribution`, not one shape shared by every
  // player — these are the tests that shape of change actually asks for,
  // per that issue's own verification strategy: that a real per-player
  // breakdown folds correctly, and that two different ones draw two
  // different sets of bars.
  it('folds two different distributions to two different sets of bar values', async () => {
    const { rerender } = await render(
      <EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />,
    );
    fireCanvasLayout(401);
    const sampleValues = lastBarChartProps().bars.map((bar: { value: number }) => bar.value);

    await rerender(<EquityBreakdownChart distribution={OTHER_DISTRIBUTION} testID="chart" />);
    const otherValues = lastBarChartProps().bars.map((bar: { value: number }) => bar.value);

    expect(otherValues).not.toEqual(sampleValues);
  });

  // issue #138's own functional requirements: if the acting player's
  // result is unavailable while the sheet stays open, the histogram draws
  // no bars rather than a stale or fabricated shape — never
  // `SAMPLE_DISTRIBUTION` or any other player's own real data.
  it('hands BarChart every bar at zero value, and a zero upper bound, when distribution is null (the result is unavailable)', async () => {
    await render(<EquityBreakdownChart distribution={null} testID="chart" />);

    fireCanvasLayout(401);

    const { bars, valueAxisUpperBound } = lastBarChartProps();
    expect(valueAxisUpperBound).toBe(0);
    for (const bar of bars) {
      expect(bar.value).toBe(0);
    }
  });

  // issue #208: this component no longer stages `distribution` through any
  // lagged state of its own — `./bar-chart.tsx` is what grows the bars in
  // from zero now (`bar-chart.test.tsx`'s own suite covers that mechanism
  // directly). What this component still owns is handing `BarChart` the
  // real, current distribution's own folded values immediately, on the
  // very first call once the render guard clears — never a zero-seeded
  // stand-in of its own first.
  it('hands BarChart the real distribution directly on its very first call, with no staged zero-height stand-in of its own', async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    const firstCallValues = MockedBarChart.mock.calls[0][0].bars.map(
      (bar: { value: number }) => bar.value,
    );
    expect(firstCallValues).toEqual(foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(401)));
  });

  // issue #197's own verification strategy, moved to this new boundary:
  // every open reads this project's shared movement spring, never a
  // bespoke local curve — `./bar-chart.tsx`'s own doc comment states what
  // it does with this config (grows in from zero on mount and on a bar
  // count change; eases directly otherwise); this component's own job is
  // only to hand it in, or not to, correctly.
  it("hands BarChart this project's own movement spring as springConfig when the OS does not prefer reduced motion", async () => {
    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);

    fireCanvasLayout(401);

    expect(lastBarChartProps().springConfig).toEqual(motionSpringConfig);
  });

  // reduced motion collapses every bar's own transition to an immediate,
  // correct height — `./bar-chart.tsx`'s own doc comment states that an
  // `undefined` `springConfig` draws every bar directly, with no animation
  // call at all, so omitting it entirely is what this component asks for
  // rather than a zero-duration animation config of its own.
  it('hands BarChart no springConfig at all when the OS prefers reduced motion', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);

    await render(<EquityBreakdownChart distribution={SAMPLE_DISTRIBUTION} testID="chart" />);
    fireCanvasLayout(401);

    expect(lastBarChartProps().springConfig).toBeUndefined();
  });
});
