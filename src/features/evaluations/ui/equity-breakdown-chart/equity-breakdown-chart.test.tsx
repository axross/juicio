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
import { bandEquityBinCounts, totalEquityBinCounts } from '../../model/strength-band';
import type { StrengthBand } from '../../model/strength-band';
import { EquityBreakdownChart } from './equity-breakdown-chart';

// this component imports `@/core/motion/tokens`, which
// imports `react-native-reanimated` at module scope regardless of whether
// this suite ever exercises an actual animation — that import alone reaches
// into `react-native-worklets`' native module at load time and fails under
// Jest without both mocks, the same pair `bottom-sheet.test.tsx` already
// carries for the same reason. `require()` inside the factory, not a
// same-file `import`, per both libraries' own Jest guides and that file's
// own doc comment on why the load order needs it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// `withSpring` and `withRepeat` are wrapped as spies, kept otherwise
// identical to the published mock — this suite needs to observe whether
// `./bar-chart.tsx`'s own mount effect called `withSpring` at all, and with
// which config, for the two tests below that assert on `springConfig`'s own
// pass-through and the reduced-motion resolve-timing race neither can
// observe by reading a rendered `<Rect>`'s own height (see the race test's
// own comment for why); `withRepeat` the same way for the loading caption's
// own breathing loop (`CalculatingCaption`, `./equity-breakdown-chart.tsx`),
// the same "spy on the loop call, since the mock's own `withRepeat`/
// `withTiming` resolve synchronously to one fixed value with no loop to read
// back" reason `../new-player-fab/new-player-fab.test.tsx`'s own resting
// glow suite already gives for its identical spy.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = require('react-native-reanimated/mock');
  return {
    ...actual,
    withSpring: jest.fn(actual.withSpring),
    withRepeat: jest.fn(actual.withRepeat),
  };
});

// `./bar-chart.tsx` is this project's own component, not a
// third-party library — it renders for real here, the same way any other
// first-party component with a reachable rendered observable does
// (docs/conventions/testing.md's own guardrail: mocking a library wholesale
// to inspect its captured props is a narrower permission than the general
// unit-testing rule, reserved for a library with no rendered observable at
// all under `jest-expo`; `BarChart` does have one, and `bar-chart.test.tsx`
// already proves it by rendering it the identical way). Only
// `@shopify/react-native-skia` itself — which has no rendered observable
// under `jest-expo` — is mocked wholesale, at the same primitives
// `bar-chart.test.tsx` mocks for the identical reason: `Canvas` renders its
// own `children` so `BarChart`'s real render tree actually mounts
// underneath it, and `Line`/`Rect`/`Text` are leaf drawing primitives this
// suite reads the captured props of.
jest.mock('@shopify/react-native-skia', () => ({
  useFont: jest.fn(),
  Canvas: jest.fn((props: { children?: unknown }) => props.children ?? null),
  Line: jest.fn(() => null),
  Rect: jest.fn(() => null),
  Text: jest.fn(() => null),
}));

// `usePrefersReducedMotion` resolves asynchronously and returns `false` on
// first render (`bottom-sheet.test.tsx`'s own comment on the same hook) —
// mocking it directly is what lets a test reach the reduced-motion branch
// synchronously, on the very first render, rather than racing a real
// `AccessibilityInfo` promise.
jest.mock('@/core/motion/use-prefers-reduced-motion');

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  useFont: mockedUseFont,
  Canvas: MockedCanvas,
  Line: MockedLine,
  Rect: MockedRect,
  Text: MockedText,
} = require('@shopify/react-native-skia');
const {
  withSpring: mockedWithSpring,
  withRepeat: mockedWithRepeat,
} = require('react-native-reanimated');
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedUsePrefersReducedMotion = jest.mocked(usePrefersReducedMotion);

// a fake `SkFont` — this suite never loads a real one
// (docs/conventions/testing.md's boundary), only asserts what `BarChart`
// draws given one. `getSize` stands in for the axis label's own line
// height; `measureText` returns a width proportional to a label's own
// length, matching `bar-chart.test.tsx`'s own fixture, since `BarChart` now
// calls both for real here too.
const FONT = {
  getSize: () => 10,
  measureText: (text: string) => ({ width: text.length * 6 }),
};

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

