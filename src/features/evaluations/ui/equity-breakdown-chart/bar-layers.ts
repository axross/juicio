import type { PointsArray } from 'victory-native';

/**
 * the pure decision behind `equity-breakdown-chart.tsx`'s one-`<Bar>`-per-bar
 * layering (issue #102, review round 1, finding 1): given the full points
 * array Victory Native's `CartesianChart` hands its `children` render prop
 * and this bar count's own colour ramp (`../../model/band-color.ts`'s
 * `barColors`), which single point and which single colour each `<Bar>`
 * layer gets. Kept free of Victory Native's own rendering — this module
 * hands back plain data, never a `Bar` element — so it is unit-testable
 * without Skia or Victory Native, neither of which is exercisable under this
 * project's Jest setup (docs/conventions/testing.md).
 *
 * **replaces a zero-height hiding trick that never hid anything.** A prior
 * revision passed every layer the *whole* `points.count` array, with every
 * point but its own remapped to `{ ...entry, y: 0 }`, meaning to hide the
 * other 7–19 bars that layer's own single colour would otherwise paint.
 * `y` is already a **pixel** coordinate by the time `CartesianChart` hands
 * points to `children` (`node_modules/victory-native/src/cartesian/
 * CartesianChart.tsx`'s own `_tData.y[key].o[i]`), and
 * `getVerticalBarRect.ts` builds a rect straight from it —
 * `{ y, height: baselineY - y }` — so `y: 0` sits at the canvas's own top
 * and produces a **full-height** bar, not a hidden one. Every layer was
 * therefore drawing one correct bar plus every other bar full-height in its
 * own colour, with the last layer drawn painting over every earlier one.
 *
 * **the fix Victory Native documents for exactly this case** — see
 * https://nearform.com/open-source/victory-native/docs/cartesian/guides/custom-bars/ —
 * is a single-element `points` array per `<Bar>`, paired with an explicit
 * `barCount` so `getBarThickness` (`node_modules/victory-native/src/
 * cartesian/utils/getBarThickness.ts`) still sizes the bar from the *real*
 * bar count rather than from a one-element array's own length. This module
 * is only the first half of that — which point and which colour a bar's own
 * layer gets; `equity-breakdown-chart.tsx` is what additionally passes
 * `barCount={points.count.length}` on every `<Bar>` — the length of the
 * full array `CartesianChart` handed it, not of the one-element array this
 * module builds for that layer.
 */
export type BarLayer = {
  readonly points: PointsArray;
  readonly color: string;
};

/**
 * one layer per entry in `points`, each carrying exactly that entry — never
 * the full array, zeroed or otherwise — and `colors[i]`, so a bar's own
 * layer can only ever paint its own rect. `colors` is assumed already in
 * ramp order and the same length as `points`; both are true of every real
 * caller (`points.count` and `barColors(barCount, …)` share `barCount` as
 * their common length).
 */
export function barLayers(points: PointsArray, colors: readonly string[]): readonly BarLayer[] {
  return points.map((point, index) => ({ points: [point], color: colors[index] }));
}
