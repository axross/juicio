import type { ComponentProps, ReactNode } from 'react';
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

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { usePortal } from '@/shared/ui/portal/portal';

// `Pressable` itself is a plain React Native component; wrapping it once,
// at module scope, is what lets an animated style (the backdrop's own
// drag-tracking opacity below) apply to it at all — an unwrapped
// `Pressable` only ever accepts a plain style object.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
 * it renders whatever `children` it is given. dismissed by tapping the
 * handle, by dragging it downward past a threshold, or by tapping the
 * backdrop; all three call `onRequestClose` exactly once, per
 * docs/conventions/component-contracts.md's "exactly one outcome
 * callback, exactly once" rule — a drag that springs back open is not a
 * dismissal and must not call it.
 *
 * the drag follows the finger on the **UI thread**: `translateY` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s own
 * worklet callbacks, never `PanResponder` or the JS-driven `Animated` —
 * this project's own native-job demo exists to prove the JS thread stays
 * responsive under load, and a sheet that animated on it would be an odd
 * thing to add beside that.
 *
 * its own exit animation plays out entirely while `visible` still reads
 * `true`: a committed dismissal (handle tap, drag, or backdrop) plays
 * `translateY` down to fully offscreen first, and only calls
 * `onRequestClose` once that finishes — so by the time the caller acts
 * on it and flips `visible` to `false`, this component is already
 * offscreen and renders nothing (see the `usePortal` call below, which
 * hands `<PortalHost />` `null` while `!visible`) with no visible jump.
 * `visible` flipping to `false` any other way — the caller deciding to
 * hide it without going through this component's own dismissal path —
 * stops rendering it immediately, with no exit animation played; this
 * primitive only choreographs the three dismissal paths it owns. the
 * React component itself stays mounted either way (its hooks, and the
 * shared values they hold, persist across `visible` toggling) — only its
 * rendered output disappears, which is what lets it restore its own open
 * position on the next `visible={true}` rather than needing a fresh
 * instance (see the effect below). this component itself always returns
 * `null` — its actual output renders through `<PortalHost />` instead
 * (`usePortal`, `@/shared/ui/portal/portal`), so it can paint above the
 * tab bar rather than being clipped to whatever screen renders it; see
 * that hook's own call site below for why.
 *
 * **its props type still extends `ComponentProps<typeof View>`, even
 * though this function's own `return` statement is `return null;`.** the
 * literal JSX return has no root child element at all for
 * docs/conventions/component-contracts.md's props-inheritance rule to
 * read against — but this component does construct a real root `View`
 * (`styles.root`, below), it just hands that tree to `usePortal` as an
 * argument instead of returning it directly. Treating *that* `View` as
 * the root every caller and every test already treats it as — the thing
 * that actually ends up on screen — is the more honest reading than
 * declining to extend anything just because of where the construction
 * happens to sit; the rest spread below lands on that same `View`.
 */
export function BottomSheet({
  visible,
  onRequestClose,
  handleAccessibilityLabel = 'Dismiss',
  accessibilityLabel,
  children,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /**
   * fires once a dismissal is committed — a tap on the handle, a drag
   * past the threshold, or a backdrop tap — never on a drag that snaps
   * back open. named for the
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
  /** read by a screen reader on the drag handle, alongside its
   * `accessibilityRole="button"` — defaults to this component's own
   * generic "Dismiss", since it knows nothing about what any particular
   * caller's sheet is; a caller stacking more than one kind of sheet
   * (the card/range input sheet, say) SHOULD pass its own, more specific
   * label instead. */
  handleAccessibilityLabel?: string;
  /** read by a screen reader on entering the sheet itself, alongside its
   * `accessibilityViewIsModal` — this is the sheet's own identity ("what
   * am I in"), as distinct from `handleAccessibilityLabel` above ("how do
   * I get out"). unlike that prop, this one has no generic default this
   * component could supply on a caller's behalf — this component knows
   * nothing about what any particular caller's sheet is, and a default
   * that said nothing (a bare "Sheet", say) would leave a screen-reader
   * user no better off than no label at all — so every caller MUST name
   * its own sheet. */
  accessibilityLabel: string;
  children: ReactNode;
  testID?: string;
}) {
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
      triggerHaptic(HapticEvent.SheetOpen);
    }
    wasVisible.current = visible;
    // `translateY` is a stable shared-value ref across this component's
    // lifetime, not a value that changes render to render — including it
    // here would only fire this effect on every value it takes on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleDismissalCommitted = useCallback(() => {
    triggerHaptic(HapticEvent.SheetClose);
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

  const tap = Gesture.Tap()
    .hitSlop({ top: HANDLE_TOUCH_EXPANSION, bottom: HANDLE_TOUCH_EXPANSION })
    .onEnd(() => {
      runOnJS(commitClose)();
    });

  if (testID) {
    // exposes both gestures to `getByGestureTestId`/`fireGestureHandler`
    // from `react-native-gesture-handler/jest-utils`, the same way
    // `../selection-grid/selection-grid.tsx`'s own `pan` does — see that
    // component's doc comment for what that testing module can and cannot
    // reach. real on-device drag and tap *recognition* both stay
    // unreachable regardless (see this component's own
    // `bottom-sheet.test.tsx`).
    pan.withTestId('drag');
    tap.withTestId('tap');
  }

  // a tap and a drag both start the same way — a finger touching the
  // handle — so `Race` is what lets a short, still touch resolve as the
  // tap (see the handle's own accessibilityRole/accessibilityLabel below,
  // for why it needs one) while a touch that moves resolves as the drag
  // instead, without the two gestures fighting over the same touch.
  const handleGesture = Gesture.Race(tap, pan);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // fades with the sheet's own `translateY`, not a separate timeline: 0
  // (open) reads fully opaque, `windowHeight` (fully offscreen) reads
  // fully transparent, and every position between the two — including
  // mid-drag — reads proportionally. this is what keeps a half-dragged
  // sheet from ever showing a fully opaque scrim sitting behind it; both
  // this and `animatedSheetStyle` above read the same UI-thread shared
  // value, so the two can never drift a frame apart the way two
  // independently-driven animations could.
  const animatedBackdropStyle = useAnimatedStyle(() => {
    const progress =
      windowHeight > 0 ? Math.min(1, Math.max(0, translateY.value / windowHeight)) : 0;
    return { opacity: 1 - progress };
  });

  // rendered through the portal (`usePortal`, `@/shared/ui/portal/portal`)
  // rather than returned directly: this component is reached from inside
  // `Tabs`' own screen tree (`src/app/(tabs)/index.tsx`), a sibling
  // *underneath* the tab bar `Tabs` itself draws, so returning this JSX in
  // place would render it clipped to that screen's own area, never able
  // to paint over the tab bar. `<PortalHost />`, mounted once in
  // `src/app/_layout.tsx` above `<Stack>`, is what actually renders
  // whatever this hook hands it — see that component's own doc comment for
  // why every context this JSX depends on (Unistyles' theme,
  // `react-i18next`'s translations, `react-native-gesture-handler`'s root
  // context) still resolves correctly from there. `null` while `!visible`
  // is exactly the "renders nothing" case `usePortal` already handles.
  usePortal(
    visible ? (
      // `style` merged last, after this component's own `styles.root`, so
      // a caller extending it does not wipe out the full-bleed positioning
      // every child below is anchored against; every other rest prop is
      // spread after `testID` so a caller can still override an explicit
      // default, the same ordering `SegmentedTabs` uses.
      <View style={[styles.root, style]} testID={testID} {...props}>
        <AnimatedPressable
          style={[styles.backdrop, animatedBackdropStyle]}
          onPress={commitClose}
          accessible={false}
          testID={testID ? 'backdrop' : undefined}
        />
        <Animated.View
          style={[styles.panel, animatedSheetStyle]}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          testID={testID ? 'panel' : undefined}
        >
          <GestureDetector gesture={handleGesture}>
            <View
              style={styles.handleRow}
              accessibilityRole="button"
              accessibilityLabel={handleAccessibilityLabel}
              testID={testID ? 'handle' : undefined}
            >
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </View>
    ) : null,
  );

  return null;
}

