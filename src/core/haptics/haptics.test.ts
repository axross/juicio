import { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
import { Platform } from 'react-native';

import { HapticEvent, triggerHaptic } from './haptics';

const mockImpactAsync = jest.fn().mockResolvedValue(undefined);
const mockSelectionAsync = jest.fn().mockResolvedValue(undefined);
const mockNotificationAsync = jest.fn().mockResolvedValue(undefined);
const mockPerformAndroidHapticsAsync = jest.fn().mockResolvedValue(undefined);
const mockReportError = jest.fn();

// the enums are plain data (no native call behind them), so the real module
// is spread through and only the four device-touching functions are
// replaced — `jest.requireActual`'s usual partial-mock shape.
jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  selectionAsync: (...args: unknown[]) => mockSelectionAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  performAndroidHapticsAsync: (...args: unknown[]) => mockPerformAndroidHapticsAsync(...args),
}));

// keeps the real module — and the native Sentry SDK it reaches — out of
// this test, same as `settings-screen.test.tsx`'s `report-error` mock.
// closes over the outer `mockReportError` rather than returning a fresh
// `jest.fn()`, so the mock keeps working after `jest.resetModules()`
// below: a freshly required `./haptics` re-runs this factory but must
// still call the one `mockReportError` every test asserts against.
jest.mock('@/core/instrumentation/report-error', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

/** every event's expected call on each platform — the table this test
 * asserts against `HAPTIC_MAPPING` indirectly, one event at a time. */
const EXPECTED: Record<HapticEvent, { ios: [jest.Mock, ...unknown[]]; android: AndroidHaptics }> = {
  primaryAction: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Medium],
    android: AndroidHaptics.Confirm,
  },
  secondaryAction: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Virtual_Key,
  },
  selectionChange: { ios: [mockSelectionAsync], android: AndroidHaptics.Segment_Tick },
  dragTick: { ios: [mockSelectionAsync], android: AndroidHaptics.Segment_Frequent_Tick },
  toggleOn: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Toggle_On,
  },
  toggleOff: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Toggle_Off,
  },
  dragStart: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Medium],
    android: AndroidHaptics.Drag_Start,
  },
  dragEnd: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Gesture_End,
  },
  sheetOpen: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Gesture_Start,
  },
  sheetClose: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Light],
    android: AndroidHaptics.Gesture_End,
  },
  success: {
    ios: [mockNotificationAsync, NotificationFeedbackType.Success],
    android: AndroidHaptics.Confirm,
  },
  error: {
    ios: [mockNotificationAsync, NotificationFeedbackType.Error],
    android: AndroidHaptics.Reject,
  },
  longPress: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Medium],
    android: AndroidHaptics.Long_Press,
  },
  bulkToggle: {
    ios: [mockImpactAsync, ImpactFeedbackStyle.Medium],
    android: AndroidHaptics.Confirm,
  },
};

const EVENTS = Object.keys(EXPECTED) as HapticEvent[];
const ALL_IOS_MOCKS = [mockImpactAsync, mockSelectionAsync, mockNotificationAsync];

describe('triggerHaptic', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    jest.clearAllMocks();
    Platform.OS = originalOS;
  });

  describe('on iOS', () => {
    beforeEach(() => {
      Platform.OS = 'ios';
    });

    it.each(EVENTS)('calls the mapped expo-haptics function for "%s"', (event) => {
      const [expectedFn, ...expectedArgs] = EXPECTED[event].ios;

      triggerHaptic(event);

      expect(expectedFn).toHaveBeenCalledWith(...expectedArgs);
      expect(mockPerformAndroidHapticsAsync).not.toHaveBeenCalled();
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      Platform.OS = 'android';
    });

    it.each(EVENTS)(
      'calls performAndroidHapticsAsync with the mapped constant for "%s"',
      (event) => {
        triggerHaptic(event);

        expect(mockPerformAndroidHapticsAsync).toHaveBeenCalledWith(EXPECTED[event].android);
        for (const mock of ALL_IOS_MOCKS) {
          expect(mock).not.toHaveBeenCalled();
        }
      },
    );
  });

  describe('on a platform other than Android', () => {
    it('routes react-native-web through the same iOS-column call as iOS', () => {
      Platform.OS = 'web';

      triggerHaptic(HapticEvent.PrimaryAction);

      expect(mockImpactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Medium);
      expect(mockPerformAndroidHapticsAsync).not.toHaveBeenCalled();
    });
  });

  it('never rejects or throws when the underlying call rejects', async () => {
    Platform.OS = 'ios';
    mockImpactAsync.mockRejectedValueOnce(new Error('no vibration hardware'));

    expect(() => triggerHaptic(HapticEvent.PrimaryAction)).not.toThrow();

    // let the swallowed rejection's microtask settle before the test ends,
    // so an unhandled-rejection warning would still surface here if the
    // implementation stopped catching it.
    await Promise.resolve();
    await Promise.resolve();
  });

  // `hasReportedFailure` is process-lifetime state private to one loaded
  // `./haptics` instance — the tests above share the instance this file's
  // top-level `import` loaded, and the previous test's rejection already
  // flipped it for the rest of this file. each test below instead runs
  // against its own fresh instance: `jest.resetModules()` clears Jest's
  // module registry, so a `require()` afterward re-evaluates `./haptics`
  // with a new, unflipped flag. the mocks themselves survive the reset —
  // they live in this file's own module scope, and the `expo-haptics`/
  // `report-error` factories above close over them rather than
  // constructing fresh ones each run.
  describe('reporting a rejection to Sentry', () => {
    let freshHaptics: typeof import('./haptics');

    beforeEach(() => {
      Platform.OS = 'ios';
      jest.resetModules();
      // a synchronous, isolated re-load is what gives this describe block's
      // own tests a fresh `hasReportedFailure`; see the comment above.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      freshHaptics = require('./haptics') as typeof import('./haptics');
    });

    it('reports the first rejection once, tagged with the event and the iOS-column branch', async () => {
      mockImpactAsync.mockRejectedValueOnce(new Error('no vibration hardware'));

      freshHaptics.triggerHaptic(HapticEvent.PrimaryAction);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockReportError).toHaveBeenCalledTimes(1);
      expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), {
        tags: { module: 'haptics', event: HapticEvent.PrimaryAction, platform: 'ios-column' },
      });
    });

    it('tags an Android rejection with the performAndroidHapticsAsync branch', async () => {
      Platform.OS = 'android';
      mockPerformAndroidHapticsAsync.mockRejectedValueOnce(new Error('no vibration motor'));

      freshHaptics.triggerHaptic(HapticEvent.ToggleOn);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockReportError).toHaveBeenCalledWith(expect.any(Error), {
        tags: { module: 'haptics', event: HapticEvent.ToggleOn, platform: 'android' },
      });
    });

    it('stays silent on every rejection after the first, within the same module instance', async () => {
      mockImpactAsync.mockRejectedValue(new Error('no vibration hardware'));

      freshHaptics.triggerHaptic(HapticEvent.PrimaryAction);
      await Promise.resolve();
      await Promise.resolve();
      freshHaptics.triggerHaptic(HapticEvent.SecondaryAction);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockReportError).toHaveBeenCalledTimes(1);
    });

    it('never lets a throw from reportError itself escape into the caller', async () => {
      mockImpactAsync.mockRejectedValueOnce(new Error('no vibration hardware'));
      mockReportError.mockImplementationOnce(() => {
        throw new Error('sentry transport down');
      });

      expect(() => freshHaptics.triggerHaptic(HapticEvent.PrimaryAction)).not.toThrow();

      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
