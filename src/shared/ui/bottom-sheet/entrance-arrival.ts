/**
 * the entrance spring's own "has it arrived" rule, kept free of React and
 * Reanimated's hook surface — `bottom-sheet.tsx`'s `useAnimatedReaction`
 * calls straight into this from its own worklet, so the rule itself is
 * testable with no shared value, no gesture, and no render involved. marked
 * `'worklet'`, the same as `@/core/motion/tokens`'s `motionSpring`/
 * `motionColor`: a plain function called from inside another worklet must
 * carry the directive itself, or Reanimated's Babel plugin has nothing
 * telling it this one also has to run on the UI thread.
 *
 * `translateY` travels from its offscreen position (positive, growing
 * larger the further below the fold) down to `0`, the open position — and,
 * because the entrance spring is deliberately underdamped
 * (`motionSpringConfig`'s `dampingRatio: 0.8`, `@/core/motion/tokens`), it
 * is guaranteed to overshoot slightly past `0` before settling back. That
 * guarantee is what lets this rule use the crossing itself as "arrived"
 * rather than a threshold distance or a fixed delay invented for the
 * purpose: the first frame `translateY` reads at or below `0` **is** the
 * sheet visually landing, whichever value it left off at the frame before.
 *
 * `isInFlight` is the caller's own gate, not derived from `previous`/
 * `current` here: a drag-release snap-back and the exit both carry
 * `translateY` back through `0` too, and neither is an arrival. The caller
 * (`bottom-sheet.tsx`'s `isEntranceInFlight`) is `true` only for as long as
 * a fresh entrance is actually in flight, and this function trusts that
 * gate completely rather than re-deriving it from the position alone,
 * which has no way to tell an entrance's own crossing apart from a
 * snap-back's or an exit's.
 */
export function isEntranceArrival(
  previous: number | null,
  current: number,
  isInFlight: boolean,
): boolean {
  'worklet';
  return isInFlight && previous !== null && previous > 0 && current <= 0;
}
