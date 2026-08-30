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
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionSpring, motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { usePortal } from '@/shared/ui/portal/portal';

// `Pressable` is a plain React Native component; wrapping it once, at
// module scope, lets an animated style (the backdrop's drag-tracking
// opacity below) apply to it — an unwrapped `Pressable` only accepts a
// plain style object.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// distance and velocity both dismiss, independently — a slow drag past
// half the sheet's drawn height, or a short, fast flick well under it. half
// the height matches @gorhom/bottom-sheet and UIKit's own half-sheet
// detent; 500pt/s matches the fling-velocity figure common in RN gesture
// tutorials and roughly UIKit's own threshold for a deliberate flick.
// neither number comes from this project's design file, which specifies no
// dismissal physics at all.
const DISMISS_DISTANCE_RATIO = 0.5;
const DISMISS_VELOCITY_THRESHOLD = 500;

// the drawn handle is 7 tall — a 7pt drag target is far under the 44pt
// floor both platforms ask for. the touched region keeps the handle row's
// own full width (already over 44) and only grows vertically: (44 - 27) /
// 2, split evenly above and below the 27-tall row, so the drawn 60×7 pill
// stays unchanged and only the touch target grows.
const HANDLE_TOUCH_EXPANSION = (44 - 27) / 2;

// the handle's own tap-to-close, tightened: `react-native-gesture-
// handler@2.32`'s native default (`TapGestureHandler.kt`'s `maxDist =
// MAX_VALUE_IGNORE`) leaves `Gesture.Tap()` with **no** distance limit
// unless one is set — so a hesitant drag that never travels far enough to
// commit to `pan` below could still land within `tap`'s unbounded distance
// and 500ms default `maxDuration`, resolving `handleGesture`'s `Race` as a
// tap and dismissing the sheet on a touch the user never intended as one.
// this tolerance is the implementer's own choice, not a measurement
// confirmed against a real device.
const HANDLE_TAP_MAX_DISTANCE = 10;

/**
 * a generic bottom sheet — it knows nothing about tabs, cards, or ranges;
 * it renders whatever `children` (and, optionally, `header`) it is given.
 * dismissed by tapping the handle, dragging it down past a threshold, or
 * tapping the backdrop; all three call `onRequestClose` exactly once, per
 * docs/conventions/component-contracts.md's "exactly one outcome callback,
 * exactly once" rule — a drag that springs back open is not a dismissal.
 *
 * **the drag surface is wider than the handle alone.** the drawn handle is
 * a 7pt pill — too small a target to aim reliably, and with the backdrop
 * sitting right below it, a miss dismisses rather than missing harmlessly.
 * `header`, when a caller passes one, drags along with the handle too
 * (`headerPan` below), the same `translateY` and threshold. tap-to-close
 * stays scoped to the handle alone (`tap`, raced only against the handle's
 * own `pan`): it's the only screen-reader-operable dismissal this
 * component has, so widening it into `header` would risk swallowing a
 * real tap on whatever interactive content `header` renders — see
 * `HANDLE_TAP_MAX_DISTANCE`'s comment for the rest of this fix.
 *
 * the drag follows the finger on the **UI thread**: `translateY` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s worklet
 * callbacks, never `PanResponder` or the JS-driven `Animated` — this
 * project's native-job demo exists to prove the JS thread stays responsive
 * under load, and a sheet animating on it would sit oddly beside that.
 *
 * its entrance and exit both animate on `translateY` now (this project's
 * one motion character, `@/core/motion/tokens`'s `motionSpringConfig` — a
 * ~320ms spring with a slight overshoot), symmetrical in both directions:
 * opening slides up from offscreen, and a committed dismissal plays back
 * down offscreen first, only calling `onRequestClose` once that
 * finishes — so by the time the caller flips `visible` to `false`, this
 * component is already offscreen, with no visible jump. the backdrop
 * needs no transition of its own: `animatedBackdropStyle` below derives
 * its opacity from this same `translateY`, so it fades with the sheet by
 * construction rather than on a separate timeline that could drift a
 * frame apart. `visible` flipping to `false` any other way skips the exit
 * animation entirely; this primitive only choreographs the three
 * dismissal paths it owns. the React component itself stays mounted
 * either way — only its rendered output disappears (via `usePortal`
 * below, which hands `<PortalHost />` `null` while `!visible`) — which is
 * what restores its own open position on the next `visible={true}`
 * without a fresh instance (see the effect below). this component always
 * returns `null`; its actual output renders through `<PortalHost />`
 * (`usePortal`, `@/shared/ui/portal/portal`) instead, so it can paint
 * above the tab bar rather than being clipped to whatever screen renders
 * it.
 *
 * **its props type still extends `ComponentProps<typeof View>`, even
 * though this function returns `null`.** the literal JSX return has no
 * root child for docs/conventions/component-contracts.md's
 * props-inheritance rule to read against — but this component does
 * construct a real root `View` (`styles.root` below), just hands that
 * tree to `usePortal` instead of returning it directly. treating that
 * `View` as the root is the more honest reading; the rest spread below
 * lands on it.
 */
