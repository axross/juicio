import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * every touch interaction this app gives haptic feedback for, named by what
 * it means rather than by a platform constant — see
 * docs/conventions/haptics.md for the full event table, an example
 * interaction per event, and the three places neither platform's own
 * guidance answers. member values are unchanged from this type's earlier
 * string-union form, since they are `HAPTIC_MAPPING`'s own keys and appear
 * in tests and docs — only the shape (a real enum, matching
 * `HoldingDismissReason`'s precedent — see
 * src/features/hand-ranges/model/holding.ts) changed.
 */
export enum HapticEvent {
  PrimaryAction = 'primaryAction',
  SecondaryAction = 'secondaryAction',
  SelectionChange = 'selectionChange',
  DragTick = 'dragTick',
  ToggleOn = 'toggleOn',
  ToggleOff = 'toggleOff',
  DragStart = 'dragStart',
  DragEnd = 'dragEnd',
  SheetOpen = 'sheetOpen',
  SheetClose = 'sheetClose',
  Success = 'success',
  Error = 'error',
  LongPress = 'longPress',
}

/**
 * the iOS side of one event's mapping, kept as data rather than a captured
 * closure — `performIosHaptic` below is the one place that turns it into a
 * call, so `HAPTIC_MAPPING` stays inspectable as a whole table in its own
 * test.
 */
type IosHapticAction =
  | { kind: 'impact'; style: ImpactFeedbackStyle }
  | { kind: 'selection' }
  | { kind: 'notification'; type: NotificationFeedbackType };

type HapticMapping = {
  ios: IosHapticAction;
  android: AndroidHaptics;
};

/**
 * one row per `HapticEvent`, sourced from Apple's *Playing Haptics* HIG,
 * Android's `HapticFeedbackConstants`, and the `expo-haptics` SDK 57 docs —
 * see docs/conventions/haptics.md for the same table with an example
 * interaction and the platform citations behind each row. a `Record` over
 * the full union, rather than a `switch`, is what makes an unhandled event a
 * type error instead of a silent no-op, and what lets this module's test
 * assert the table directly.
 */
const HAPTIC_MAPPING: Record<HapticEvent, HapticMapping> = {
  primaryAction: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Medium },
    android: AndroidHaptics.Confirm,
  },
  secondaryAction: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Virtual_Key,
  },
  selectionChange: {
    ios: { kind: 'selection' },
    android: AndroidHaptics.Segment_Tick,
  },
  dragTick: {
    ios: { kind: 'selection' },
    android: AndroidHaptics.Segment_Frequent_Tick,
  },
  toggleOn: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Toggle_On,
  },
  toggleOff: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Toggle_Off,
  },
  dragStart: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Medium },
    android: AndroidHaptics.Drag_Start,
  },
  dragEnd: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Gesture_End,
  },
  sheetOpen: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Gesture_Start,
  },
  sheetClose: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Light },
    android: AndroidHaptics.Gesture_End,
  },
  success: {
    ios: { kind: 'notification', type: NotificationFeedbackType.Success },
    android: AndroidHaptics.Confirm,
  },
  error: {
    ios: { kind: 'notification', type: NotificationFeedbackType.Error },
    android: AndroidHaptics.Reject,
  },
  longPress: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Medium },
    android: AndroidHaptics.Long_Press,
  },
};

/** turns one row's `ios` action into the `expo-haptics` call it names. */
function performIosHaptic(action: IosHapticAction): Promise<void> {
  switch (action.kind) {
    case 'impact':
      return impactAsync(action.style);
    case 'selection':
      return selectionAsync();
    case 'notification':
      return notificationAsync(action.type);
  }
}

/**
 * fires the haptic feedback for `event`. synchronous and fire-and-forget: a
 * caller's press handler must never `await` this and must never see it
 * throw — a device with no vibration hardware, haptics turned off at the OS
 * level, or (on `react-native-web`, not a target platform of this project —
 * see README) a browser with no Vibration API all reject silently rather
 * than breaking the interaction that asked for feedback.
 *
 * branches only on `Platform.OS === 'android'`; every other platform,
 * `react-native-web` included, goes through the same iOS-column call —
 * `expo-haptics` resolves `impactAsync`/`selectionAsync`/`notificationAsync`
 * to its own Web Vibration API implementation there, so this module needs
 * no third branch.
 */
export function triggerHaptic(event: HapticEvent): void {
  const mapping = HAPTIC_MAPPING[event];
  const result =
    Platform.OS === 'android'
      ? performAndroidHapticsAsync(mapping.android)
      : performIosHaptic(mapping.ios);

  result.catch(() => {
    // deliberately swallowed — see the doc comment above.
  });
}
