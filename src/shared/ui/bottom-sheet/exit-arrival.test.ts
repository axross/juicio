import { isExitArrival } from './exit-arrival';

// `bottom-sheet.tsx`'s own doc comment on this file explains why this rule
// lives here rather than inline in the `useAnimatedReaction` worklet that
// calls it: this project's reanimated mock (`node_modules/
// react-native-reanimated/src/mock.ts`) makes `useAnimatedReaction` a
// no-op — confirmed by reading that mock's own `hook.useAnimatedReaction:
// NOOP` — so no test that only renders `<BottomSheet />` can ever observe
// this rule running at all. These tests exercise the rule directly instead,
// the only way this project's suite can pin it against a regression.
describe('isExitArrival', () => {
  it('is an arrival: in flight, crossing from strictly below the offscreen target to at-or-past it', () => {
    expect(isExitArrival(280, 320, 320, true)).toBe(true);
  });

  it('is an arrival even when the crossing overshoots straight past the offscreen target', () => {
    // the exit spring is the same underdamped spring as the entrance
    // (`motionSpringConfig`'s `dampingRatio: 0.8`, `@/core/motion/tokens`),
    // so a frame can land past `offscreen`, not exactly on it.
    expect(isExitArrival(300, 340, 320, true)).toBe(true);
  });

  it('is not an arrival while no exit is in flight — the placement that happens on every open', () => {
    // `translateY` is written straight to the offscreen position on every
    // open (`bottom-sheet.tsx`'s own seed) — a position-only rule could not
    // tell that placement apart from a real exit reaching the same
    // position, which is exactly what `isInFlight` exists to gate.
    expect(isExitArrival(0, 320, 320, false)).toBe(false);
    expect(isExitArrival(280, 320, 320, false)).toBe(false);
  });

  it('is not an arrival on the reaction’s first call, which reports no previous value', () => {
    expect(isExitArrival(null, 320, 320, true)).toBe(false);
  });

  it('is not an arrival before the crossing — current is still short of the offscreen target', () => {
    expect(isExitArrival(100, 200, 320, true)).toBe(false);
  });

  it('is not an arrival after the crossing already happened — previous was already at or past the target', () => {
    expect(isExitArrival(320, 340, 320, true)).toBe(false);
    expect(isExitArrival(340, 320, 320, true)).toBe(false);
  });

  it('is not an arrival for a previous value of exactly the offscreen target — only a value strictly below it counts as still onscreen', () => {
    expect(isExitArrival(320, 320, 320, true)).toBe(false);
  });

  it('never fires before the window has been measured, even mid-crossing while in flight', () => {
    // the same degenerate case `animatedBackdropStyle` guards with its own
    // `windowHeight > 0` check — before that measurement lands, `offscreen`
    // reads `0` and `translateY` would otherwise cross it on every frame.
    expect(isExitArrival(0, 5, 0, true)).toBe(false);
    expect(isExitArrival(-5, 5, 0, true)).toBe(false);
  });
});
