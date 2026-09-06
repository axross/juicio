import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { Canvas, Line, Rect, Text } from '@shopify/react-native-skia';
import type { SkFont } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withSpring } from 'react-native-reanimated';
import type { SharedValue, WithSpringConfig } from 'react-native-reanimated';

import {
  AXIS_LABEL_GAP,
  barHeightPx,
  barWidth,
  barX,
  barY,
  computePlotArea,
  type BarChartFrame,
  type PlotArea,
} from './geometry';

/**
 * a bar chart with no knowledge of poker or equity: drawn
 * directly on `@shopify/react-native-skia` canvas primitives, animated by
 * `react-native-reanimated` shared values this component writes to itself,
 * imperatively, rather than through any charting library's own black-box
 * `animate` prop. `equity-breakdown-chart.tsx` is this primitive's only
 * caller today — it hands this component the equity-specific bar values,
 * colours, and axis text, and this component knows nothing about what any
 * of that means.
 *
 * **replaces Victory Native's `CartesianChart`/`Bar`, not merely wraps
 * them** — see
 * docs/decisions/2026-09-04-drop-victory-native-for-a-hand-rolled-skia-bar-chart.md
 * for why. This component removes the dependency that decision found: the
 * two transitions below assign a shared value's own `.value` directly, in
 * one synchronous effect callback, which is Reanimated's own documented
 * idiom for "animate from a known starting value" and does not depend on any
 * second commit landing at all.
 *
 * **one shared value for every bar's own height, not one shared value per
 * bar** — an array, so a change in how many bars this component draws
 * changes what that one shared value holds, never how many Reanimated hooks
 * this component itself calls. Reading one bar's own current, animated
 * value back out — for that one bar's own drawn `<Rect>` — is `Bar`
 * below's own job, not this component's: `Bar` is its own small function
 * component, given the *whole* shared value plus its own `index`, so each
 * bar's own `useDerivedValue` call sits inside its own component instance
 * rather than inside a `.map()` in this component's own body, where the
 * number of iterations — and so the number of hook calls — would otherwise
 * vary with the bar count from one render to the next, exactly the
 * violation "how many hooks are called" above exists to avoid.
 *
 * **the pixel geometry is `./geometry.ts`'s own** — kept in a sibling
 * module free of both Skia and Reanimated so it is unit-testable directly,
 * per this file's own doc comment there.
 */
