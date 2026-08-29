import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';

export type BottomSheetProps = {
  visible: boolean;
  /**
   * fires once a dismissal is committed — a drag past the threshold, or a
   * backdrop tap — never on a drag that snaps back open. named for the
   * mechanism rather than an outcome, which is the one place
   * docs/conventions/component-contracts.md's "name a callback for the
   * outcome" rule reads backwards: a bottom sheet has no outcome of its
   * own, only a request to close, and it is the *caller* that knows
   * whether that means discarding a draft, navigating back, or something
   * else — the caller owns the outcome-named callback this fires into,
   * this component owns only the mechanism that decided closing was
   * requested.
   */
  onRequestClose: () => void;
  children: ReactNode;
  testID?: string;
};

// distance and velocity both dismiss, independently — a slow drag past
// half the sheet's own drawn height, or a short, fast flick well under it.
// half the sheet's height is the same "past the midpoint" rule
// @gorhom/bottom-sheet and UIKit's own half-sheet detent both use for a
// drag-to-dismiss threshold, and 500pt/s is the fling-velocity figure
// repeated across RN gesture tutorials and roughly what UIKit's own
// interactive-transition heuristics treat as a deliberate flick rather
// than a slow drag — neither number comes from this project's own design
// file, which specifies no dismissal physics at all.
const DISMISS_DISTANCE_RATIO = 0.5;
const DISMISS_VELOCITY_THRESHOLD = 500;

const EXIT_ANIMATION_DURATION_MS = 250;

// the drawn handle is 7 tall — a 7pt drag target is far under the 44pt
// floor both platforms ask for. the *touched* region stays the handle
// row's own full width (already well over 44) and only needs expanding
// vertically: (44 - 27) / 2, split evenly above and below the 27-tall row,
// so the drawn geometry (a 60×7 pill, 20 down inside that row) is
// completely unchanged by this and only the touch target grows.
const HANDLE_TOUCH_EXPANSION = (44 - 27) / 2;

/**
 * a generic bottom sheet — it knows nothing about tabs, cards, or ranges;
 * it renders whatever `children` it is given. dismissed by dragging the
 * handle downward past a threshold, or by tapping the backdrop; both call
 * `onRequestClose` exactly once, per docs/conventions/component-contracts.md's
 * "exactly one outcome callback, exactly once" rule — a drag that springs
 * back open is not a dismissal and must not call it.
 *
 * the drag follows the finger on the **UI thread**: `translateY` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s own
 * worklet callbacks, never `PanResponder` or the JS-driven `Animated` —
 * this project's own native-job demo exists to prove the JS thread stays
 * responsive under load, and a sheet that animated on it would be an odd
 * thing to add beside that.
 *
 * its own exit animation plays out entirely while `visible` still reads
 * `true`: a committed dismissal (drag or backdrop) plays `translateY`
 * down to fully offscreen first, and only calls `onRequestClose` once
 * that finishes — so by the time the caller acts on it and flips
 * `visible` to `false`, this component is already offscreen and renders
 * nothing (see the `!visible` branch below) with no visible jump.
 * `visible` flipping to `false` any other way — the caller deciding to
 * hide it without going through this component's own dismissal path —
 * stops rendering it immediately, with no exit animation played; this
 * primitive only choreographs the two dismissal gestures it owns. the
 * React component itself stays mounted either way (its hooks, and the
 * shared values they hold, persist across `visible` toggling) — only its
 * rendered output disappears, which is what lets it restore its own open
 * position on the next `visible={true}` rather than needing a fresh
 * instance (see the effect below).
 */
