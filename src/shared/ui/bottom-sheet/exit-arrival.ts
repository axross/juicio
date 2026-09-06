/**
 * the exit spring's own "has it gone" rule — the offscreen counterpart to
 * `./entrance-arrival.ts`'s `isEntranceArrival`, kept free of React and
 * Reanimated's hook surface for the same reason: `bottom-sheet.tsx`'s
 * second `useAnimatedReaction` calls straight into this from its own
 * worklet, so the rule itself is testable with no shared value, no
 * gesture, and no render involved. marked `'worklet'`, the same as
 * `./entrance-arrival.ts`'s own `isEntranceArrival`: a plain function
 * called from inside another worklet must carry the directive itself, or
 * Reanimated's Babel plugin has nothing telling it this one also has to
 * run on the UI thread.
 *
 * `translateY` travels from `0`, the open position, down past `offscreen`
 * — the sheet's own offscreen target — on a committed exit. The
 * backdrop's own opacity (`animatedBackdropStyle`, `bottom-sheet.tsx`) is
 * already derived linearly from that same travel, reaching zero exactly
 * when `translateY` first reaches `offscreen` — so the first frame
 * `translateY` reads at or past `offscreen` **is** the moment the
 * backdrop stops being visible, whichever value it left off at the frame
 * before.
 *
 * `isInFlight` is the caller's own gate, not derived from `previous`/
 * `current` here — mirroring `isEntranceArrival`'s own reasoning: the
 * sheet is written to `offscreen` on every open (`translateY`'s own seed,
 * and the reset the visibility effect performs before every fresh
 * entrance in `bottom-sheet.tsx`), and a position-only rule has no way to
 * tell that placement apart from a real exit reaching the same position.
 * The caller (`bottom-sheet.tsx`'s `isExitInFlight`) is `true` only for as
 * long as a committed exit is actually in flight, and this function
 * trusts that gate completely rather than re-deriving it from the
 * position alone.
 *
 * `offscreen <= 0` returns `false` unconditionally — the same degenerate
 * case `animatedBackdropStyle` already guards against with its own
 * `windowHeight > 0` check: before the window has ever been measured,
 * `offscreen` reads `0`, and a `translateY` seeded at (or animating
 * through) `0` would otherwise cross it on every frame, firing this rule
 * long before any real layout exists to make sense of.
 */
export function isExitArrival(
  previous: number | null,
  current: number,
  offscreen: number,
  isInFlight: boolean,
): boolean {
  'worklet';
  return (
    isInFlight && offscreen > 0 && previous !== null && previous < offscreen && current >= offscreen
  );
}