export function BottomSheet({
  visible,
  onRequestClose,
  handleAccessibilityLabel = 'Dismiss',
  accessibilityLabel,
  header,
  children,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /**
   * fires once a dismissal is committed — handle tap, drag past the
   * threshold, or backdrop tap — never on a drag that snaps back open.
   * named for the mechanism, not an outcome: docs/conventions/
   * component-contracts.md's "name a callback for the outcome" rule reads
   * backwards here, since a bottom sheet has no outcome of its own — only
   * the caller knows whether closing means discarding a draft, navigating
   * back, or something else.
   */
  onRequestClose: () => void;
  /** read by a screen reader on the drag handle, alongside its
   * `accessibilityRole="button"` — defaults to this component's own
   * generic "Dismiss", since it knows nothing about what any particular
   * caller's sheet is; a caller stacking more than one sheet kind SHOULD
   * pass its own, more specific label. */
  handleAccessibilityLabel?: string;
  /** read by a screen reader on entering the sheet, alongside
   * `accessibilityViewIsModal` — the sheet's own identity ("what am I
   * in"), distinct from `handleAccessibilityLabel` above ("how do I get
   * out"). unlike that prop, this has no generic default this component
   * could supply — a bare "Sheet" would leave a screen-reader user no
   * better off than none — so every caller MUST name its own sheet. */
  accessibilityLabel: string;
  /** rendered directly under the handle, ahead of `children` — the
   * sheet's own optional top chrome (a tab row, say). this component
   * still knows nothing about what `header` is; it only drags along with
   * the handle (see `headerPan` below) and gets the same `CONTENT_GAP`
   * `children` already gets. `undefined` (the default) renders no
   * header — the handle drags alone, this component's previous
   * behaviour. */
  header?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const windowHeight = useWindowDimensions().height;
  const reduceMotion = usePrefersReducedMotion();

  const translateY = useSharedValue(0);
  const dragStartTranslateY = useSharedValue(0);

  const wasVisible = useRef(false);

  // guards the entrance's completion callback against firing after the
  // sheet is hidden by any route other than this component's own three
  // dismissal paths, none of which touch `translateY` — an in-flight
  // spring would otherwise still fire `sheetOpen` once it settles.
  const handleEntranceSettled = useCallback(() => {
    // `wasVisible.current`, not a closured `visible`: the closure would
    // report this render's value, not whatever is current once the
    // spring actually completes.
    if (wasVisible.current) {
      triggerHaptic(HapticEvent.SheetOpen);
    }
  }, []);

  useEffect(() => {
    // `wasVisible.current` updates before scheduling the entrance, not
    // after: a completion callback can fire synchronously (this
    // project's reanimated mock always does), and reading the ref only
    // afterward would see it stale, not yet reflecting this render's
    // `visible`.
    const wasVisibleBefore = wasVisible.current;
    wasVisible.current = visible;

    if (visible && !wasVisibleBefore) {
      // a re-open after a previous dismissal must not render mid-way
      // through last time's exit animation — `commitClose` below leaves
      // `translateY` at `windowHeight` (fully offscreen) when
      // `onRequestClose` fires, and it stays there across the
      // `visible={false}` interval (this component stays mounted, see its
      // doc comment) — so the open position has to be restored explicitly
      // here, before animating in: `windowHeight` first (still offscreen,
      // in case a previous exit never reached it — a dismiss triggered by
      // something other than this component's own three paths, per this
      // component's own doc comment), then the entrance spring toward `0`.
      // both writes land in the same tick, before any frame paints, so
      // there is no visible flash of the fully-open resting position first.
      cancelAnimation(translateY);
      translateY.value = windowHeight;
      // fires on settle, mirroring `commitClose` below — not on this
      // frame. can't route through `motionSpring`: that helper takes no
      // completion callback.
      if (reduceMotion) {
        // no animation plays, so "settled" is now — and synchronously so,
        // with no async gap for `visible` to flip false underneath it, so
        // this branch needs no `handleEntranceSettled`-style guard.
        translateY.value = 0;
        triggerHaptic(HapticEvent.SheetOpen);
      } else {
        translateY.value = withSpring(0, motionSpringConfig, (finished) => {
          // `finished === false` means a drag interrupted the entrance
          // (`buildDragPan`'s `onStart` cancels this animation) — no open
          // haptic fires for that presentation, even if the drag is then
          // released under the threshold and the sheet snaps back open.
          if (finished) {
            runOnJS(handleEntranceSettled)();
          }
        });
      }
    }
    // `translateY` is a stable shared-value ref across this component's
    // lifetime, not a value that changes render to render — including it
    // here would only fire this effect on every value it takes on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight, reduceMotion, handleEntranceSettled]);

  const handleDismissalCommitted = useCallback(() => {
    triggerHaptic(HapticEvent.SheetClose);
    onRequestClose();
  }, [onRequestClose]);

  // shared between the backdrop's plain JS `onPress` and the pan gesture's
  // UI-thread `onEnd` (via `runOnJS`, since only JS-thread code may call a
  // JS function — which also means this function itself always runs back
  // on the JS thread, `runOnJS`'s whole purpose, whichever caller reached
  // it). animates the sheet fully offscreen, then commits the dismissal
  // only once that animation finishes, so `onRequestClose` (and the
  // `sheetClose` haptic riding on it) never fires while the sheet is still
  // visibly sliding away. retimed to this project's one motion character
  // (`@/core/motion/tokens`'s `motionSpring`) so open and close are
  // symmetrical — this used to animate at a plain 250ms `withTiming`,
  // unrelated to the entrance spring above.
  const commitClose = useCallback(() => {
    // `react-hooks/immutability` flags a shared value's `.value` like a
    // plain ref's `.current` once that value is also read inside a
    // `useEffect` (the reset effect above) — a known false positive: a
    // shared value is meant to be mutated exactly like this, and that
    // mutation is what Reanimated propagates to the UI thread. no
    // alternative keeps the drag on the UI thread, which this component's
    // doc comment already commits to.
    if (reduceMotion) {
      // `motionSpring` itself already collapses to an immediate jump when
      // `reduceMotion` is true — but that leaves no animation to call
      // `handleDismissalCommitted` from `onComplete`, so this branch calls
      // it directly instead of reaching for `motionSpring` at all.
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = windowHeight;
      handleDismissalCommitted();
      return;
    }
    translateY.value = withSpring(windowHeight, motionSpringConfig, (finished) => {
      if (finished) {
        runOnJS(handleDismissalCommitted)();
      }
    });
  }, [translateY, windowHeight, handleDismissalCommitted, reduceMotion]);

  // shared by `pan` (the handle's) and `headerPan` (the header's) below —
  // both drag the identical `translateY`/`dragStartTranslateY` shared
  // values through the identical threshold rule. built fresh every
  // render, unlike `../selection-grid/selection-grid.tsx`'s memoized
  // `Gesture.Pan()` (documented on its own build site): nothing here
  // calls `setState` or a prop callback mid-drag — the drag lives
  // entirely in `translateY`, a UI-thread shared value — so there's no
  // render to interrupt itself with. a caller flipping `visible` mid-drag
  // could still rebuild these gestures underneath an active touch; that
  // residual risk is accepted rather than adding `selection-grid.tsx`'s
  // ref-context machinery for it.
  function buildDragPan() {
    return Gesture.Pan()
      .onStart(() => {
        cancelAnimation(translateY);
        dragStartTranslateY.value = translateY.value;
      })
      .onUpdate((event) => {
        // never past the open position — no upward rubber-band, since
        // there's nothing above "open" to reveal. no
        // `react-hooks/immutability` suppression needed here, unlike
        // `commitClose`'s write above: that false positive is specific to
        // a shared value also read inside a top-level `useEffect`; nested
        // inside this factory function, the rule doesn't flag it.
        translateY.value = Math.max(0, dragStartTranslateY.value + event.translationY);
      })
      .onEnd((event) => {
        const draggedPastThreshold = event.translationY > windowHeight * DISMISS_DISTANCE_RATIO;
        const flickedPastThreshold = event.velocityY > DISMISS_VELOCITY_THRESHOLD;

        if (draggedPastThreshold || flickedPastThreshold) {
          runOnJS(commitClose)();
        } else {
          // retimed to this project's one motion character — see
          // `commitClose`'s own comment on why open and close are
          // symmetrical now; a released drag that snaps back open takes
          // the same spring. `motionSpring` runs equally well from this
          // UI-thread worklet as it does from the JS-thread effect above
          // (see that function's own doc comment) — `buildDragPan` is
          // rebuilt fresh every render (this factory's own doc comment),
          // so `reduceMotion` below is always this render's latest value.
          translateY.value = motionSpring(0, reduceMotion);
        }
      });
  }

  const pan = buildDragPan().hitSlop({
    top: HANDLE_TOUCH_EXPANSION,
    bottom: HANDLE_TOUCH_EXPANSION,
  });

  // the header's own drag — plain `pan` only, never raced against a tap:
  // the handle keeps sole ownership of tap-to-close (see `tap` below), so
  // a tap elsewhere in the header — a tab press, say — reaches its own
  // `Pressable` untouched. `Gesture.Pan()`'s native default activation
  // distance (Android's system touch slop, confirmed against
  // `PanGestureHandler.kt`'s `defaultMinDist`) is small enough that a
  // discrete tap never crosses it, so nothing here has to suppress that
  // explicitly.
  const headerPan = header !== undefined ? buildDragPan() : null;

  // tightened per this change: `react-native-gesture-handler@2.32`'s type
  // definitions confirm `Gesture.Tap()` offers `.maxDistance()` and
  // `.maxDuration()` (`tapGesture.d.ts`) — `maxDistance` is set explicitly
  // below since the native default leaves it unbounded (see
  // `HANDLE_TAP_MAX_DISTANCE`'s comment); `maxDuration` stays at its
  // 500ms default, since the defect fixed here is an unbounded distance,
  // not a duration that was ever too generous.
  const tap = Gesture.Tap()
    .hitSlop({ top: HANDLE_TOUCH_EXPANSION, bottom: HANDLE_TOUCH_EXPANSION })
    .maxDistance(HANDLE_TAP_MAX_DISTANCE)
    .onEnd(() => {
      runOnJS(commitClose)();
    });

  if (testID) {
    // exposes every gesture to `getByGestureTestId`/`fireGestureHandler`
    // from `react-native-gesture-handler/jest-utils`, same as
    // `../selection-grid/selection-grid.tsx`'s `pan` — see that
    // component's doc comment for what that testing module can and can't
    // reach. real on-device drag and tap recognition both stay
    // unreachable regardless (see `bottom-sheet.test.tsx`).
    pan.withTestId('drag');
    tap.withTestId('tap');
    headerPan?.withTestId('header-drag');
  }

  // a tap and a drag both start the same way — a finger touching the
  // handle — so `Race` lets a short, still touch resolve as the tap while
  // a touch that moves resolves as the drag, without the two gestures
  // fighting over it.
  const handleGesture = Gesture.Race(tap, pan);

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // fades with the sheet's own `translateY`, not a separate timeline: 0
  // (open) reads fully opaque, `windowHeight` (offscreen) reads fully
  // transparent, and every position between — mid-drag included — reads
  // proportionally. this keeps a half-dragged sheet from ever showing a
  // fully opaque scrim behind it; both this and `animatedSheetStyle`
  // above read the same UI-thread shared value, so the two can never
  // drift a frame apart.
  const animatedBackdropStyle = useAnimatedStyle(() => {
    const progress =
      windowHeight > 0 ? Math.min(1, Math.max(0, translateY.value / windowHeight)) : 0;
    return { opacity: 1 - progress };
  });

  // rendered through the portal (`usePortal`) rather than returned
  // directly: this component is reached from inside `Tabs`' own screen
  // tree (`src/app/(tabs)/index.tsx`), a sibling underneath the tab bar
  // `Tabs` draws, so returning this JSX in place would clip it to that
  // screen's area, never able to paint over the tab bar. `<PortalHost />`,
  // mounted once in `src/app/_layout.tsx` above `<Stack>`, renders
  // whatever this hook hands it — see that component's doc comment for why
  // every context this JSX depends on (Unistyles' theme, `react-i18next`'s
  // translations, gesture-handler's root context) still resolves from
  // there. `null` while `!visible` is `usePortal`'s own "renders nothing"
  // case.
  usePortal(
    visible ? (
      // `style` merged last, after this component's `styles.root`, so a
      // caller extending it doesn't wipe the full-bleed positioning every
      // child is anchored against; every other rest prop is spread after
      // `testID` so a caller can still override an explicit default, same
      // ordering `SegmentedTabs` uses.
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
          {header !== undefined && headerPan !== null ? (
            <GestureDetector gesture={headerPan}>
              <View style={styles.header} testID={testID ? 'header' : undefined}>
                {header}
              </View>
            </GestureDetector>
          ) : null}
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </View>
    ) : null,
  );

  return null;
}

/** derived from the component's own argument type — per
 * docs/conventions/component-contracts.md's props-declaration rule — so
 * this stays a single source of truth rather than a hand-duplicated copy,
 * while keeping `BottomSheetProps` importable exactly as before. */
export type BottomSheetProps = ComponentProps<typeof BottomSheet>;

// 24 (top corners), 60×7 (handle), 20 (handle's top offset within its
// 27-tall row), 14.5 (side padding), and 40 (gap below the handle row) are
// all the design's own measured values — see docs/conventions/
// design-system.md's Spacing and Radius section on why faithful
// reproduction, not normalizing onto the 4/8px grid, is the default now.
const SHEET_CORNER_RADIUS = 24;
const HANDLE_ROW_HEIGHT = 27;
const HANDLE_TOP_OFFSET = 20;
// exported: `../../../features/hand-ranges/ui/card-fan-geometry.ts` reads
// this rather than keeping its own copy — see that file's own doc comment
// on why, now that its fan-width fix (PR #70) depends on this exact value
// rather than merely a coincidentally-equal one.
export const SIDE_PADDING = 14.5;
const CONTENT_GAP = 40;

// the design's own reference frame width (docs/conventions/
// design-system.md's `430×932` samples, and this project's existing "430
// reference" already named in ../../features/hand-ranges/ui/
// card-fan-geometry.test.ts and hand-range-pane.tsx) — the design file also
// draws frames at 393 wide, but this project's own code has already
// settled on 430 as its one sizing reference, so this follows that rather
// than introducing a second. capping the panel here keeps it at or below
// its designed scale on any viewport wider than this — a tablet, an
// unfolded foldable, or a landscape phone (real-device feedback, PR #70).
// exported for the same reason `SIDE_PADDING` above is.
export const PANEL_MAX_WIDTH = 430;

/**
 * `SIDE_PADDING`, widened only as far as a physical screen edge's own
 * `inset` (react-native-unistyles' `rt.insets.left`/`.right` — non-zero for
 * a landscape notch) actually reaches inside the panel. Below
 * `PANEL_MAX_WIDTH` the panel spans the full screen, so its edge and the
 * screen's edge coincide and this reduces to `Math.max(inset,
 * SIDE_PADDING)` — this component's own padding before the cap existed.
 * Above the cap the panel is centred and narrower than the screen: the
 * panel's own edge sits `panelEdgeGap` in from the physical screen edge,
 * and an inset smaller than that gap never reaches the panel at all, so
 * this falls back to plain `SIDE_PADDING` — the case a landscape iPhone
 * (wide enough to trigger the cap, and the one device shape with a
 * non-zero side inset) actually exercises.
 */
// exported alongside `SIDE_PADDING` and `PANEL_MAX_WIDTH` above, for the
// same reason: `sheetContentWidth` below, and `../../../features/
// hand-ranges/ui/card-fan-geometry.ts`, both call this directly now
// rather than reimplementing its cap-and-inset arithmetic.
export function sidePadding(inset: number, screenWidth: number): number {
  const panelWidth = Math.min(screenWidth, PANEL_MAX_WIDTH);
  const panelEdgeGap = (screenWidth - panelWidth) / 2;
  return Math.max(SIDE_PADDING, inset - panelEdgeGap);
}

/**
 * the sheet's own content box width — `styles.panel`'s rendered width
 * (`Math.min(screenWidth, PANEL_MAX_WIDTH)`) minus its own left/right
 * `sidePadding` — computed synchronously from the same three terms
 * `styles.panel` below already reads off `useUnistyles()`'s `rt`, rather
 * than measured via `onLayout`. exported so a child rendered inside this
 * sheet's `content` (`../../../features/hand-ranges/ui/cards-pane/
 * cards-pane.tsx`'s fan, PR #70) can lay itself out on its first render
 * instead of waiting a frame for a measurement of a box this function
 * already knows the width of — see that component's own doc comment for
 * why this was worth doing there and the trade-off it accepts by relying
 * on this cross-module read.
 */
export function sheetContentWidth(screenWidth: number, insetLeft: number, insetRight: number) {
  const panelWidth = Math.min(screenWidth, PANEL_MAX_WIDTH);
  return panelWidth - sidePadding(insetLeft, screenWidth) - sidePadding(insetRight, screenWidth);
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  // `theme.colors.scrim` — a colour role this change added, since the
  // design file draws the sheet with nothing behind it and this project's
  // colour table had no "backdrop" role until now. see that token's doc
  // comment (`src/core/theme/tokens.ts`) and docs/conventions/
  // design-system.md's "Bottom Sheet Scrim" entry for the value and the
  // maintainer decision behind it. the *opacity* that fades this in and
  // out with the drag animates separately, in `animatedBackdropStyle` —
  // this base style only carries the flat colour and full-bleed
  // positioning.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.scrim,
  },
  panel: {
    // capped and centred above `PANEL_MAX_WIDTH` — see that constant's own
    // comment. below the cap, `width: '100%'` alone decides the panel's
    // width (as before this change) and `alignSelf: 'center'` is a no-op,
    // since there is no leftover width for it to centre within.
    width: '100%',
    maxWidth: PANEL_MAX_WIDTH,
    alignSelf: 'center',
    paddingStart: sidePadding(rt.insets.left, rt.screen.width),
    paddingEnd: sidePadding(rt.insets.right, rt.screen.width),
    // correct now that this component renders through `<PortalHost />`
    // rather than inside a tab screen: the panel's bottom edge is the
    // physical bottom of the window, where the home indicator or gesture
    // bar actually sits, so this inset is exactly the clearance it needs.
    // before the portal fix this sheet rendered inside `Tabs`' own screen
    // content, whose bottom edge sat above the tab bar (which already
    // clears the home indicator itself) — so this same inset was
    // clearance added a second time against a boundary that was never the
    // physical screen edge.
    paddingBottom: rt.insets.bottom,
    // a safety floor, not a design measurement — the design file specifies
    // no sheet height, and this component's content is whatever
    // `children` a caller gives it, unbounded. without a cap, overflow
    // pushes the handle row (and any header) off the top of the screen
    // while the panel still covers the backdrop underneath — both of this
    // sheet's dismiss paths become unreachable at once. capping at a
    // fraction of the screen keeps the backdrop above the panel always
    // tappable, so a backdrop tap stays a working dismissal even when
    // content badly overflows.
    //
    // `rt.screen.height - rt.insets.top` is a second, independent cap: the
    // 90% fraction alone bounds the panel's size, not its position, and
    // says nothing about the status bar or a notch — a tall enough panel
    // could still grow up underneath one. since the panel is anchored to
    // the window's bottom (`styles.root`'s `justifyContent: 'flex-end'`),
    // taking whichever cap is smaller keeps the panel's own top edge from
    // ever rising above `rt.insets.top`, on any device, regardless of 90%
    // of that device's screen height.
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
  // the same `CONTENT_GAP` `content` below already carries, applied again
  // between the handle and `header` when a caller passes one — the
  // "handle row to tab row" landmark gap `../../features/hand-ranges/ui/
  // holding-input-sheet/holding-input-sheet.tsx`'s doc comment names, now
  // owned here instead of by that caller's own root `View`.
  header: {
    marginTop: CONTENT_GAP,
  },
  content: {
    marginTop: CONTENT_GAP,
  },
}));