export function BottomSheet({ visible, onRequestClose, children, testID }: BottomSheetProps) {
  const windowHeight = useWindowDimensions().height;

  const translateY = useSharedValue(0);
  const dragStartTranslateY = useSharedValue(0);

  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      // a re-open after a previous dismissal must not render mid-way
      // through last time's exit animation — `commitClose` below leaves
      // `translateY` sitting at `windowHeight` (fully offscreen) at the
      // moment `onRequestClose` fires, and this component keeps that same
      // shared value across the `visible={false}` interval in between
      // (see this component's own doc comment on why it stays mounted,
      // rendering `null`, rather than unmounting) — so the open position
      // has to be restored explicitly here, not assumed.
      cancelAnimation(translateY);
      translateY.value = 0;
      triggerHaptic('sheetOpen');
    }
    wasVisible.current = visible;
    // `translateY` is a stable shared-value ref across this component's
    // lifetime, not a value that changes render to render — including it
    // here would only fire this effect on every value it takes on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleDismissalCommitted = useCallback(() => {
    triggerHaptic('sheetClose');
    onRequestClose();
  }, [onRequestClose]);

  // shared between the backdrop's plain JS `onPress` and the pan
  // gesture's UI-thread `onEnd` (via `runOnJS`, since only JS-thread code
  // may call a JS function) — animates the sheet fully off the bottom of
  // the window, then commits the dismissal once that animation actually
  // finishes, never before: this is what keeps `onRequestClose` (and the
  // `sheetClose` haptic riding on it) from firing while the sheet is still
  // visibly sliding away.
  const commitClose = useCallback(() => {
    // `react-hooks/immutability` treats a Reanimated shared value's
    // `.value` the same as a plain ref's `.current` once that same shared
    // value is also read inside a `useEffect` (the reset effect above) —
    // a known false positive for this library: a shared value is meant to
    // be mutated exactly like this, from anywhere, at any time, and that
    // mutation is what Reanimated propagates to the UI thread. there is
    // no alternative that keeps the drag on the UI thread, which this
    // component's own doc comment already commits to.
    // eslint-disable-next-line react-hooks/immutability
    translateY.value = withTiming(
      windowHeight,
      { duration: EXIT_ANIMATION_DURATION_MS },
      (finished) => {
        if (finished) {
          runOnJS(handleDismissalCommitted)();
        }
      },
    );
  }, [translateY, windowHeight, handleDismissalCommitted]);

  // built fresh every render, unlike `../selection-grid/selection-grid.tsx`'s
  // own `Gesture.Pan()` (which memoizes for exactly the opposite reason,
  // documented on its own build site): nothing here calls `setState` or a
  // prop callback while a drag is in progress — the drag's own position
  // lives entirely in `translateY`, a shared value Reanimated updates on
  // the UI thread without touching React's render cycle at all — so this
  // component has no render triggered by its own drag to interrupt itself
  // with. a caller flipping `visible` for an unrelated reason mid-drag
  // could still rebuild this gesture underneath an active touch; that
  // residual risk is accepted here rather than adding this file's own
  // version of `selection-grid.tsx`'s ref-context machinery for it.
  const pan = Gesture.Pan()
    .hitSlop({ top: HANDLE_TOUCH_EXPANSION, bottom: HANDLE_TOUCH_EXPANSION })
    .onStart(() => {
      cancelAnimation(translateY);
      dragStartTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      // never past the open position — no upward rubber-band, since there
      // is nothing above "open" for the sheet to reveal.
      // eslint-disable-next-line react-hooks/immutability -- see commitClose's own comment above.
      translateY.value = Math.max(0, dragStartTranslateY.value + event.translationY);
    })
    .onEnd((event) => {
      const draggedPastThreshold = event.translationY > windowHeight * DISMISS_DISTANCE_RATIO;
      const flickedPastThreshold = event.velocityY > DISMISS_VELOCITY_THRESHOLD;

      if (draggedPastThreshold || flickedPastThreshold) {
        runOnJS(commitClose)();
      } else {
        // eslint-disable-next-line react-hooks/immutability -- see commitClose's own comment above.
        translateY.value = withSpring(0);
      }
    });

  if (testID) {
    // exposes this gesture to `getByGestureTestId`/`fireGestureHandler`
    // from `react-native-gesture-handler/jest-utils`, the same way
    // `../selection-grid/selection-grid.tsx`'s own `pan` does — see that
    // component's doc comment for what that testing module can and cannot
    // reach. real on-device drag *recognition* stays unreachable
    // regardless (see this component's own `bottom-sheet.test.tsx`).
    pan.withTestId(`${testID}-drag`);
  }

  const tap = Gesture.Tap()
    .hitSlop({ top: HANDLE_TOUCH_EXPANSION, bottom: HANDLE_TOUCH_EXPANSION })
    .onEnd(() => {
      runOnJS(commitClose)();
    });

  // a tap and a drag both start the same way — a finger touching the
  // handle — so `Race` is what lets a short, still touch resolve as the
  // tap (see the handle's own accessibilityRole/accessibilityLabel below,
  // for why it needs one) while a touch that moves resolves as the drag
  // instead, without the two gestures fighting over the same touch.
  const handleGesture = Gesture.Race(tap, pan);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.root} testID={testID}>
      <Pressable
        style={styles.backdrop}
        onPress={commitClose}
        accessible={false}
        testID={testID ? `${testID}-backdrop` : undefined}
      />
      <Animated.View
        style={[styles.panel, animatedSheetStyle]}
        accessibilityViewIsModal
        testID={testID ? `${testID}-panel` : undefined}
      >
        <GestureDetector gesture={handleGesture}>
          <View
            style={styles.handleRow}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            testID={testID ? `${testID}-handle` : undefined}
          >
            <View style={styles.handle} />
          </View>
        </GestureDetector>
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </View>
  );
}

// 24 (top corners), 60×7 (handle), 20 (handle's own top offset within its
// 27-tall row), 14.5 (side padding), and 40 (the gap below the handle
// row) are all the design's own measured values — see
// docs/conventions/design-system.md's Spacing and Radius section on why
// faithful reproduction, not normalizing onto this project's 4/8px grid,
// is the default now.
const SHEET_CORNER_RADIUS = 24;
const HANDLE_ROW_HEIGHT = 27;
const HANDLE_TOP_OFFSET = 20;
const SIDE_PADDING = 14.5;
const CONTENT_GAP = 40;

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  // no colour token in this project's design system is scoped to a
  // full-screen scrim — docs/conventions/design-system.md's own colour
  // table has no "backdrop" or "scrim" role, and this run's own brief
  // never specifies one either — so the backdrop stays fully transparent
  // rather than this run inventing an unreviewed colour decision; it is
  // still exactly as tappable as a dimmed one would be. flagged in this
  // run's own report as a gap for the maintainer or a future design pass
  // to close, not silently painted over.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    paddingStart: Math.max(rt.insets.left, SIDE_PADDING),
    paddingEnd: Math.max(rt.insets.right, SIDE_PADDING),
    paddingBottom: rt.insets.bottom,
    borderTopLeftRadius: SHEET_CORNER_RADIUS,
    borderTopRightRadius: SHEET_CORNER_RADIUS,
    backgroundColor: theme.colors.background.neutral.app,
    boxShadow: theme.effects.sheetInverted,
  },
  handleRow: {
    height: HANDLE_ROW_HEIGHT,
    paddingTop: HANDLE_TOP_OFFSET,
    alignItems: 'center',
  },
  handle: {
    width: 60,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.text.neutral.low,
  },
  content: {
    marginTop: CONTENT_GAP,
  },
}));
