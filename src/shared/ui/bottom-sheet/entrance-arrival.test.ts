import { isEntranceArrival } from './entrance-arrival';

// `bottom-sheet.tsx`'s own doc comment on this file explains why this rule
// lives here rather than inline in the `useAnimatedReaction` worklet that
// calls it: this project's reanimated mock (`node_modules/
// react-native-reanimated/src/mock.ts`) makes `useAnimatedReaction` a
// no-op — confirmed by reading that mock's own `hook.useAnimatedReaction:
// NOOP` — so no test that only renders `<BottomSheet />` can ever observe
// this rule running at all. These tests exercise the rule directly instead,
// the only way this project's suite can pin it against a regression.
describe('isEntranceArrival', () => {
  it('is an arrival: in flight, crossing from strictly above 0 to at-or-below it', () => {
    expect(isEntranceArrival(320, 0, true)).toBe(true);
  });

  it('is an arrival even when the crossing overshoots straight past 0', () => {
    // the spring's own slight overshoot (`dampingRatio: 0.8`,
    // `@/core/motion/tokens`) can land a frame below `0`, not exactly on
    // it — this is the case that guarantees a crossing happens at all,
    // per this function's own doc comment.
    expect(isEntranceArrival(4, -6, true)).toBe(true);
  });

  it('is not an arrival while no entrance is in flight', () => {
    // the gate a drag-release snap-back and an exit both rely on — both
    // carry `translateY` back through `0` too, and `bottom-sheet.tsx`
    // never sets `isEntranceInFlight` true for either one.
    expect(isEntranceArrival(320, 0, false)).toBe(false);
    expect(isEntranceArrival(4, -6, false)).toBe(false);
  });

  it('is not an arrival on the reaction’s first call, which reports no previous value', () => {
    expect(isEntranceArrival(null, 320, true)).toBe(false);
    expect(isEntranceArrival(null, -1, true)).toBe(false);
  });

  it('is not an arrival before the crossing — current is still above the open position', () => {
    expect(isEntranceArrival(320, 40, true)).toBe(false);
  });

  it('is not an arrival after the crossing already happened — previous was already at or below 0', () => {
    expect(isEntranceArrival(0, -3, true)).toBe(false);
    expect(isEntranceArrival(-3, -1, true)).toBe(false);
  });

  it('is not an arrival for a previous value of exactly 0 — only a strictly positive previous counts as still offscreen', () => {
    expect(isEntranceArrival(0, 0, true)).toBe(false);
  });
});
