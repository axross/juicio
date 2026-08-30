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

import { reportError } from '@/core/instrumentation/report-error';

/**
 * every touch interaction this app gives haptic feedback for, named by what
 * it means rather than by a platform constant — see docs/conventions/
 * haptics.md for the full event table. member values are unchanged from
 * this type's earlier string-union form, since they're `HAPTIC_MAPPING`'s
 * own keys and appear in tests and docs — only the shape changed, to a real
 * enum matching `HoldingDismissReason`'s precedent
 * (src/features/hand-ranges/model/holding.ts).
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
  BulkToggle = 'bulkToggle',
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
 * see docs/conventions/haptics.md for the same table with citations. a
 * `Record` over the full union, not a `switch`, makes an unhandled event a
 * type error instead of a silent no-op, and lets this module's test assert
 * the table directly.
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
  bulkToggle: {
    ios: { kind: 'impact', style: ImpactFeedbackStyle.Medium },
    android: AndroidHaptics.Confirm,
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
 * whether this module has already sent one rejection to Sentry this
 * session (module-instance lifetime — never re-instantiated within a
 * running app). `triggerHaptic` below is the sole writer, only ever
 * flipping it `false` → `true`.
 */
let hasReportedFailure = false;

/**
 * fires the haptic feedback for `event`. synchronous and fire-and-forget: a
 * caller's press handler must never `await` this or see it throw — no
 * vibration hardware, haptics off at the OS level, or (on
 * `react-native-web`, not a target platform — see README) no browser
 * Vibration API all reject silently instead of breaking the interaction.
 *
 * branches only on `Platform.OS === 'android'`; every other platform,
 * `react-native-web` included, goes through the same iOS-column call —
 * `expo-haptics` resolves it to its own Web Vibration API implementation
 * there, so no third branch is needed.
 *
 * a rejection is swallowed, but not silently every time: the *first*
 * rejection this session reports to Sentry (`reportError`, tagged with
 * `event` and platform), and `hasReportedFailure` keeps every later one
 * silent — haptics fire on every touch, so reporting each would flood the
 * project's quota with duplicates of what is, on the two likely causes, not
 * a defect at all. capturing once still catches what those two can't
 * explain: docs/conventions/haptics.md's "One Unverified Fact", a specific
 * `AndroidHaptics` member unsupported at a specific API level.
 */
export function triggerHaptic(event: HapticEvent): void {
  const mapping = HAPTIC_MAPPING[event];
  const platform = Platform.OS === 'android' ? 'android' : 'ios-column';
  const result =
    Platform.OS === 'android'
      ? performAndroidHapticsAsync(mapping.android)
      : performIosHaptic(mapping.ios);

  result.catch((error: unknown) => {
    if (hasReportedFailure) {
      return;
    }
    hasReportedFailure = true;

    try {
      reportError(error, { tags: { module: 'haptics', event, platform } });
    } catch {
      // the capture itself must never break this function's own
      // fire-and-forget contract — see the doc comment above.
    }
  });
}
