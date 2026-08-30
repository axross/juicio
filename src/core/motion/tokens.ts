/**
 * this project's one motion character — "Soft" (option C of PR #70's
 * motion exhibit, the maintainer's pick): roughly 320ms, a gentle spring
 * with a slight overshoot. every surface that transitions reads the
 * tokens below rather than tuning its own — see docs/conventions/
 * design-system.md's Motion section for where each applies and, just as
 * deliberately, where neither does.
 *
 * split by property kind, not one config for everything: a spring suits
 * *movement* — `translateY`/`translateX` — because its overshoot is a
 * real position a moment past the rest one. it does not suit *colour*:
 * overshooting past a target colour is either meaningless or produces an
 * out-of-range channel value. colour and opacity read a plain ease-out
 * `withTiming` instead, at the same duration, with no overshoot.
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