export function BarChart({
  bars,
  valueAxisUpperBound,
  width,
  height,
  font,
  labelColor,
  frame,
  xAxis,
  yAxis,
  springConfig,
  hasFinishedOpening,
  style,
  ...rest
}: ComponentProps<typeof Canvas> & {
  /** the ordered bars this chart draws, left to right — this component
   * reads nothing about what a bar's own `value` or `color` mean, only
   * that `value` sits inside `[0, valueAxisUpperBound]` and `color` is a
   * drawable Skia colour string. */
  readonly bars: readonly { readonly value: number; readonly color: string }[];
  /** the value axis's own upper bound — every bar's own height is drawn as
   * its `value`'s own fraction of this figure (`./geometry.ts`'s
   * `barHeightPx`). */
  readonly valueAxisUpperBound: number;
  /** the canvas's own pixel width and height — this component does not
   * measure its own layout; its caller already has (`onLayout`, in
   * `equity-breakdown-chart.tsx`'s own case) and hands the resolved figure
   * in, the same "no knowledge of anything outside its own props" split
   * every prop on this component keeps. */
  readonly width: number;
  readonly height: number;
  /** the Skia font every axis label and title is drawn with, already
   * loaded by the caller (`useFont`, `equity-breakdown-chart.tsx`) — this
   * component never loads a font itself, since a font's own asset and
   * fallback behaviour on load failure is a caller concern, not a generic
   * bar chart's. */
  readonly font: SkFont;
  /** the colour every axis label and title is drawn in. */
  readonly labelColor: string;
  /** the four frame-side stroke widths and their shared colour
   * (`./geometry.ts`'s `BarChartFrame`) — a side at `0` is not drawn at
   * all, so "bottom-and-left-only" is this chart's own caller's
   * configuration, never a rule this component enforces itself. */
  readonly frame: BarChartFrame;
  /** the value axis's (horizontal) own two end labels and title — this
   * component draws nothing at any other position along it, so a blank
   * interior tick falls out of what it is given rather than being
   * special-cased. */
  readonly xAxis: {
    readonly startLabel: string;
    readonly endLabel: string;
    readonly title: string;
  };
  /** the bar axis's (vertical) own two end labels and title — the same
   * contract as `xAxis` above, except `endLabel` is optional here: `equity-
   * breakdown-chart.tsx` omits it while its own upper bound has nothing to
   * compute from (a calculation still running — see that component's own
   * doc comment), and this component draws no `<Text>` for it at all in
   * that case, rather than drawing an invented or empty string. `xAxis`
   * keeps `endLabel` required, since its own two ends (`0`/`100`) are fixed
   * regardless of any data. */
  readonly yAxis: {
    readonly startLabel: string;
    readonly endLabel?: string;
    readonly title: string;
  };
  /** `undefined` draws every bar directly at its own target height, with no
   * animation call at all — kept here for the caller
   * (`equity-breakdown-chart.tsx`) that already omits it under reduced
   * motion. Given, every bar eases toward a changed value, and grows in
   * from zero on this component's own mount and again whenever the bar
   * count itself changes — see this file's own doc comment. */
  readonly springConfig?: WithSpringConfig;
  /** whether the entrance transition below is clear to actually run —
   * `false` holds every bar at the zero height it is already seeded at
   * (below) rather than springing toward its real value, so a caller whose
   * own container is still transitioning into view (`equity-breakdown-
   * chart.tsx`'s own doc comment, issue #228) can delay this component's
   * entrance until that transition finishes, without this component
   * needing to know anything about what that container is. Read only for
   * an *entrance* — a bar-count change reaching this component while still
   * `false` holds at zero exactly the same way a cold mount does, and
   * proceeds once this flips `true` — never for the live-update transition
   * (a stable bar count, one or more values changed), which keeps easing
   * immediately regardless, and never under reduced motion (`springConfig`
   * `undefined`), which has no entrance transition of its own for this to
   * gate at all. */
  readonly hasFinishedOpening: boolean;
}) {
  // this component's own root is a Skia `Canvas`, and `Canvas` is a real
  // single native view — `CanvasProps extends Omit<ViewProps, 'onLayout'>`
  // (`@shopify/react-native-skia`'s own `Canvas.d.ts`), the same `style`/
  // `testID`/rest-prop surface a plain `View` has. Unlike `GestureDetector`
  // (renders no native view of its own) or `PortalHost` (a context
  // provider), `Canvas` is exactly the kind of single native root
  // `docs/conventions/component-contracts.md`'s "Props Inherit the Root
  // Child Element's Own Props" rule means, so this component's own props
  // extend `ComponentProps<typeof Canvas>` and spread the caller's
  // remaining rest props onto it below, merging `style` last per
  // `docs/conventions/component-styling.md`.

  // the whole set of bars' own animated heights, one shared value rather
  // than one per bar — see this file's own doc comment. Seeded directly
  // from `bars`' own real values when no `springConfig` is given (the
  // reduced-motion case), so the very first frame this component ever
  // draws already shows the real heights with no zero-height flash at
  // all: the first commit a reduced-motion viewer ever sees must already
  // be correct, since nothing ever revisits it as an animation.
  const animatedValues = useSharedValue<number[]>(
    springConfig ? bars.map(() => 0) : bars.map((bar) => bar.value),
  );

  // tracks the *previous* bar count across renders, not the previous
  // values — this is what tells the effect below whether this render's own
  // commit is an entrance (this component's own mount, or a bar count
  // change) or an update (the same bar count, a changed value). `null`
  // stands for "no previous render," which is itself an entrance — every
  // mount runs the effect at least once, so this ref's own initial value
  // is read exactly once, on that first run, and never again.
  const previousBarCountRef = useRef<number | null>(null);

  // whether the *current* bar-count generation has actually started
  // springing toward its real targets yet — distinct from `isEntrance`
  // below, which only says whether this render's own bar count differs
  // from the last one. A generation stays held at zero across every render
  // this flag is `false` for, no matter how many same-count renders (a
  // live-update tick included) land while `hasFinishedOpening` is still
  // `false`; only the render that actually calls `withSpring` for this
  // generation sets it `true`, and a new generation (a bar count change)
  // resets it back to `false` for its own zero hold.
  const hasEntranceSpringStartedRef = useRef(false);

  useEffect(() => {
    const targets = bars.map((bar) => bar.value);
    const isEntrance =
      previousBarCountRef.current === null || previousBarCountRef.current !== bars.length;
    previousBarCountRef.current = bars.length;

    if (!springConfig) {
      // no animation at all — every bar's own height is assigned directly,
      // on both an entrance and an update.
      animatedValues.value = targets;
      return;
    }

    if (isEntrance) {
      // grows in from zero: assign every height to zero, then immediately
      // spring toward the real targets in this same callback — no second
      // React commit is what makes this fire reliably on every entrance,
      // not only a cold first one (this file's own doc comment).
      animatedValues.value = targets.map(() => 0);
      hasEntranceSpringStartedRef.current = false;
    }

    if (!hasEntranceSpringStartedRef.current && !hasFinishedOpening) {
      // held at the zero height this generation was seeded at above —
      // `hasFinishedOpening`'s own doc comment — until a later run of this
      // same effect reaches the `withSpring` call below and springs from
      // that zero toward whatever `targets` are current at that moment.
      // Read from the ref rather than `isEntrance` so a same-count render
      // reaching this generation before that later run (a live-update tick
      // arriving mid-open) still holds, instead of falling through as an
      // "update."
      return;
    }
    // this generation's entrance spring, or an update (same bar count,
    // changed values) — both reach this same call with no further zero
    // reset, the existing mid-calculation easing unchanged for the latter.
    hasEntranceSpringStartedRef.current = true;
    animatedValues.value = withSpring(targets, springConfig);
  }, [bars, springConfig, animatedValues, hasFinishedOpening]);

  const lineHeight = font.getSize();
  const yAxisLabelWidth = Math.max(
    font.measureText(yAxis.startLabel).width,
    yAxis.endLabel !== undefined ? font.measureText(yAxis.endLabel).width : 0,
  );
  const plotArea = computePlotArea({ width, height, lineHeight, yAxisLabelWidth, frame });
  const barCount = bars.length;

  return (
    <Canvas style={[{ width, height }, style]} {...rest}>
      {frame.left > 0 ? (
        <Line
          p1={{ x: plotArea.left, y: plotArea.top }}
          p2={{ x: plotArea.left, y: plotArea.bottom }}
          color={frame.color}
          strokeWidth={frame.left}
        />
      ) : null}
      {frame.bottom > 0 ? (
        <Line
          p1={{ x: plotArea.left, y: plotArea.bottom }}
          p2={{ x: plotArea.right, y: plotArea.bottom }}
          color={frame.color}
          strokeWidth={frame.bottom}
        />
      ) : null}
      {frame.top > 0 ? (
        <Line
          p1={{ x: plotArea.left, y: plotArea.top }}
          p2={{ x: plotArea.right, y: plotArea.top }}
          color={frame.color}
          strokeWidth={frame.top}
        />
      ) : null}
      {frame.right > 0 ? (
        <Line
          p1={{ x: plotArea.right, y: plotArea.top }}
          p2={{ x: plotArea.right, y: plotArea.bottom }}
          color={frame.color}
          strokeWidth={frame.right}
        />
      ) : null}

      {bars.map((bar, index) => (
        <Bar
          key={index}
          animatedValues={animatedValues}
          index={index}
          valueAxisUpperBound={valueAxisUpperBound}
          x={barX(index, barCount, plotArea)}
          width={barWidth(barCount, plotArea)}
          plotArea={plotArea}
          color={bar.color}
        />
      ))}

      {/* the value axis (vertical, left) — its own two end labels sit to
      the left of the frame's own vertical rule, and its title sits one
      whole row above its own top end label (`./geometry.ts`'s
      `computePlotArea` reserves two full rows above the plot for exactly
      these two lines). */}
      <Text
        x={plotArea.left - AXIS_LABEL_GAP - font.measureText(yAxis.startLabel).width}
        y={plotArea.bottom}
        text={yAxis.startLabel}
        font={font}
        color={labelColor}
      />
      {yAxis.endLabel !== undefined ? (
        <Text
          x={plotArea.left - AXIS_LABEL_GAP - font.measureText(yAxis.endLabel).width}
          y={frame.top + lineHeight * 2 + AXIS_LABEL_GAP}
          text={yAxis.endLabel}
          font={font}
          color={labelColor}
        />
      ) : null}
      <Text x={0} y={frame.top + lineHeight} text={yAxis.title} font={font} color={labelColor} />

      {/* the bar axis (horizontal, bottom) — its own two end labels sit
      directly below the frame's own horizontal rule, and its title sits
      one line further below that. */}
      <Text
        x={plotArea.left}
        y={plotArea.bottom + lineHeight}
        text={xAxis.startLabel}
        font={font}
        color={labelColor}
      />
      <Text
        x={plotArea.right - font.measureText(xAxis.endLabel).width}
        y={plotArea.bottom + lineHeight}
        text={xAxis.endLabel}
        font={font}
        color={labelColor}
      />
      <Text
        x={plotArea.right - font.measureText(xAxis.title).width}
        y={plotArea.bottom + lineHeight * 2 + AXIS_LABEL_GAP}
        text={xAxis.title}
        font={font}
        color={labelColor}
      />
    </Canvas>
  );
}