/** derived from the component's own argument type — per
 * docs/conventions/component-contracts.md's props-declaration rule — so
 * this stays a single source of truth rather than a hand-duplicated copy
 * that could drift from it, while keeping `BottomSheetProps` importable
 * exactly as before for any external consumer. */
export type BottomSheetProps = ComponentProps<typeof BottomSheet>;

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
  // `theme.colors.scrim` — a colour role this run added, since the design
  // file draws the sheet as a standalone artboard with nothing behind it
  // and this project's colour table had no "backdrop" role until now. see
  // that token's own doc comment (`src/core/theme/tokens.ts`) and
  // docs/conventions/design-system.md's "Bottom Sheet Scrim" entry for the
  // value and the maintainer decision behind it. the *opacity* that fades
  // this in and out with the drag is animated separately, in the
  // component body (`animatedBackdropStyle`) — this base style only ever
  // carries the flat colour and the full-bleed positioning.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.scrim,
  },
  panel: {
    paddingStart: Math.max(rt.insets.left, SIDE_PADDING),
    paddingEnd: Math.max(rt.insets.right, SIDE_PADDING),
    // correct now that this component renders through `<PortalHost />`
    // (`usePortal` above) rather than inside a tab screen: the panel's own
    // bottom edge is the physical bottom of the window, where the home
    // indicator or gesture bar actually sits, so this inset is exactly the
    // clearance it needs. before the portal fix this sheet rendered inside
    // `Tabs`' own screen content, whose bottom edge sat *above* the tab bar
    // — a tab bar that already clears the home indicator itself — so this
    // same inset was clearance added a second time against a boundary that
    // was never the physical screen edge to begin with.
    paddingBottom: rt.insets.bottom,
    // a safety floor, not a design measurement — the design file specifies
    // no sheet height at all, and this component's own content is
    // whatever `children` a caller gives it, unbounded. without a cap,
    // content taller than the screen pushes the handle row (and any tab
    // row above it) off the top of the screen while the panel itself still
    // covers the backdrop underneath — both of this sheet's own dismiss
    // paths (the handle and the backdrop) become unreachable at once, with
    // no way out. capping at a fraction of the screen leaves the backdrop
    // above the panel always tappable, so a backdrop tap stays a working
    // dismissal even when a caller's content badly overflows.
    //
    // `rt.screen.height - rt.insets.top` is a second, independent cap,
    // reconciled with the fraction above by taking whichever is smaller:
    // the 90% fraction alone bounds the panel's own *size*, not its
    // position, and says nothing about the status bar or a notch — a tall
    // enough panel could still grow up underneath one. Since the panel is
    // anchored to the bottom of the window (`styles.root`'s own
    // `justifyContent: 'flex-end'`), bounding its height at "the window's
    // own height, less the top inset" is what keeps its own top edge from
    // ever rising above `rt.insets.top`, on any device, regardless of what
    // 90% of that device's own screen height happens to be.
    maxHeight: Math.min(rt.screen.height * 0.9, rt.screen.height - rt.insets.top),
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