// a fixed 20-bin bell-shaped distribution shape — a reference this suite
// pins numeric expectations against (the specific `combosAxisUpperBound`
// figures below, among others) — turned into per-card-pair `equities`/
// `bands` via `cardPairsFromDistribution` below, since this component no
// longer reads a distribution directly.
const SAMPLE_DISTRIBUTION: readonly number[] = [
  1, 2, 4, 6, 8, 11, 14, 16, 18, 20, 19, 17, 15, 12, 9, 6, 4, 3, 2, 1,
];

// a second, deliberately different shape — every one of this player's own
// card pairs landing in one bin rather than spread bell-like across every
// bin — so a test can assert two different real results actually draw two
// different charts, not merely that some data was folded.
const OTHER_DISTRIBUTION: readonly number[] = [
  20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

// the fixed set of axis label strings that never vary with the
// distribution — `0` appears twice (both axes' own start label), so this
// suite reads it back with the drawn set's own duplicate intact rather than
// a `Set`, which would silently collapse the two into one.
const FIXED_AXIS_TEXTS = ['0', '0', '100', 'Equity', 'combos'];

/**
 * turns a 20-bin distribution shape into per-card-pair `equities`/`bands`
 * that fold back to the exact same 20 raw bin totals this component's own
 * `totalEquityBinCounts` (`../../model/strength-band.ts`) would compute —
 * every pair for bin `i` placed at that bin's own midpoint
 * `(i + 0.5) / distribution.length`, which `equityBinIndex`'s own
 * inclusive-upper-bound rule buckets straight back into bin `i`. Every pair
 * takes the same arbitrary band (`'marginal'`): nothing in this suite but
 * the "majority band bar colour" describe below reads colour, and a
 * uniform band keeps every other test's own bar-height totals the only
 * thing that varies with the shape handed in.
 */
function cardPairsFromDistribution(distribution: readonly number[]): {
  equities: readonly number[];
  bands: readonly StrengthBand[];
} {
  const equities: number[] = [];
  const bands: StrengthBand[] = [];
  distribution.forEach((count, binIndex) => {
    for (let i = 0; i < count; i++) {
      equities.push((binIndex + 0.5) / distribution.length);
      bands.push('marginal');
    }
  });
  return { equities, bands };
}

const SAMPLE_CARD_PAIRS = cardPairsFromDistribution(SAMPLE_DISTRIBUTION);
const OTHER_CARD_PAIRS = cardPairsFromDistribution(OTHER_DISTRIBUTION);

// exercises all four bands at four different counts (1, 2, 3, 4) — the
// accessibility-label test below reads each band's own count back out of
// the label, so a count that coincided across bands could pass even if two
// bands' own counts were silently swapped.
const ALL_BANDS_EQUITIES: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
const ALL_BANDS_BANDS: readonly StrengthBand[] = [
  'trash',
  'marginal',
  'marginal',
  'value',
  'value',
  'value',
  'nuts',
  'nuts',
  'nuts',
  'nuts',
];

// the equities/bands pair the "majority band bar colour" describe below
// classifies by hand against `equityBinIndex`'s own 20-slice rule — every
// one of these equities is picked to land in a raw bin this suite already
// knows the index of, so the expected majority per bin (below) can be
// worked out by hand rather than re-deriving `../../model/strength-band.ts`'s
// own logic inside the test.
const MAJORITY_EQUITIES: readonly number[] = [
  0.01,
  0.02, // bin 0: two `nuts` — an outright majority.
  0.06,
  0.07, // bin 1: one `value`, one `marginal` — a tie the stronger
  // band, `value`, must win.
  0.26, // bin 5: one `trash`.
];
const MAJORITY_BANDS: readonly StrengthBand[] = ['nuts', 'nuts', 'value', 'marginal', 'trash'];

describe('<EquityBreakdownChart />', () => {
  beforeEach(() => {
    MockedCanvas.mockClear();
    MockedLine.mockClear();
    MockedRect.mockClear();
    MockedText.mockClear();
    mockedUseFont.mockClear();
    mockedWithSpring.mockClear();
    mockedWithRepeat.mockClear();
    // reset every test to the "loaded" case explicitly, rather than relying
    // on `mockClear` (which does not touch a mock's return-value override):
    // the one loading-state test below sets `mockReturnValue(null)` for the
    // whole of its own run, since the component calls `useFont` again on
    // every re-render (`fireCanvasLayout` triggers one), and a `...Once`
    // override would only survive that render's first call.
    mockedUseFont.mockReturnValue(FONT);
    mockedUsePrefersReducedMotion.mockReturnValue(false);
  });

  it('renders nothing before its first layout measurement', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    // `BarChart`'s own root is a Skia `Canvas` — no call to the mocked
    // `Canvas` at all is what "renders nothing" now means, with `BarChart`
    // rendered for real rather than mocked at its own module boundary.
    expect(MockedCanvas).not.toHaveBeenCalled();
  });

  // `useFont` returns
  // `null` while its asset is still loading (or on load failure), and this
  // chart must draw nothing rather than a broken/unstyled frame in that
  // state — the same "draw nothing until ready" pattern the test above
  // already covers for `width === 0`, now also covering the font.
  it('renders nothing while the axis font is still loading', async () => {
    mockedUseFont.mockReturnValue(null);

    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );
    fireCanvasLayout(401);

    expect(MockedCanvas).not.toHaveBeenCalled();
  });

  it('hands exactly as many bars as chooseBarCount resolves the drawing width to', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);

    // one `<Rect>` per bar — `BarChart`'s own `Bar` subcomponent, real code
    // now that it is not mocked away.
    expect(MockedRect).toHaveBeenCalledTimes(chooseBarCount(measuredWidth));
  });

  it('re-renders with a new bar count when the measured width crosses a boundary', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(8 * MINIMUM_BAR_PITCH);
    const narrowBarCount = MockedRect.mock.calls.length;

    MockedRect.mockClear();
    fireCanvasLayout(20 * MINIMUM_BAR_PITCH);
    const wideBarCount = MockedRect.mock.calls.length;

    expect(narrowBarCount).toBe(8);
    expect(wideBarCount).toBe(20);
    expect(wideBarCount).toBeGreaterThan(narrowBarCount);
  });

  // the two phone widths that matter are 430pt (the
  // widest supported phone) and 320pt (the narrowest): each phone's
  // own screen width and the sheet's side padding hand the chart 401pt to
  // measure on the first and 291pt on the second. Both are measurements,
  // so they are fired as measurements here.
  it.each([
    [401, 20],
    [291, 12],
  ])(
    'folds to the bar count issue #102 asks for at the %ipt a supported phone actually measures',
    async (measuredWidth, expectedBarCount) => {
      await render(
        <EquityBreakdownChart
          equities={SAMPLE_CARD_PAIRS.equities}
          bands={SAMPLE_CARD_PAIRS.bands}
          testID="chart"
          isCalculating={false}
          hasFinishedOpening
        />,
      );

      fireCanvasLayout(measuredWidth);

      expect(MockedRect).toHaveBeenCalledTimes(expectedBarCount);
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
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(400.9);

    expect(MockedRect).toHaveBeenCalledTimes(20);
  });

  it("carries one accessibility label naming the resolved bar count, the drawn axis max, and each strength band's own live combo count, in the legend's own order, on the canvas alone", async () => {
    await render(
      <EquityBreakdownChart
        equities={ALL_BANDS_EQUITIES}
        bands={ALL_BANDS_BANDS}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    // 12 bars, whose own upper bound (40) differs from its own bar count
    // (12) — unlike 20 bars, where both numbers coincide and a
    // `toContain` assertion could pass without the max ever being wired
    // in at all.
    const measuredWidth = 12 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const barCount = chooseBarCount(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(
        totalEquityBinCounts(bandEquityBinCounts(ALL_BANDS_EQUITIES, ALL_BANDS_BANDS)),
        barCount,
      ),
    );

    const canvas = screen.getByTestId('canvas');
    const label = canvas.props.accessibilityLabel as string;
    expect(canvas.props.accessible).toBe(true);
    expect(label).toContain(String(barCount));
    expect(label).toContain(String(expectedMax));
    // `ALL_BANDS_BANDS`' own tally by `countStrengthBands` — one combo
    // count per band, asserted by its actual value rather than merely
    // present, so a band's own count cannot be silently swapped with
    // another's.
    expect(label).toContain('Trash: 1 combos');
    expect(label).toContain('Marginal: 2 combos');
    expect(label).toContain('Value: 3 combos');
    expect(label).toContain('Nuts: 4 combos');
    // the legend's own weakest-to-strongest order: Trash, Marginal, Value,
    // Nuts.
    expect(label.indexOf('Trash')).toBeLessThan(label.indexOf('Marginal'));
    expect(label.indexOf('Marginal')).toBeLessThan(label.indexOf('Value'));
    expect(label.indexOf('Value')).toBeLessThan(label.indexOf('Nuts'));
  });

  // nothing inside a Skia canvas reaches a screen reader, so this one
  // label is the whole of what the chart says. It has to name which axis runs where, not only
  // the two figures above — which the axis labels themselves said back
  // when they were laid-out text.
  it('names both axes and the equity range in that same one label', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(12 * MINIMUM_BAR_PITCH);

    const label = screen.getByTestId('canvas').props.accessibilityLabel;
    expect(label).toContain('horizontal axis is equity');
    expect(label).toContain('vertical axis is card-pair count');
    expect(label).toContain('100');
  });

  it('hands BarChart all four frame widths, bottom and left only, at the axis rule width', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(401);

    // all four, deliberately: an omitted side is `BarChart`'s own decision
    // to make, not this component's — see this component's own doc
    // comment. Real rendering makes that decision observable directly: a
    // side handed `0` is a side `BarChart` never draws a `<Line>` for at
    // all, so exactly two lines (bottom, left) is what proves all four
    // widths reached it, not merely that a `frame` prop of some shape did.
    expect(MockedLine).toHaveBeenCalledTimes(2);
    const widths = MockedLine.mock.calls.map(
      (call: [{ strokeWidth: number }]) => call[0].strokeWidth,
    );
    // `borderWidth.base` is not theme-dependent (`core/theme/tokens.ts`),
    // so both drawn sides take the identical width regardless of which
    // theme renders under this suite.
    expect(widths).toEqual([lightTheme.borderWidth.base, lightTheme.borderWidth.base]);
  });

  it('hands BarChart a frame colour in the role that clears the non-text contrast floor on a neutral ground', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

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
    const colors = MockedLine.mock.calls.map((call: [{ color: string }]) => call[0].color);
    for (const color of colors) {
      expect([
        lightTheme.colors.border.neutral.unselectedControl,
        darkTheme.colors.border.neutral.unselectedControl,
      ]).toContain(color);
      // the three ramp steps this must not regress to, weakest first.
      for (const step of ['subtle', 'interactive', 'hovered'] as const) {
        expect([
          lightTheme.colors.border.neutral[step],
          darkTheme.colors.border.neutral[step],
        ]).not.toContain(color);
      }
    }
  });

  it("labels every axis exactly as this component's own copy and the drawn distribution ask for", async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    const measuredWidth = 8 * MINIMUM_BAR_PITCH;
    fireCanvasLayout(measuredWidth);
    const expectedMax = combosAxisUpperBound(
      foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(measuredWidth)),
    );

    const drawnTexts = MockedText.mock.calls.map((call: [{ text: string }]) => call[0].text);
    // the equity axis's own two fixed ends and title, the combos axis's own
    // fixed start and title, and the combos axis's own computed upper
    // bound — sorted, since draw order is `BarChart`'s own business, not
    // this component's.
    expect(drawnTexts.sort()).toEqual([...FIXED_AXIS_TEXTS, String(expectedMax)].sort());
  });

  it("hands BarChart the neutral text role the rest of the chart's annotation takes as the label colour, with the loaded font, for every axis label", async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(401);

    for (const call of MockedText.mock.calls) {
      expect([lightTheme.colors.text.neutral.low, darkTheme.colors.text.neutral.low]).toContain(
        call[0].color,
      );
      expect(call[0].font).toBe(FONT);
    }
  });

  // both axis labels must not drift back to reading too large at
  // `caption`. A Skia font takes a size rather
  // than a text style, so `chartAxisLabel`'s own `fontSize` is what reaches
  // it — the type scale stays the single source of the number either way.
  it("builds its tick-label font at the chart axis type role's own size", async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

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

  // this component folds the acting player's own real per-card-pair
  // `equities`/`bands`, not one shape shared by every player — these tests
  // assert: that a real per-player breakdown folds correctly, and that two
  // different ones draw two different charts. `SAMPLE_DISTRIBUTION` and
  // `OTHER_DISTRIBUTION` share the same maximum (`20`) by construction, so
  // their combos axis upper bounds coincide too — the per-bar rendered
  // heights are what actually differ between the two shapes, read under
  // reduced motion so every height is assigned directly with no spring in
  // flight to make the reading timing-dependent (this suite's own
  // reduced-motion race test above covers that timing separately).
  it('folds two different distributions to two different rendered bar heights', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);
    const { rerender } = await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );
    fireCanvasLayout(401);
    const sampleHeights = MockedRect.mock.calls.map(
      (call: [{ height: { value: number } }]) => call[0].height.value,
    );

    MockedRect.mockClear();
    await rerender(
      <EquityBreakdownChart
        equities={OTHER_CARD_PAIRS.equities}
        bands={OTHER_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );
    const otherHeights = MockedRect.mock.calls.map(
      (call: [{ height: { value: number } }]) => call[0].height.value,
    );

    expect(otherHeights).not.toEqual(sampleHeights);
  });

  // the functional requirement: if the acting player's
  // result is unavailable while the sheet stays open, the histogram draws
  // no bars rather than a stale or fabricated shape — never
  // `SAMPLE_DISTRIBUTION` or any other player's own real data. Every bar's
  // own rendered height is `0` regardless of `./bar-chart.tsx`'s own
  // entrance/update timing here: `geometry.ts`'s own `barHeightPx` returns
  // `0` whenever `valueAxisUpperBound <= 0`, for every `value` and at every
  // point in that timing, not only once an animation settles — so this is
  // safe to assert directly, unlike a genuinely animated height (the
  // reduced-motion race test below reads `withSpring`'s own calls instead,
  // for exactly that reason).
  it('draws every bar at zero height and a zero combos axis upper bound when equities/bands are null (the result is unavailable)', async () => {
    await render(
      <EquityBreakdownChart
        equities={null}
        bands={null}
        isCalculating={false}
        testID="chart"
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(401);

    // the combos axis's own end label is `0` here too, coinciding with the
    // two axes' own fixed start labels — a third `'0'` text is what proves
    // it, since the two fixed ones alone would already read `2` regardless
    // of whether the computed bound joined them.
    const drawnTexts: string[] = MockedText.mock.calls.map(
      (call: [{ text: string }]) => call[0].text,
    );
    expect(drawnTexts.filter((text) => text === '0')).toHaveLength(3);
    for (const call of MockedRect.mock.calls) {
      expect((call[0].height as { value: number }).value).toBe(0);
    }
  });

  // this component does not stage `equities`/`bands` through any lagged
  // state of its own — `./bar-chart.tsx` is what grows the bars in from
  // zero now (`bar-chart.test.tsx`'s own suite covers that mechanism
  // directly, including its own entrance-sequence assertions). What this
  // component still owns is handing `BarChart` the real, current
  // per-pair data's own folded values immediately, on the very first call
  // once the render guard clears — never a placeholder shape first. Read
  // through `withSpring`'s own first call, not a rendered `<Rect>`'s own
  // height: `BarChart`'s own entrance seeds that height at zero
  // deliberately (the animation itself), so the height a real device would
  // show partway through that spring is not this component's property to
  // assert — whether `BarChart`'s entrance targets the real data from the
  // very first call is.
  it('hands BarChart the real bar-height totals as its very first entrance target, with no placeholder shape of its own first', async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(401);

    const expectedTargets = foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(401));
    expect(mockedWithSpring).toHaveBeenCalledWith(expectedTargets, motionSpringConfig);
  });

  // every open reads this project's shared movement spring, never a
  // bespoke local curve — `./bar-chart.tsx`'s own doc comment states what
  // it does with this config (grows in from zero on mount and on a bar
  // count change; eases directly otherwise); this component's own job is
  // only to hand it in, or not to, correctly. Read through `withSpring`'s
  // own call, not a rendered prop: `BarChart` is real now, and nothing it
  // renders exposes `springConfig` back out directly.
  it("hands BarChart this project's own movement spring as springConfig when the OS does not prefer reduced motion", async () => {
    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    fireCanvasLayout(401);

    expect(mockedWithSpring).toHaveBeenCalledWith(expect.anything(), motionSpringConfig);
  });

  // issue #228: `hasFinishedOpening` is passed straight through to
  // `./bar-chart.tsx`'s own identically-named prop (this component's own
  // doc comment) — `bar-chart.test.tsx` covers that gate's own mechanics
  // directly; this is the one test at this boundary confirming the prop
  // this component is actually handed is the one that reaches `BarChart`,
  // read through `withSpring`'s own calls since `BarChart` is real here.
  it('holds the entrance at zero, with no withSpring call, until hasFinishedOpening arrives — then springs toward the real targets', async () => {
    const { rerender } = await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        isCalculating={false}
        testID="chart"
        hasFinishedOpening={false}
      />,
    );
    fireCanvasLayout(401);

    expect(mockedWithSpring).not.toHaveBeenCalled();

    await rerender(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    const expectedTargets = foldEquityBins(SAMPLE_DISTRIBUTION, chooseBarCount(401));
    expect(mockedWithSpring).toHaveBeenCalledWith(expectedTargets, motionSpringConfig);
  });

  // reduced motion collapses every bar's own transition to an immediate,
  // correct height — `./bar-chart.tsx`'s own doc comment states that an
  // `undefined` `springConfig` draws every bar directly, with no animation
  // call at all, so `withSpring` is never called at all in that case,
  // rather than called with a zero-duration config of its own.
  it('never calls withSpring at all when the OS prefers reduced motion', async () => {
    mockedUsePrefersReducedMotion.mockReturnValue(true);

    await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );
    fireCanvasLayout(401);

    expect(mockedWithSpring).not.toHaveBeenCalled();
  });

  // this component's own doc comment: `usePrefersReducedMotion()` resolves
  // asynchronously and reads `false` until it does, independently of
  // `BarChart`'s own mount gate (`width > 0 && axisFont`) — so a sheet open
  // whose layout measurement arrives before that resolution still mounts
  // `BarChart` with a real `springConfig`, starting a real spring toward
  // the real heights, before a later render corrects it to `undefined` and
  // `./bar-chart.tsx`'s own effect assigns the real heights directly
  // instead (an update, not a second entrance, since the bar count has not
  // changed). `withSpring` having already been called proves the race: the
  // same live, resolve-timing gap `@/core/motion/use-prefers-reduced-motion`
  // 's own doc comment already names for every other reader of that hook,
  // not one this component introduces.
  it('starts a real spring toward the real heights before reduced motion resolves, when the layout measurement wins the race', async () => {
    const { rerender } = await render(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );
    fireCanvasLayout(401);

    expect(mockedWithSpring).toHaveBeenCalledTimes(1);

    mockedUsePrefersReducedMotion.mockReturnValue(true);
    await rerender(
      <EquityBreakdownChart
        equities={SAMPLE_CARD_PAIRS.equities}
        bands={SAMPLE_CARD_PAIRS.bands}
        testID="chart"
        isCalculating={false}
        hasFinishedOpening
      />,
    );

    // the correction does not retroactively erase the spring that already
    // started — it only stops calling `withSpring` again from here on.
    expect(mockedWithSpring).toHaveBeenCalledTimes(1);
  });

  // docs/decisions/2026-09-04-colour-each-histogram-bar-by-its-majority-
  // strength-band.md: each bar's own flat colour is its bin's own majority
  // strength band, not a position on a continuous ramp. Read under reduced
  // motion, the same "no spring in flight" reason `'folds two different
  // distributions...'` above reads its own rendered heights under it — a
  // colour is assigned directly regardless of `springConfig`, but this
  // keeps every assertion in this describe reading the same settled
  // `<Rect>` calls with no further explanation needed. `fireCanvasLayout(401)`
  // resolves to exactly 20 bars, one per raw equity-bin index this suite
  // computes `MAJORITY_EQUITIES`/`MAJORITY_BANDS` against directly (see
  // that fixture's own comment) — `foldEquityBins` is a no-op at its own
  // input length (`../../model/equity-breakdown.test.ts`'s own
  // "is a no-op at the input length"), so bar index and raw bin index
  // coincide here with no folding ambiguity to reason through.
  describe('majority band bar colour', () => {
    beforeEach(() => {
      mockedUsePrefersReducedMotion.mockReturnValue(true);
    });

    it("colours each bar with its own bin's majority strength band, a tie broken by the stronger band", async () => {
      await render(
        <EquityBreakdownChart
          equities={MAJORITY_EQUITIES}
          bands={MAJORITY_BANDS}
          testID="chart"
          isCalculating={false}
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      const colors = MockedRect.mock.calls.map((call: [{ color: string }]) => call[0].color);
      // bin 0: two `nuts` pairs, an outright majority.
      expect(colors[0]).toBe(lightTheme.bands.nuts.solid);
      // bin 1: one `value`, one `marginal` — tied, so the stronger band
      // (`value`) wins.
      expect(colors[1]).toBe(lightTheme.bands.value.solid);
      // bin 5: one `trash` pair, an outright majority.
      expect(colors[5]).toBe(lightTheme.bands.trash.solid);
    });

    // `theme.bands.*.solid` is the same value in both themes for all four
    // bands (docs/conventions/design-system.md's "Equity Strength-Band
    // Colours": "Step 9 is the same value in the light and dark scale for
    // all four"), so asserting against `lightTheme` alone above already
    // pins the actual colour regardless of which theme this suite renders
    // under — this test only makes that invariant explicit, rather than
    // leaving it implicit in every other assertion above.
    it("draws the four bands' own solid fills identically in both themes", () => {
      expect(lightTheme.bands.nuts.solid).toBe(darkTheme.bands.nuts.solid);
      expect(lightTheme.bands.value.solid).toBe(darkTheme.bands.value.solid);
      expect(lightTheme.bands.marginal.solid).toBe(darkTheme.bands.marginal.solid);
      expect(lightTheme.bands.trash.solid).toBe(darkTheme.bands.trash.solid);
    });

    // the fix this stage makes: a bar's own height and its own colour now
    // fold the identical per-pair `equities`/`bands` (this component's own
    // doc comment), so a live equity landing exactly on a bin edge draws in
    // its own band's real colour — never the empty-bin fallback — and a bin
    // with no live pair at all draws no bar regardless of what colour it
    // would otherwise take.
    it('draws a live equity on a bin edge in its own band colour, and no bar for a bin with no live pair', async () => {
      // `0.05` is exactly `1 / 20` — `equityBinIndex`'s own
      // inclusive-upper-bound rule (`../../model/strength-band.ts`) buckets
      // it into bin 1, not bin 0, so this pins that boundary alongside the
      // colour.
      await render(
        <EquityBreakdownChart
          equities={[0.05]}
          bands={['nuts']}
          testID="chart"
          isCalculating={false}
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      // `height.value` is the bar's own drawn pixel height, not a raw
      // combo count (`./bar-chart.tsx`'s own geometry scales the count
      // against the combos axis's own upper bound) — this asserts the
      // live bin drew a nonzero bar and the empty one drew none, rather
      // than pinning a specific pixel figure.
      const heights = MockedRect.mock.calls.map(
        (call: [{ height: { value: number } }]) => call[0].height.value,
      );
      const colors = MockedRect.mock.calls.map((call: [{ color: string }]) => call[0].color);

      expect(heights[1]).toBeGreaterThan(0);
      expect(colors[1]).toBe(lightTheme.bands.nuts.solid);
      // bin 0 has no live pair at all — drawn at zero height regardless of
      // the empty-bin fallback colour it is handed.
      expect(heights[0]).toBe(0);
    });

    // the "no result" case (`equities`/`bands` both `null`) resolves every
    // bin's own majority to `null`, which falls back to a fixed colour —
    // never a crash, and never a colour that happens to vary by which bin
    // it is.
    it('falls back to one fixed colour for every bar when equities/bands are null (the result is unavailable)', async () => {
      await render(
        <EquityBreakdownChart
          equities={null}
          bands={null}
          isCalculating={false}
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      const colors = MockedRect.mock.calls.map((call: [{ color: string }]) => call[0].color);
      expect(new Set(colors).size).toBe(1);
    });
  });

  // issue #294: while the acting player's evaluation is still running, this
  // component renders the loading treatment — the empty axis frame, no
  // numeric combos-axis end label, and a breathing "Calculating" caption —
  // regardless of what `equities`/`bands` happen to carry, since a progress
  // tick's own buffers are now always-NaN throughout the run and
  // indistinguishable, by content alone, from a genuinely empty settled
  // result (this component's own doc comment on `isCalculating`).
  describe('isCalculating (issue #294)', () => {
    it('draws no bars while isCalculating is true, even with real equities/bands data', async () => {
      await render(
        <EquityBreakdownChart
          equities={SAMPLE_CARD_PAIRS.equities}
          bands={SAMPLE_CARD_PAIRS.bands}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      expect(MockedRect).not.toHaveBeenCalled();
    });

    it('omits the numeric combos axis end label while isCalculating is true, drawing only the six fixed axis texts', async () => {
      await render(
        <EquityBreakdownChart
          equities={SAMPLE_CARD_PAIRS.equities}
          bands={SAMPLE_CARD_PAIRS.bands}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      const drawnTexts = MockedText.mock.calls.map((call: [{ text: string }]) => call[0].text);
      expect(drawnTexts.sort()).toEqual([...FIXED_AXIS_TEXTS].sort());
    });

    it('shows a breathing "Calculating" caption with its own supporting line', async () => {
      await render(
        <EquityBreakdownChart
          equities={null}
          bands={null}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      expect(screen.getByTestId('calculating-label').props.children).toBe('Calculating');
      expect(screen.getByTestId('calculating-description').props.children).toBe(
        'The breakdown appears once this finishes.',
      );
    });

    it('renders no caption at all once isCalculating is false', async () => {
      await render(
        <EquityBreakdownChart
          equities={SAMPLE_CARD_PAIRS.equities}
          bands={SAMPLE_CARD_PAIRS.bands}
          isCalculating={false}
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      expect(screen.queryByTestId('calculating-label')).toBeNull();
    });

    it('uses a dedicated accessibility label while isCalculating is true, not the settled bar-count label', async () => {
      await render(
        <EquityBreakdownChart
          equities={SAMPLE_CARD_PAIRS.equities}
          bands={SAMPLE_CARD_PAIRS.bands}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      const label = screen.getByTestId('canvas').props.accessibilityLabel;
      expect(label).toBe(
        'Equity breakdown chart. Calculating — the breakdown appears once this finishes.',
      );
    });

    // mirrors `../new-player-fab/new-player-fab.test.tsx`'s own resting-glow
    // suite: the mock's own `withRepeat`/`withTiming` resolve synchronously
    // to one fixed value with no loop to read back, so this asserts the
    // *call* to `withRepeat` rather than any value it produces.
    it('starts the breathing loop via withRepeat while motion is not reduced', async () => {
      mockedUsePrefersReducedMotion.mockReturnValue(false);
      await render(
        <EquityBreakdownChart
          equities={null}
          bands={null}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      expect(mockedWithRepeat).toHaveBeenCalledWith(expect.anything(), -1, true);
    });

    it('freezes the caption instead of looping under reduced motion', async () => {
      mockedUsePrefersReducedMotion.mockReturnValue(true);
      await render(
        <EquityBreakdownChart
          equities={null}
          bands={null}
          isCalculating
          testID="chart"
          hasFinishedOpening
        />,
      );
      fireCanvasLayout(401);

      expect(mockedWithRepeat).not.toHaveBeenCalled();
    });
  });
});