/**
 * one bar's own drawn rectangle, animated on the UI thread from
 * `animatedValues` — a separate function component, not a `.map()`
 * callback inside `BarChart` above's own body, specifically so this
 * component's own `useDerivedValue` call sits inside one component
 * instance per bar rather than inside a loop in `BarChart`'s own body,
 * where the number of iterations — and so the number of hook calls —
 * would vary with the bar count between renders (this file's own doc
 * comment above). A bar's own `x`/`width`/`color` do not need to be
 * animated at all — only `y`/`height` change once a bar exists, so those
 * three are handed in as plain numbers/strings, computed once per render
 * by `BarChart` above from `./geometry.ts`.
 */
function Bar({
  animatedValues,
  index,
  valueAxisUpperBound,
  x,
  width,
  plotArea,
  color,
}: {
  readonly animatedValues: SharedValue<number[]>;
  readonly index: number;
  readonly valueAxisUpperBound: number;
  readonly x: number;
  readonly width: number;
  readonly plotArea: PlotArea;
  readonly color: string;
}) {
  const height = useDerivedValue(() => {
    'worklet';
    const value = animatedValues.value[index] ?? 0;
    return barHeightPx(value, valueAxisUpperBound, plotArea);
  });
  const y = useDerivedValue(() => {
    'worklet';
    const value = animatedValues.value[index] ?? 0;
    return barY(value, valueAxisUpperBound, plotArea);
  });

  return <Rect x={x} y={y} width={width} height={height} color={color} />;
}
