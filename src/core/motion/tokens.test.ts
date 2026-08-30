import { withSpring, withTiming } from 'react-native-reanimated';

import {
  MOTION_DURATION_MS,
  MOTION_DURATION_QUICK_MS,
  motionColor,
  motionColorTimingConfig,
  motionQuick,
  motionQuickTimingConfig,
  motionSizeTimingConfig,
  motionSpring,
  motionSpringConfig,
} from './tokens';

// the real `withSpring`/`withTiming` this file wraps reach into
// `react-native-worklets`' native module on import — same reason
// `../../shared/ui/bottom-sheet/bottom-sheet.test.tsx` needs this.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

// wraps only `withSpring`/`withTiming` in a `jest.fn`, keeping every other
// export (`Easing` included) the real module's own. this is a module
// replacement, not a `jest.spyOn` on the real module's exports: Babel's
// ESM-to-CJS interop declares `withSpring`/`withTiming` as non-configurable
// getters, so `jest.spyOn` on the real module throws "Cannot redefine
// property" — replacing the module at `jest.mock` time sidesteps that
// rather than fighting it.
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
  };
});

const mockedWithSpring = jest.mocked(withSpring);
const mockedWithTiming = jest.mocked(withTiming);

// RNTL runs no layout engine and Reanimated is mocked in every component
// test that reaches this module — nothing in this project's suite
// observes a spring or a timing curve actually play out on screen
// (docs/conventions/testing.md). what this file proves instead: the
// spring and the colour timing config share one duration, the spring is
// tuned to overshoot and the timing curve isn't, and — the one behaviour
// that actually matters for correctness — `reduceMotion: true` collapses
// both to an immediate value with no call into Reanimated's animation
// functions at all.
describe('motion tokens', () => {
  beforeEach(() => {
    mockedWithSpring.mockClear();
    mockedWithTiming.mockClear();
  });

  it('shares one 320ms duration between the movement spring and the colour timing config', () => {
    expect(MOTION_DURATION_MS).toBe(320);
    expect(motionSpringConfig.duration).toBe(MOTION_DURATION_MS);
    expect(motionColorTimingConfig.duration).toBe(MOTION_DURATION_MS);
  });

  it('tunes the movement spring underdamped for a slight overshoot — less than Reanimated’s own Wiggly preset, not critically damped (no overshoot at all)', () => {
    expect(motionSpringConfig.dampingRatio).toBeLessThan(1);
    expect(motionSpringConfig.dampingRatio).toBeGreaterThan(0.75);
  });

  it('gives the colour timing config an easing curve — a plain ease-out, no spring, no overshoot', () => {
    expect(typeof motionColorTimingConfig.easing).toBe('function');
  });

  it('shares the same 320ms duration and an easing curve for the size timing config too, distinct from the colour one by name only', () => {
    // named for its own property kind rather than reused by coincidence of
    // value — see this module's own doc comment.
    expect(motionSizeTimingConfig.duration).toBe(MOTION_DURATION_MS);
    expect(typeof motionSizeTimingConfig.easing).toBe('function');
    expect(motionSizeTimingConfig).not.toBe(motionColorTimingConfig);
  });

  describe('motionSpring()', () => {
    it('resolves immediately to toValue when reduceMotion is true, never calling withSpring', () => {
      expect(motionSpring(120, true)).toBe(120);
      expect(mockedWithSpring).not.toHaveBeenCalled();
    });

    it('delegates to withSpring with this module’s own config when reduceMotion is false', () => {
      motionSpring(120, false);

      expect(mockedWithSpring).toHaveBeenCalledWith(120, motionSpringConfig);
    });
  });

  describe('motionColor()', () => {
    it('resolves immediately to toValue when reduceMotion is true, for a number and a colour string alike, never calling withTiming', () => {
      expect(motionColor(0.5, true)).toBe(0.5);
      expect(motionColor('#BDEE63', true)).toBe('#BDEE63');
      expect(mockedWithTiming).not.toHaveBeenCalled();
    });

    it('delegates to withTiming with this module’s own config when reduceMotion is false', () => {
      motionColor('#BDEE63', false);

      expect(mockedWithTiming).toHaveBeenCalledWith('#BDEE63', motionColorTimingConfig);
    });
  });

  it('gives the quick duration a materially shorter value than the 320ms character', () => {
    expect(MOTION_DURATION_QUICK_MS).toBe(140);
    expect(MOTION_DURATION_QUICK_MS).toBeLessThan(MOTION_DURATION_MS);
  });

  it('gives the quick timing config that duration and an easing curve — no spring, unlike the movement spring', () => {
    expect(motionQuickTimingConfig.duration).toBe(MOTION_DURATION_QUICK_MS);
    expect(typeof motionQuickTimingConfig.easing).toBe('function');
  });

  describe('motionQuick()', () => {
    it('resolves immediately to toValue when reduceMotion is true, never calling withTiming', () => {
      expect(motionQuick(28, true)).toBe(28);
      expect(mockedWithTiming).not.toHaveBeenCalled();
    });

    it('delegates to withTiming with this module’s own config when reduceMotion is false', () => {
      motionQuick(28, false);

      expect(mockedWithTiming).toHaveBeenCalledWith(28, motionQuickTimingConfig);
    });
  });
});
