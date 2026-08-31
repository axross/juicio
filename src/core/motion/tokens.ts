/**
 * this project's two motion characters. "Soft" (option C of PR #70's
 * motion exhibit, the maintainer's pick) is the default: roughly 320ms, a
 * gentle spring with a slight overshoot. "Quick" (option A of issue #83's
 * own motion exhibit) is the one exception, for a single surface that
 * changes too fast for Soft's own settle time to keep up — see
 * `MOTION_DURATION_QUICK_MS` below. every surface that transitions reads
 * the tokens below rather than tuning its own — see docs/conventions/
 * design-system.md's Motion section for where each applies and, just as
 * deliberately, where neither does.
 *
 * Soft is split by property kind, not one config for everything: a spring
 * suits *movement* — `translateY`/`translateX` — because its overshoot is
 * a real position a moment past the rest one. it does not suit *colour* or
 * *size*: overshooting past a target colour is either meaningless or
 * produces an out-of-range channel value, and overshooting past a target
 * *height* of zero drives that height negative and then back up through
 * positive values on the rebound — a collapsing box therefore un-collapses
 * for a frame near the end of its own animation, after it had already
 * reached zero. that is what `../../features/evaluations/ui/player-row/
 * player-row.tsx`'s swipe-to-delete collapse did on a real device before
 * this fix (`motionSizeTimingConfig` below): the maintainer's own
 * on-device pass over PR #93 saw the row flash back to full height at the
 * very end of the collapse. **the observation is what is established
 * here, not a precise account of how the layout engine resolves a
 * negative height** — nobody on this change verified that, and the fix
 * does not depend on it: a curve that never leaves `[0, 96]` cannot
 * produce a rebound of any size, whatever the engine would have done with
 * one. colour, opacity, and size all read a plain ease-out `withTiming`
 * instead, at the same duration, with no overshoot.
 */
