import { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';
import { Platform } from 'react-native';

import { triggerHaptic, type HapticEvent } from './haptics';

const mockImpactAsync = jest.fn().mockResolvedValue(undefined);
const mockSelectionAsync = jest.fn().mockResolvedValue(undefined);
const mockNotificationAsync = jest.fn().mockResolvedValue(undefined);
const mockPerformAndroidHapticsAsync = jest.fn().mockResolvedValue(undefined);

// the enums are plain data (no native call behind them), so the real module
// is spread through and only the four functions that actually touch the
// device are replaced — the same partial-mock shape `jest.requireActual`
// gives any module here.
jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
  selectionAsync: (...args: unknown[]) => mockSelectionAsync(...args),
  notificationAsync: (...args: unknown[]) => mockNotificationAsync(...args),
  performAndroidHapticsAsync: (...args: unknown[]) => mockPerformAndroidHapticsAsync(...args),
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

      triggerHaptic('primaryAction');

      expect(mockImpactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Medium);
      expect(mockPerformAndroidHapticsAsync).not.toHaveBeenCalled();
    });
  });

  it('never rejects or throws when the underlying call rejects', async () => {
    Platform.OS = 'ios';
    mockImpactAsync.mockRejectedValueOnce(new Error('no vibration hardware'));

    expect(() => triggerHaptic('primaryAction')).not.toThrow();

    // let the swallowed rejection's microtask settle before the test ends,
    // so an unhandled-rejection warning would still surface here if the
    // implementation stopped catching it.
    await Promise.resolve();
    await Promise.resolve();
  });
});