import { Easing, withSpring, withTiming } from 'react-native-reanimated';
import type { AnimatableValue, WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

/** the one duration every surface in this system shares. */
export const MOTION_DURATION_MS = 320;

/**
 * the movement spring's config — Reanimated's duration-based spring form
 * (`duration` + `dampingRatio`), not the physics-based `damping`/
 * `stiffness`/`mass` form: Reanimated's own documentation names `duration`
 * here the spring's *perceptual* duration, with its actual settle time
 * running roughly 1.5× longer — there is no config knob that pins an
 * exact settle time on a curve that also carries overshoot, so `duration`
 * is set to the target figure directly (the knob the API actually
 * exposes for "about this long") rather than back-solved against that
 * multiplier. `dampingRatio` below `1` is what produces the overshoot:
 * `1` is critically damped (none at all), Reanimated's own `Wiggly`
 * preset uses `0.75` (a pronounced bounce) — `0.8` sits closer to
 * critically damped, for a slight one instead.
 */
export const motionSpringConfig: WithSpringConfig = {
  duration: MOTION_DURATION_MS,
  dampingRatio: 0.8,
};

/**
 * the colour/opacity transition's config — a plain ease-out, no spring,
 * no overshoot, at the same duration every movement spring above targets.
 */
export const motionColorTimingConfig: WithTimingConfig = {
  duration: MOTION_DURATION_MS,
  easing: Easing.out(Easing.cubic),
};

/**
 * `withSpring`, tuned to `motionSpringConfig` above, collapsed to an
 * immediate jump when `reduceMotion` is `true`. every surface that
 * animates a position calls this rather than `withSpring` directly, so
 * the reduced-motion branch (react-component-styling's adaptive-styling
 * reference) lives in one place instead of once per call site.
 *
 * marked `'worklet'` so it runs equally from a JS-thread effect and a
 * UI-thread gesture callback — `../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`'s drag-release spring-back calls it from the latter.
 */
export function motionSpring(toValue: number, reduceMotion: boolean): number {
  'worklet';
  return reduceMotion ? toValue : withSpring(toValue, motionSpringConfig);
}

/**
 * `withTiming`, tuned to `motionColorTimingConfig` above, collapsed to an
 * immediate jump when `reduceMotion` is `true` — the same shape as
 * `motionSpring` above, for colour and opacity instead of movement.
 * generic over `AnimatableValue`: Reanimated resolves a colour string
 * through the same call as a plain number, so one function serves a
 * `backgroundColor`/`borderColor` transition and an `opacity` one alike.
 */
export function motionColor<T extends AnimatableValue>(toValue: T, reduceMotion: boolean): T {
  'worklet';
  return reduceMotion ? toValue : withTiming(toValue, motionColorTimingConfig);
}

/**
 * the size transition's config — the same plain ease-out, no-overshoot
 * shape `motionColorTimingConfig` above takes, at the same duration, but
 * named for its own property kind rather than reused by coincidence of
 * value: a size (a row's own collapsing `height`, say) is not a colour, and
 * `docs/conventions/design-system.md`'s "apply a role whole, never by
 * coincidence of numbers" rule for typography roles holds here too. see
 * `motionSpringConfig`'s own doc comment above for why size joins colour on
 * the timing side of this split rather than the spring one: an overshoot
 * here is a momentarily negative height, not a real rest position a moment
 * past the target the way a spring's overshoot on `translateY`/`translateX`
 * is.
 *
 * **no `motionSize()` wrapper alongside this** — unlike
 * `motionColorTimingConfig`/`motionColor` above: this config's one caller
 * so far, `../../features/evaluations/ui/player-row/player-row.tsx`'s own
 * committed-delete collapse, needs the completion callback that fires
 * `onDelete`, which a wrapper collapsing straight to `reduceMotion ?
 * toValue : withTiming(...)` has nowhere to thread through — the same
 * reason `bottom-sheet.tsx`'s own `commitClose` already calls `withSpring`
 * directly against `motionSpringConfig` rather than through `motionSpring`.
 * add a wrapper once a caller that doesn't need one actually shows up,
 * rather than shipping one now with nothing exercising it.
 */
export const motionSizeTimingConfig: WithTimingConfig = {
  duration: MOTION_DURATION_MS,
  easing: Easing.out(Easing.cubic),
};

/**
 * the fan pan candidate's own duration (issue #83) — quick timing, the
 * maintainer's pick at that issue's own plan gate: materially shorter
 * than `MOTION_DURATION_MS` above, so a candidate change stays legible
 * during a fast drag across the arc rather than still settling when the
 * next card takes over.
 */
export const MOTION_DURATION_QUICK_MS = 140;

/**
 * the quick transition's config — a plain ease-out timing curve, not a
 * spring, at `MOTION_DURATION_QUICK_MS` above. this deliberately breaks
 * the movement-reads-a-spring/colour-reads-a-timing split `motionSpring`/
 * `motionColor` above follow: a spring's overshoot is a real position a
 * moment past the rest one, and that settle time is exactly what a fast
 * pan cannot wait out before the next card becomes the candidate. see
 * docs/conventions/design-system.md's Motion section for where this
 * applies.
 */
export const motionQuickTimingConfig: WithTimingConfig = {
  duration: MOTION_DURATION_QUICK_MS,
  easing: Easing.out(Easing.cubic),
};

/**
 * `withTiming`, tuned to `motionQuickTimingConfig` above, collapsed to an
 * immediate jump when `reduceMotion` is `true` — the same shape as
 * `motionSpring` above, for the fan pan candidate's own lift.
 *
 * marked `'worklet'` for the same reason `motionSpring` is: it runs from
 * a JS-thread effect (`../../shared/ui/cards-pane/cards-pane.tsx`'s own
 * candidacy effect).
 */
export function motionQuick(toValue: number, reduceMotion: boolean): number {
  'worklet';
  return reduceMotion ? toValue : withTiming(toValue, motionQuickTimingConfig);
}
