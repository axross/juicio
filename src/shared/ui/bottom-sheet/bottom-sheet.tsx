import { BlurView } from 'expo-blur';
import type { ComponentProps, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import type { NativeGesture, PanGesture } from 'react-native-gesture-handler';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionColor, motionSpring, motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { useBlurTargetRef } from '@/shared/ui/blur-target/blur-target';
import { usePortal } from '@/shared/ui/portal/portal';

import { isEntranceArrival } from './entrance-arrival';

// `Pressable` is a plain React Native component; wrapping it once, at
// module scope, lets an animated style (the backdrop's drag-tracking
// opacity below) apply to it — an unwrapped `Pressable` only accepts a
// plain style object.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// `expo-blur`'s own `BlurView` is a class component exposing
// `getAnimatableRef()` specifically so `Animated.createAnimatedComponent`
// can animate its underlying native view — the same reasoning
// `AnimatedPressable` above states for `Pressable`, on a component this
// library documents supporting it rather than one this project verified by
// reading its source alone.
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// a fixed prop, never animated — animating `BlurView`'s own `intensity` via
// `react-native-reanimated`'s `useAnimatedProps` is a currently-unreliable
// pattern on this library, on both iOS and Android. only the backdrop's
// existing `opacity` animates, shared unchanged with the flat-colour layer
// below. see docs/conventions/design-system.md's "Bottom Sheet Scrim" entry
// for the value and why it was chosen.
const BACKDROP_BLUR_INTENSITY = 50;

// `expo-blur@57.0.2`'s own `blurMethod="dimezisBlurViewSdk31Plus"` is not a
// true no-op below Android API 31, despite what its high-level TypeScript
// doc comment implies. Traced against its actual Android source
// (`node_modules/expo-blur/android/src/main/java/expo/modules/blur/
// {ExpoBlurView,BlurModule}.kt`, `enums/TintStyle.kt`): `applyTint()`/
// `applyBlurRadius()` still call `setBackgroundColor` with a computed tint
// colour even on the "no blur" path, painting a real, extra translucent
// dark-grey layer underneath the existing flat scrim — a visible change from
// today's composite colour, not the pixel-identical backdrop this project's
// design (docs/conventions/design-system.md's "Bottom Sheet Scrim" entry)
// calls for below that floor. This constant is what actually decides whether
// the blur layer renders at all, computed once at module scope since a
// device's platform and OS version can't change at runtime — the JSX below
// renders nothing extra where this is `false`, leaving the existing
// `AnimatedPressable` flat scrim as the only backdrop layer there, exactly
// as it painted before this file ever added a blur layer.
const SUPPORTS_BACKDROP_BLUR =
  Platform.OS === 'ios' || (Platform.OS === 'android' && Platform.Version >= 31);

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
 * what `BottomSheet` hands its two compound-child slots — mirrors
 * `../portal/portal.tsx`'s own `PortalContext`, a registration channel
 * rather than a value either slot invents for itself. `BottomSheetHeader`
 * reads only `headerPan`; `BottomSheetBody` reads `contentPan`,
 * `nativeGesture`, and `scrollOffset` — see each field's own doc comment
 * below, and `BottomSheet`'s own doc comment for the gating this pairing
 * exists for.
 */
type BottomSheetSlotContextValue = {
  /** the header's own pan-to-dismiss gesture — unconditional, exactly like
   * `BottomSheet`'s own doc comment describes. */
  readonly headerPan: PanGesture;
  /** the content area's own pan-to-dismiss gesture — gated on
   * `scrollOffset` below; see `BottomSheet`'s own doc comment. */
  readonly contentPan: PanGesture;
  /** wraps `BottomSheetBody`'s own `Animated.ScrollView`, so
   * `contentPan.simultaneousWithExternalGesture(nativeGesture)` has a
   * concrete gesture to compose against. */
  readonly nativeGesture: NativeGesture;
  /** the `Animated.ScrollView`'s own live scroll offset, written on the UI
   * thread by `BottomSheetBody`'s `useAnimatedScrollHandler` and read by
   * `contentPan`'s own worklets — never through `runOnJS`. */
  readonly scrollOffset: SharedValue<number>;
};

const BottomSheetSlotContext = createContext<BottomSheetSlotContextValue | null>(null);

/** throws when a slot component renders outside `<BottomSheet>` — the same
 * shape `../portal/portal.tsx`'s `usePortal` throws for a node rendered
 * outside `<PortalHost />`. */
function useBottomSheetSlot(componentName: string): BottomSheetSlotContextValue {
  const context = useContext(BottomSheetSlotContext);
  if (context === null) {
    throw new Error(`<${componentName}> must be rendered inside <BottomSheet>`);
  }
  return context;
}

/**
 * a generic bottom sheet — it knows nothing about tabs, cards, or ranges; it
 * is a compound component, `<BottomSheet><BottomSheetHeader>…</BottomSheetHeader>
 * <BottomSheetBody>…</BottomSheetBody></BottomSheet>` (`BottomSheetHeader`
 * optional, `BottomSheetBody` required), and renders each slot's own
 * `children` wherever that slot belongs — `BottomSheetHeader`'s fixed at the
 * top, outside the scrolling area; `BottomSheetBody`'s inside the scrolling
 * `Animated.ScrollView` below. Slot registration mirrors
 * `../portal/portal.tsx`'s own `PortalContext` pattern: `BottomSheetSlotContext`
 * hands each slot component the gesture and scroll-offset primitives this
 * component owns, rather than either slot inventing its own. dismissed by
 * tapping the handle, dragging it down past a threshold, or tapping the
 * backdrop; all three call `onRequestClose` exactly once, per
 * docs/conventions/component-contracts.md's "exactly one outcome callback,
 * exactly once" rule — a drag that springs back open is not a dismissal.
 *
 * **the drag surface is wider than the handle alone.** the drawn handle is
 * a 7pt pill — too small a target to aim reliably, and with the backdrop
 * sitting right below it, a miss dismisses rather than missing harmlessly.
 * `BottomSheetHeader`, when a caller renders one, drags along with the
 * handle too (`headerPan` below), the same `translateY` and threshold — and
 * so does `BottomSheetBody`, the sheet's own scrolling content area
 * (`contentPan` below): active anywhere inside it that isn't already
 * claimed by a pan or swipe gesture belonging to that content, so a caller
 * with nothing interactive to show (the Equity Breakdown sheet's chart) can
 * still be dragged closed from anywhere in it, not only from the 7pt
 * handle. tap-to-close stays scoped to the handle alone (`tap`, raced only
 * against the handle's own `pan`): it's the only screen-reader-operable
 * dismissal this component has, so widening it into either slot would risk
 * swallowing a real tap on whatever interactive content either one renders
 * — see `HANDLE_TAP_MAX_DISTANCE`'s comment for the rest of this fix.
 * `contentPan`, like `headerPan`, is plain `pan` with no tap raced against
 * it, for exactly that reason.
 *
 * **`contentPan` is gated on `BottomSheetBody`'s own live scroll position,
 * not unconditional the way `headerPan` is.** `BottomSheetBody` renders its
 * `children` inside an `Animated.ScrollView`, tracking its scroll offset in
 * a UI-thread shared value (`scrollOffset` below) via
 * `useAnimatedScrollHandler` — no JS-thread round trip. `contentPan`'s own
 * `onStart`/`onUpdate`/`onEnd` worklets read that shared value directly and
 * no-op unless it reads `<= 0`: at scroll-top this behaves identically to an
 * unconditional pan — what a non-scrolling caller like the Equity Breakdown
 * chart's histogram half always sees — and once the content is scrolled
 * away from the top the sheet stops moving under a content-area drag,
 * leaving the touch to the `Animated.ScrollView`'s own native scroll
 * instead, a live check repeated on every frame rather than a one-time
 * arbitration.
 * `contentPan.simultaneousWithExternalGesture(nativeGesture)` (`nativeGesture`,
 * `Gesture.Native()`, wraps the `Animated.ScrollView` itself, inside
 * `BottomSheetBody`) is what lets both gestures run at once at all, and the
 * live scroll-offset read is what then decides, frame by frame, which one
 * actually moves the sheet. See
 * `docs/decisions/2026-09-05-gate-bottom-sheet-content-drag-on-scroll-position.md`
 * for why this relation is explicit and live rather than one of this
 * library's fixed win/lose relations, and for how it narrows
 * `docs/decisions/2026-09-04-extend-bottom-sheet-drag-to-move-close-into-content.md`;
 * that earlier record's own subject — a caller's own nested content gesture
 * (`../cards-pane/cards-pane.tsx`'s `FanArc`,
 * `../selection-grid/selection-grid.tsx`'s own `Gesture.Pan()`) — still
 * relies on this library's implicit cross-detector arbitration, now against
 * both `contentPan` and `nativeGesture` rather than `contentPan` alone. The
 * exact scroll-to-drag handoff — a touch that begins scrolled away from the
 * top and reaches the top mid-gesture — is not exercised by this file's own
 * tests, which drive `contentPan` directly through `fireGestureHandler`
 * rather than a real touch stream a `ScrollView` and a `Gesture.Pan()` would
 * actually arbitrate between; it needs a real device to confirm.
 *
 * the drag follows the finger on the **UI thread**: `translateY` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s worklet
 * callbacks, never `PanResponder` or the JS-driven `Animated` — this
 * project's native-job demo exists to prove the JS thread stays responsive
 * under load, and a sheet animating on it would sit oddly beside that.
 *
 * its entrance and exit both animate `translateY` (this project's one
 * movement character, `@/core/motion/tokens`'s `motionSpringConfig` — a
 * ~320ms spring with a slight overshoot), symmetrical in both directions:
 * opening slides up from offscreen, and a committed dismissal plays back
 * down offscreen.
 *
 * **the entrance's travel starts on the sheet's own first visible frame,
 * never on the request to open it.** `translateY` is placed at its
 * offscreen position before the sheet's contents can ever be painted, and
 * the spring toward the open position starts from `handlePanelLayout`
 * below — the panel's own `onLayout`, the earliest moment this component
 * can know its surface is genuinely on screen with its contents present,
 * not merely requested. `isPanelRendering`'s own doc comment covers the
 * mount-side half of this. See
 * [decisions/2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md](../../../../docs/decisions/2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md).
 *
 * **a sheet mounted already `visible={true}` needs its very first painted
 * frame — the one `usePortal`'s own `useLayoutEffect` registration hands
 * the portal before this component's own `useEffect`s below have run at
 * all — to already be correct, not merely corrected a frame later.** a
 * plain `useEffect` runs only once React has already committed and painted;
 * seeding `translateY` and `isEntranceLeading` from `0`/`false` and
 * correcting them there, as every other value here does, would leave that
 * very first frame with an unmoved `translateY` and a scrim
 * `animatedBackdropStyle` derives from its position formula — reading as
 * fully opaque, since `translateY` hasn't moved yet — while `isPanelRendering`
 * (below) is still `false`: an opaque scrim over nothing. `translateY` and
 * `isEntranceLeading` are seeded straight from `visible` (and, for the
 * latter, `reduceMotion`) at their own `useSharedValue` calls below instead,
 * so that first frame is already offscreen-and-transparent before any effect
 * gets a chance to run — see each one's own doc comment.
 *
 * **the scrim runs its own timeline for the entrance only, on this
 * project's colour/opacity character (`motionColor`/
 * `motionColorTimingConfig`), rather than being derived from
 * `translateY`.** `scrimOpacity` starts fading toward full strength the
 * instant the sheet is asked to open, well before its contents exist — the
 * scrim can reach the screen while the expensive part is still being
 * built, instead of arriving in the same commit as those contents and
 * waiting on them, which is the entrance defect the decision record above
 * fixes. `isEntranceLeading` (below) is what `animatedBackdropStyle`
 * consults to know which of the two sources to trust; its own doc comment
 * says exactly when that lead starts and ends. Everywhere else — a drag,
 * a drag's own release (whether that release commits to dismiss or snaps
 * back open), and a committed exit reached with no drag at all — the
 * scrim keeps deriving straight from `translateY`'s own position: the
 * formula `buildDragPan`'s `onUpdate` below still writes on every drag
 * frame, and `animatedBackdropStyle` itself computes once
 * `isEntranceLeading` is `false`. Only the entrance ever gives the scrim a
 * timeline independent of where the sheet actually is.
 *
 * **`onRequestClose` fires immediately once a dismissal commits, before
 * the exit even starts playing — not once it finishes.** an underdamped
 * spring (a slight overshoot, by design) settles well after the sheet
 * already reads as offscreen, so a caller whose own state update
 * (`../../../features/hand-ranges/ui/holding-input-sheet/
 * holding-input-sheet.tsx`'s `onSubmit`/`onDismiss`, and everything
 * downstream of them) waited on that settling would be waiting on an
 * animation it has no reason to wait for. only the `sheetClose` haptic
 * still waits for the exit to actually settle — a haptic firing before
 * the sheet visually finishes moving would read as premature, which
 * `onRequestClose`'s own caller-facing state update has no equivalent
 * concern for.
 *
 * **the `sheetOpen` haptic fires at the entrance spring's first arrival at
 * the open position, not once it finishes settling — the opposite bar from
 * `sheetClose` two paragraphs up.** `motionSpringConfig`'s own doc comment
 * (`@/core/motion/tokens`) records that a spring's real settle time runs
 * roughly 1.5× its nominal duration, so firing on settle instead would
 * trail the sheet's own visual landing by a noticeable margin. Firing on
 * the spring's first crossing of the open position instead — rather than
 * inventing a threshold distance or a fixed delay — needs no new constant:
 * `motionSpringConfig`'s own `dampingRatio: 0.8` is deliberately
 * underdamped, which guarantees `translateY` crosses `0` on its way to
 * overshooting slightly past it, so that crossing already exists and
 * already coincides with the sheet's own visual landing. See
 * `useAnimatedReaction` below (`handleEntranceArrived`, `isEntranceInFlight`,
 * and `./entrance-arrival.ts`) for the mechanism, and
 * `docs/conventions/haptics.md`'s `sheetOpen` row for the rule this states
 * from the caller's side.
 *
 * **this component tracks its own "still rendering" state internally
 * (`isRendering` below), independent of the `visible` prop, to make that
 * timing change safe.** a caller almost always flips `visible` to `false`
 * from inside `onRequestClose` itself — which, now that `onRequestClose`
 * fires at the *start* of the exit, means `visible` usually goes false
 * while the exit is still playing. gating the portal's own output
 * directly on `visible` would unmount the sheet the instant the prop
 * changed, cutting the exit short and reading as a snap rather than a
 * slide. `isRendering` instead
 * flips to `false` only once the exit's own completion callback runs
 * (`handleExitSettled` below) — or immediately, under reduce motion,
 * where there is nothing to wait for — so the exit always plays out in
 * full regardless of how quickly the caller reacts to `onRequestClose`.
 * `visible` flipping to `false` through some route other than this
 * component's own three dismissal paths (none of which this effect can
 * distinguish from one already in flight — see `isClosingRef` below)
 * still hides immediately, skipping the exit animation entirely: this
 * primitive only choreographs the three dismissal paths it owns.
 *
 * **this whole scheme was reasoned about against one specific consumer
 * shape, which both of today's consumers happen to share.** those two are
 * `../../../features/hand-ranges/ui/holding-input-sheet/
 * holding-input-sheet.tsx` and `../../../features/evaluations/ui/
 * board-input-sheet/board-input-sheet.tsx`. each passes its own `visible`
 * prop straight through to this component unchanged, and each
 * `handleRequestClose` only decides `onSubmit` vs `onDismiss`, touching no
 * visibility state of its own. it is *their* shared caller —
 * `../../../features/evaluations/ui/analyze-screen/analyze-screen.tsx` —
 * that owns the state both props resolve to, and flips each to its closed
 * value synchronously and unconditionally from inside both handlers, with
 * no branch that leaves either open. each sheet's own input state also
 * reseeds on the `visible` false-to-true transition only (`useHoldingInput`
 * / `useBoardInput`), never on the false one, so neither is emptied out
 * from under the exit animation that is still playing.
 *
 * that shape is what makes the `isRendering`/`isClosingRef` machinery
 * above safe. a *further* consumer that ever left `visible` `true` past
 * `onRequestClose`, flipped it only on some paths, flipped it after an
 * await rather than synchronously, or cleared its own displayed state on
 * the closing transition, would need this reasoning re-checked against its
 * own shape before relying on it — nothing here enforces the assumption,
 * and this component would keep silently doing the wrong thing rather than
 * surfacing it. counting consumers is not the check; matching that shape
 * is.
 *
 * the React component itself stays mounted whether or not it is
 * currently rendering its output — only its rendered output disappears
 * (via `usePortal` below, which hands `<PortalHost />` `null` while
 * `!isRendering`) — which is what restores its own open position on the
 * next `visible={true}` without a fresh instance (see the effect below).
 * this component always returns `null`; its actual output renders
 * through `<PortalHost />` (`usePortal`, `@/shared/ui/portal/portal`)
 * instead, so it can paint above the tab bar rather than being clipped to
 * whatever screen renders it.
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
  onOpened,
  handleAccessibilityLabel = 'Dismiss',
  accessibilityLabel,
  children,
  testID,
  style,
  maxWidth,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /**
   * fires once a dismissal is committed — handle tap, drag past the
   * threshold, or backdrop tap — never on a drag that snaps back open.
   * fires immediately, at the moment the dismissal commits, not once the
   * exit animation finishes playing — see this component's own doc
   * comment for why, and for why this component keeps rendering on its
   * own terms afterward rather than depending on the caller's `visible`
   * prop to stay true for that long. named for the mechanism, not an
   * outcome: docs/conventions/component-contracts.md's "name a callback
   * for the outcome" rule reads backwards here, since a bottom sheet has
   * no outcome of its own — only the caller knows whether closing means
   * discarding a draft, navigating back, or something else.
   */
  onRequestClose: () => void;
  /**
   * fires once, the moment this sheet visually finishes opening — the
   * exact same frame `handleEntranceArrived` below already fires the
   * `sheetOpen` haptic from, never once the entrance spring finishes
   * settling (see that callback's own doc comment for why those two
   * moments differ). Optional and inert for every caller that does not
   * pass it — this component's own opening behaviour is unchanged either
   * way. A caller that needs to know when its own content may safely
   * start an entrance of its own, without racing this sheet's own slide-up
   * (issue #228), reads this rather than reaching for this component's
   * internal, non-exported animation state.
   */
  onOpened?: () => void;
  /** read by a screen reader on the drag handle, alongside its
   * `accessibilityRole="button"` — defaults to this component's own
   * generic "Dismiss", since it knows nothing about what any particular
   * caller's sheet is; a caller stacking more than one sheet kind should
   * pass its own, more specific label. */
  handleAccessibilityLabel?: string;
  /** read by a screen reader on entering the sheet, alongside
   * `accessibilityViewIsModal` — the sheet's own identity ("what am I
   * in"), distinct from `handleAccessibilityLabel` above ("how do I get
   * out"). unlike that prop, this has no generic default this component
   * could supply — a bare "Sheet" would leave a screen-reader user no
   * better off than none — so every caller must name its own sheet. */
  accessibilityLabel: string;
  /** further narrows the panel's own rendered width below whatever
   * `panelWidth(rt.screen.width)` already computed — `undefined` (the
   * default) leaves that figure untouched. **A dedicated prop, not the
   * caller's `style`**,
   * because `style` above merges onto `styles.root` — this component's
   * full-bleed portal root — not onto `styles.panel`, the box this actually
   * needs to constrain (see this component's own doc comment on why its
   * root is a portal's, and the table row in
   * docs/conventions/component-styling.md's "The Caller's Style Lands on
   * the JSX Root" for a portal-rendered component generally). Per that same
   * document's "Override Versus Variant" rule, how much room a component
   * gets is ordinarily exactly what a caller's `style` is for — this would
   * be one if `style` reached the panel at all; it stays a second, narrower
   * prop only because that channel already goes somewhere else. Applied as
   * a `maxWidth` alongside the panel's own already-capped `width`
   * (`styles.panel` below), not a replacement for it, so a value at or past
   * `PANEL_MAX_WIDTH` constrains nothing further — see
   * `@/shared/ui/edit-sheet-max-width.ts`'s own doc comment, the one
   * caller-side helper that can produce a value at all today. */
  maxWidth?: number;
  /** exactly one `<BottomSheetHeader>` (optional) followed by exactly one
   * `<BottomSheetBody>` (required) — this component's own compound-child
   * slots, registered through `BottomSheetSlotContext` below rather than
   * inspected here via `React.Children`. `BottomSheetHeader` renders where
   * this component's own drag handle expects its optional top chrome (a tab
   * row, say); `BottomSheetBody` renders inside the scrolling
   * `Animated.ScrollView` every sheet needs, since every sheet has content
   * but not every sheet has a header. Typed as plain `ReactNode` — a
   * stricter type could not enforce this shape without the same
   * `React.Children` inspection this component's own contract avoids — so a
   * caller that renders neither, or something else entirely, is caught only
   * by `useBottomSheetSlot`'s own runtime error, the same way `usePortal`
   * catches a component rendered outside `<PortalHost />`. */
  children: ReactNode;
  testID?: string;
}) {
  const windowHeight = useWindowDimensions().height;
  const reduceMotion = usePrefersReducedMotion();
  // the ref Android's blur method samples from — see
  // `@/shared/ui/blur-target/blur-target`'s own doc comment for why this
  // context has to reach all the way up to `src/app/_layout.tsx`, above
  // `<PortalHost />`, rather than something this component could supply on
  // its own.
  const blurTargetRef = useBlurTargetRef();

  // offscreen already, on the very first render, when this component mounts
  // already `visible={true}` — not only once the visibility effect below
  // gets a chance to run. that effect is what resets this to `windowHeight`
  // before every *later* fresh entrance (a few lines into its own `visible
  // && !wasVisibleBefore` branch) — but it's a plain `useEffect`, which
  // React runs only after the first frame is already painted, and
  // `usePortal`'s own registration (a `useLayoutEffect`, flushed *before*
  // paint) can hand that first frame a backdrop built from whatever
  // `translateY` held at render time. seeding it here instead of at a flat
  // `0` is what keeps that first frame already correct — see this
  // component's own doc comment (the paragraph on a sheet mounted already
  // `visible={true}`) and `isEntranceLeading`'s own seed a few lines down,
  // which the same first frame depends on together with this one.
  const translateY = useSharedValue(visible ? windowHeight : 0);
  const dragStartTranslateY = useSharedValue(0);
  // whether `buildDragPan`'s own scroll gate (the `scrollOffset`-based
  // check every callback below repeats) was open on the **previous**
  // callback invocation of the gesture currently in progress — the one
  // piece of state `event.translationY` alone can't supply, and the one
  // this project's own decision record
  // (docs/decisions/2026-09-05-gate-bottom-sheet-content-drag-on-scroll-
  // position.md) already claims this live, per-frame check can react to: a
  // touch that starts scrolled away from the top and crosses back to it
  // mid-gesture. seeded `true` — matching `pan`/`headerPan`, whose gate
  // (no `scrollOffset` argument at all) reads as open on every call they
  // ever make, so this value never has anything to catch a transition
  // against for either of them. shared across `pan`/`headerPan`/
  // `contentPan`, the same way `dragStartTranslateY` above is: only one of
  // the three is ever mid-gesture at once, and `onStart` below
  // unconditionally rewrites this at the start of every fresh gesture
  // before anything else reads it.
  const dragGateWasOpen = useSharedValue(true);
  // `event.translationY` at the moment `dragStartTranslateY` above was
  // last captured for the gesture in progress — either at `onStart`, when
  // the gate was already open, or at the first `onUpdate` call the gate
  // opens on mid-gesture. `event.translationY` is the touch's own
  // cumulative displacement since it began, never since any later point,
  // so subtracting this from every later frame's own `event.translationY`
  // before adding it to `dragStartTranslateY` is what lets a gate opening
  // mid-touch read as a fresh zero-reference instead of carrying the
  // touch's earlier, gated-out displacement forward into a visible jump.
  // seeded `0`, matching the untouched `event.translationY` a gesture's
  // own `onStart` always begins at.
  const dragTranslationYOffset = useSharedValue(0);
  // the scrim's own timeline — see this component's own doc comment (entrance
  // option B) for why it derives independently of `translateY`. starts fully
  // transparent regardless of `visible`; the visibility effect below is what
  // fades it in, on every path that also sets `isRendering` true, so a
  // caller mounting this component already `visible={true}` still sees it
  // fade rather than appearing pre-lit. read only while `isEntranceLeading`
  // below is `true` — see that shared value's own doc comment for why this
  // one carries no meaning the rest of the time. reset to this same `0`
  // again immediately before every fresh entrance's own fade starts (the
  // visibility effect below, `startEntranceScrimLead`) — without that
  // reset, a second or later open would find this already at `1`, settled
  // from the previous entrance, and `motionColor`'s `withTiming` would
  // animate from `1` to `1`: no visible fade, only the first open ever
  // showing one.
  const scrimOpacity = useSharedValue(0);
  // `true` for exactly as long as the entrance's own independent scrim
  // timeline (`scrimOpacity` above) should be obeyed instead of the scrim
  // deriving straight from `translateY`'s position — the behaviour the
  // scrim keeps everywhere else (a drag, a drag's own release, and the
  // exit). read by
  // `animatedBackdropStyle` below, on the UI thread. set `true` only at the
  // moment a fresh, non-reduced-motion entrance is requested (the
  // visibility effect below) — reduce motion never sets it, since there is
  // no travel for the scrim to lead ahead of — and reset to `false` the
  // moment anything ends that lead: the entrance's own spring genuinely
  // settling (the `finished` callback each of `translateY`'s two
  // `withSpring(0, motionSpringConfig, ...)` calls below carries — the
  // "already mounted" branch and `handlePanelLayout`), a drag interrupting
  // it (`buildDragPan`'s `onStart`), a dismissal committing (`commitClose`,
  // defensively, since a backdrop tap can commit one without any preceding
  // drag), or the sheet being hidden by a route this component does not own
  // (the visibility effect's own "hidden by another route" branch).
  // whichever of those runs, `animatedBackdropStyle` falls back to deriving
  // the scrim from `translateY` from that point on — which is what lets a
  // drag-release snap-back and the exit keep tracking the sheet's own
  // position exactly as they did before this scrim ever had a timeline of
  // its own for the entrance.
  //
  // seeded `true` here, on the first render, for the same reason
  // `translateY` above is seeded offscreen rather than at a flat `0`: a
  // sheet mounted already `visible={true}` needs its *first* painted
  // frame — built before the visibility effect below ever runs — to
  // already read the scrim from `scrimOpacity` (itself freshly `0`, so
  // this agrees with `translateY`'s own offscreen seed either way) rather
  // than from `animatedBackdropStyle`'s position-derived fallback, which a
  // `translateY` not yet corrected would otherwise read as fully opaque.
  // `reduceMotion` is read here for the same reason the visibility effect
  // below always treats a *first* render as non-reduced regardless of the
  // real OS setting: `usePrefersReducedMotion`'s own doc comment says that
  // read resolves asynchronously and reports `false` until it settles, so
  // this expression is equivalent to plain `visible` today — written with
  // `reduceMotion` anyway so it keeps meaning "a fresh, non-reduced entrance
  // is beginning," the same condition the effect below re-derives once that
  // real value is in, rather than silently relying on a coincidence of
  // today's timing.
  const isEntranceLeading = useSharedValue(visible && !reduceMotion);

  // `true` for exactly as long as a fresh, non-reduced-motion entrance's
  // own spring is eligible to fire the open haptic when it first arrives —
  // read by the `useAnimatedReaction` below, on the UI thread, alongside
  // `translateY` itself. armed (`true`) at the same two sites
  // `isEntranceLeading` above is (the "already mounted" and "panel doesn't
  // exist yet" branches of the visibility effect below), and disarmed
  // (`false`) at three of `isEntranceLeading`'s own four: a drag starting
  // (`buildDragPan`'s `onStart`), a dismissal committing (`commitClose`),
  // and the sheet being hidden by a route this component does not own (the
  // visibility effect's own "hidden by another route" branch) — plus a
  // fourth `isEntranceLeading` has no equivalent of: the reaction itself,
  // the moment it fires. **Deliberately missing `isEntranceLeading`'s own
  // fresh-entrance defensive reset before either branch below runs** — not
  // an oversight: that reset exists there to guard against a stale `true`
  // surviving an interrupted previous entrance, but every route that can
  // leave `wasVisible.current` `false` already disarms this value first,
  // synchronously, before the fresh-entrance branch can ever run again —
  // `commitClose` (below) writes `false` before `onRequestClose` ever gives
  // a caller the chance to flip `visible`, and the "hidden by another
  // route" branch writes `false` in the same run that sets
  // `wasVisible.current` `false`. A fourth write here would only ever
  // overwrite an already-`false` value the instant before this same branch
  // sets it `true` again — observable churn with nothing left to guard
  // against, unlike `isEntranceLeading`'s own reset, which really can still
  // be mid-spring (not yet settled to `false`) when a re-open interrupts it.
  //
  // deliberately a *separate* flag from `isEntranceLeading`, not a second
  // reader of it: that one exists for the scrim, and stays `true` until the
  // spring genuinely settles (`~1.5×` its nominal duration —
  // `@/core/motion/tokens`'s own doc comment on `motionSpringConfig`) — the
  // gap this whole change exists to stop the haptic from waiting out. Tying
  // the haptic's own gate to `isEntranceLeading` instead would have moved
  // when the scrim hands off to `translateY`'s own position earlier too, a
  // change to behaviour this revision does not touch.
  //
  // seeded `false`, unlike `translateY`/`isEntranceLeading`/
  // `isPanelRendering` above: nothing reads this before the visibility
  // effect below has had a chance to run even once, including for a sheet
  // mounted already `visible={true}` — that case still goes through the
  // same "fresh entrance" branch the effect's own `wasVisible.current`
  // comparison already sends every first-time-visible sheet through, so
  // there is no first-frame reading of this value the way `translateY`'s
  // own doc comment worries about for the backdrop's style.
  const isEntranceInFlight = useSharedValue(false);

  // `BottomSheetBody`'s own live scroll offset (`useAnimatedScrollHandler`,
  // written on the UI thread) — read directly by `contentPan`'s own
  // worklets below, never through `runOnJS`. Seeded `0`, the same
  // scroll-top position a freshly-mounted `Animated.ScrollView` starts at,
  // so `contentPan`'s own gate reads as scrolled-to-top until a real scroll
  // event writes to this. handed to `BottomSheetBody` through
  // `BottomSheetSlotContext` below, the same channel `nativeGesture` and
  // `contentPan` travel through.
  const scrollOffset = useSharedValue(0);

  const wasVisible = useRef(false);

  // whether this component is currently rendering its own portalled
  // output — deliberately independent of the `visible` prop; see this
  // component's own doc comment for why. initialised from `visible` so a
  // caller that mounts this component already `visible={true}` renders
  // immediately.
  const [isRendering, setIsRendering] = useState(visible);

  // whether the panel — the handle and `children`'s two compound-child
  // slots, everything but the backdrop — is currently mounted. **always
  // starts `false`,
  // regardless of `visible`**, unlike `isRendering` above: this is what
  // makes entrance option B's ordering hold even for a sheet mounted
  // already `visible={true}` (item 3 of the decision record) — the panel's
  // own first paint is deferred by one commit from the backdrop's, so the
  // backdrop reaches the screen first every time, not only on a later
  // open. deferring the *panel* alone doesn't make that first backdrop
  // frame correct by itself, though — see `translateY`'s and
  // `isEntranceLeading`'s own doc comments for the other half this needs.
  // the "mount the panel" effect below is what flips this back to `true`
  // one commit after `isRendering` does — **for a non-reduced-motion
  // entrance only.** reduce motion sets it `true` synchronously, in the
  // very same effect invocation that sets `isRendering` `true` (the
  // visibility effect's own `reduceMotion` branch below), so both land in
  // the *same* commit rather than the deferred one this effect otherwise
  // produces: there is no travel for reduce motion to lead ahead of, so
  // deferring the panel by a whole extra commit would only leave a
  // fully-opaque scrim on screen with nothing behind it while the panel's
  // contents still build — a staged reveal reduce motion never had before
  // entrance option B and must not gain now. `handleExitSettled` and the
  // visibility effect's own "hidden by another route" branch both reset
  // this to `false` again on the way out, so the *next* open goes through
  // the same reveal — deferred or synchronous, matching that open's own
  // `reduceMotion` — rather than finding the panel already built and
  // skipping it.
  //
  // unlike `translateY` and `isEntranceLeading` a few lines up, this seed is
  // deliberately plain `false` rather than also reading `reduceMotion`:
  // doing so would have nothing to correct today. `usePrefersReducedMotion`'s
  // own doc comment says a first render always reports `reduceMotion` as
  // `false` until its async read settles, so a sheet mounted already
  // `visible={true}` with the OS setting truly on cannot exist on this very
  // first frame — the real value only lands through the visibility effect's
  // own `reduceMotion` branch below, which is exactly what already sets this
  // `true` synchronously once it does. `translateY`, `isEntranceLeading`, and
  // this state are one interlocking seed for that reason: if
  // `usePrefersReducedMotion` ever gains a synchronous first read, all three
  // would need seeding together for a reduce-motion mount-already-visible
  // sheet to be correct on its first frame — seeding this one alone, or
  // either of the other two alone, would not be enough.
  const [isPanelRendering, setIsPanelRendering] = useState(false);

  // `true` from the moment `commitClose` below starts a dismissal this
  // component itself owns, until that dismissal's own animation settles
  // (or immediately, under reduce motion) — set synchronously, before
  // `onRequestClose` is even called, so the visibility effect below can
  // tell "the caller's `visible` prop just went false because *this*
  // dismissal reached them" apart from "`visible` went false through some
  // other route entirely," which still hides immediately (see that
  // effect's own `else if` branch). a plain `useRef`, not a Reanimated
  // shared value: a shared value would sidestep the `react-hooks/refs`
  // lint noted below, but this project's own `react-native-reanimated/mock`
  // (`useSharedValue`'s own source,
  // `node_modules/react-native-reanimated/src/mock.ts`) constructs a fresh,
  // unmemoized value object on every call, unlike real Reanimated's
  // `useRef`-backed one; a value this needs to survive from one render's
  // `commitClose` into a *later* render's effect read (exactly this flag's
  // own job) would silently reset to its initial value every render under
  // that mock — a gap a real device would never exhibit but this project's
  // own test suite would then be powerless to catch regressing. `useRef`
  // has no such gap — plain React, not reanimated-mocked — at the cost of
  // the
  // `react-hooks/refs` false positive suppressed at each of its three call
  // sites below (`buildDragPan`'s two calls and `tap`'s own `.onEnd`): none
  // of those closures actually *run* during render — `Gesture.Pan()`/
  // `Gesture.Tap()`'s own `.onEnd(callback)` registers `callback` for a
  // real gesture to invoke later, the same "event handler" context the
  // rule's own message names as safe — the rule just doesn't recognize this
  // library's own gesture-registration API as one.
  const isClosingRef = useRef(false);

  // `true` from the moment a *fresh* entrance (the panel not already
  // mounted — see `isPanelRendering` above) is requested until
  // `handlePanelLayout` below consumes it, once the panel's own first
  // layout reports it is genuinely on screen. a plain `useRef`, for the
  // same reason `isClosingRef` above is one: this needs to survive from
  // the visibility effect's own run into a *later* `onLayout` call, which
  // this project's reanimated mock cannot be relied on to reproduce
  // faithfully for a `useSharedValue`. cleared defensively wherever a
  // dismissal commits or the sheet is hidden by another route (`commitClose`
  // below, and the visibility effect's own "hidden by another route"
  // branch), so a first layout that lands *after* the sheet already
  // started closing — genuinely possible, since the panel's gestures are
  // live before its own layout necessarily settles — can never retroactively
  // start an entrance spring on a sheet that is no longer opening.
  const pendingEntranceLayoutRef = useRef(false);

  // guards a second, competing entrance spring from starting after the
  // sheet is hidden by any route other than this component's own three
  // dismissal paths, none of which touch `translateY` — an in-flight
  // spring would otherwise still be free to start (and, since
  // `isEntranceInFlight` would still read `true`, still fire `sheetOpen`
  // once it crosses the open position). clears a still-pending fresh
  // entrance the moment a drag starts — see
  // `pendingEntranceLayoutRef`'s own doc comment for the other three sites
  // that already clear it, and `buildDragPan`'s own `onStart` below for why
  // a drag needs a fourth: a first layout that lands once the panel is
  // freshly mounted can arrive at any point relative to a touch that starts
  // dragging the handle before that layout ever fires — mid-drag, or after
  // a release that snapped the sheet back open without ever reaching the
  // dismiss threshold — and either way must not retroactively start a
  // second, competing entrance spring on top of whatever the drag itself is
  // already doing to `translateY`. plain JS, called via `runOnJS` from that
  // worklet, since a worklet cannot read or write a plain ref directly.
  const clearPendingEntranceLayout = useCallback(() => {
    pendingEntranceLayoutRef.current = false;
  }, []);

  // fires once the entrance spring first arrives at the open position —
  // `useAnimatedReaction` below, via `runOnJS` — never once it finishes
  // settling: `motionSpringConfig`'s own doc comment
  // (`@/core/motion/tokens`) records that a spring's real settle time runs
  // roughly 1.5× its nominal duration, so firing on settle instead would
  // trail the sheet's own visual landing by a noticeable margin.
  const handleEntranceArrived = useCallback(() => {
    // `wasVisible.current`, not a closured `visible`: the closure would
    // report this render's value, not whatever is current once the
    // reaction actually fires. mirrors the same guard the old
    // settle-based callback carried, for the same reason: a stale call
    // that reaches the JS thread after the sheet was already hidden by
    // some other route (the visibility effect's own "hidden by another
    // route" branch already clears `isEntranceInFlight` on the UI thread
    // for that case, which should already keep the reaction from ever
    // scheduling this call at all) finds this ref already `false`, a
    // second, JS-thread-side backstop against whatever ordering race
    // could otherwise let a stale call slip through.
    if (wasVisible.current) {
      triggerHaptic(HapticEvent.SheetOpen);
      // the caller's own "finished opening" signal (`onOpened`'s own doc
      // comment) — fired from this exact same guarded call, never a
      // separate site of its own, so the two can never disagree about
      // which arrival they're reporting.
      onOpened?.();
    }
  }, [onOpened]);

  // the entrance's own arrival signal — `translateY`'s first crossing of
  // the open position while an entrance is in flight (`isEntranceArrival`,
  // `./entrance-arrival.ts`; that module's own doc comment covers why the
  // crossing itself, not a threshold or a delay, is what "arrived" means
  // here). runs on every frame `translateY` changes, whichever animation
  // or gesture is currently driving it — a drag-release snap-back and the
  // exit both carry `translateY` back through the open position too, and
  // `isEntranceInFlight` (`isEntranceArrival`'s own `isInFlight` gate) is
  // what keeps either from reading as a second arrival: it is `true` only
  // between a fresh entrance starting and whichever comes first — its own
  // arrival, a drag interrupting it, a dismissal committing, or the sheet
  // being hidden by another route — never for either of those two other
  // movements, which never set it `true` at all.
  //
  // **not observable through this project's own reanimated mock.**
  // `node_modules/react-native-reanimated/src/mock.ts` defines
  // `useAnimatedReaction` as a no-op (`hook.useAnimatedReaction: NOOP`) —
  // confirmed by reading that file, not assumed — so this reaction's own
  // body never runs under this suite, whatever `translateY` does. `./
  // entrance-arrival.test.ts` is what actually pins `isEntranceArrival`
  // against a regression; a render-only test of this component cannot.
  useAnimatedReaction(
    () => translateY.value,
    (current, previous) => {
      'worklet';
      if (isEntranceArrival(previous, current, isEntranceInFlight.value)) {
        isEntranceInFlight.value = false;
        runOnJS(handleEntranceArrived)();
      }
    },
  );

  useEffect(() => {
    // `wasVisible.current` updates before scheduling the entrance, not
    // after: a completion callback can fire synchronously (this
    // project's reanimated mock always does), and reading the ref only
    // afterward would see it stale, not yet reflecting this render's
    // `visible`.
    const wasVisibleBefore = wasVisible.current;
    wasVisible.current = visible;

    if (visible && !wasVisibleBefore) {
      // a re-open — including one that arrives while `isClosingRef` is
      // still `true`, from a dismissal whose own exit hadn't finished
      // playing yet — always wins: reset both, and render again
      // immediately even if the previous exit's own completion callback
      // is still pending. clearing `isClosingRef` here is what makes that
      // pending callback safe: `handleExitSettled` below returns early
      // unless the flag is still set, so a stale exit completion arriving
      // *after* this branch cannot pull `isRendering` back to `false` and
      // tear down the sheet this re-open just put back on screen.
      // `cancelAnimation` below should already stop that callback from
      // ever reporting `finished` in the first place — but that is real
      // Reanimated's behaviour, and this project's own reanimated mock
      // makes `cancelAnimation` a no-op, so relying on it alone would put
      // this branch's safety somewhere the test suite is structurally
      // unable to observe a regression in.
      isClosingRef.current = false;
      setIsRendering(true);

      // defensively `false` before either branch below runs — see
      // `isEntranceLeading`'s own doc comment for why a stale `true` could
      // otherwise survive from an interrupted previous entrance.
      isEntranceLeading.value = false;

      // `windowHeight` first either way (still offscreen, in case a
      // previous exit was still in flight, or never reached it at all — a
      // dismiss triggered by something other than this component's own
      // three paths, per this component's own doc comment) — both this
      // write and whichever branch below runs land in the same tick,
      // before any frame paints, so there is no visible flash of the
      // fully-open resting position first. `react-hooks/immutability`
      // flags this particular write (and, further down, `isEntranceInFlight`'s
      // own arm at each of the two branches below) and not most of this
      // same effect's other shared-value writes — a known false positive,
      // the same shape as the one already noted on `handlePanelLayout`'s
      // and `commitClose`'s own writes to `translateY`/`scrimOpacity`; which
      // exact write in a block this size trips the rule has shifted before
      // as this effect grew, so this suppresses only where the linter
      // currently flags it rather than everywhere the shape looks similar.
      cancelAnimation(translateY);
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = windowHeight;

      // shared by both non-reduced-motion branches below — see
      // `scrimOpacity`'s own doc comment for why the reset matters: without
      // it, a second or later open would find `scrimOpacity` already at `1`
      // from the previous entrance's own settled value, and `motionColor`'s
      // `withTiming` would animate from `1` to `1`, no visible fade.
      // `translateY` a few lines up gets the equivalent reset unconditionally,
      // every open; this one only runs for the two branches that actually
      // start a lead, since reduce motion (above) has no lead to reset for.
      const startEntranceScrimLead = () => {
        isEntranceLeading.value = true;
        scrimOpacity.value = 0;
        scrimOpacity.value = motionColor(1, reduceMotion);
      };

      if (reduceMotion) {
        // no animation plays, so "settled" is now — and synchronously so,
        // with no async gap for `visible` to flip false underneath it, so
        // this branch needs no `handleEntranceArrived`-style guard. true
        // regardless of whether the panel is already built: there is
        // nothing to travel either way, so nothing to gain by waiting for
        // a layout event first. `isEntranceLeading` stays `false` — there
        // is no travel for the scrim to lead ahead of, so
        // `animatedBackdropStyle` derives it straight from `translateY`
        // (already `0`, so already full strength) rather than reaching for
        // a colour timeline with nothing left to do.
        translateY.value = 0;
        // the panel mounts in this *same* effect invocation, not the
        // deferred "mount the panel" effect below — see `isPanelRendering`'s
        // own doc comment for why that deferral exists for the animated
        // case, and why reduce motion must not go through it: that effect
        // only runs after this one has already committed, which would
        // leave a fully-opaque scrim on screen for a whole extra commit
        // with no sheet behind it, while the panel's contents (still to
        // build) hold up the second commit — a staged reveal reduce motion
        // must not gain, since there is no travel here for a staged reveal
        // to lead.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPanelRendering(true);
        triggerHaptic(HapticEvent.SheetOpen);
        // no spring to await here — see `onOpened`'s own doc comment: this
        // branch's "settled" is synchronous and immediate, the same
        // reasoning that already applies to the haptic a line up.
        onOpened?.();
      } else if (isPanelRendering) {
        // entrance option B: the scrim leads regardless of whether the
        // sheet's own contents are ready — see this component's own doc
        // comment and `isEntranceLeading`'s own. started here, at the
        // request itself, not deferred to whichever of this branch or the
        // one below actually runs.
        startEntranceScrimLead();
        // arms the arrival reaction — see `isEntranceInFlight`'s own doc
        // comment. `translateY` is still at `windowHeight` here (set a few
        // lines above), so there is nothing for the reaction to observe
        // crossing yet — the spring that will actually move it starts two
        // lines down, in the same tick.
        // eslint-disable-next-line react-hooks/immutability
        isEntranceInFlight.value = true;

        // the panel is already mounted and has already had its own first
        // paint — a re-open that arrived while a previous exit's own
        // spring hadn't finished playing yet (the case this branch's own
        // comment above already covers). there is nothing left to build,
        // so the travel starts right here — `handlePanelLayout` below has
        // nothing to wait for, since this frame is not the panel's first.
        translateY.value = withSpring(0, motionSpringConfig, (finished) => {
          // the open haptic does not wait for this — `useAnimatedReaction`
          // below fires it well before the spring settles (see
          // `handleEntranceArrived`'s own doc comment for how much earlier,
          // and why). this write only settles the scrim's own lead, per
          // `isEntranceLeading`'s own doc comment. `finished === false`
          // means a drag interrupted the entrance (`buildDragPan`'s
          // `onStart` cancels this animation) — that same `onStart` already
          // cleared `isEntranceInFlight` too, so this write is the only one
          // this branch still owns in that case.
          if (finished) {
            isEntranceLeading.value = false;
          }
        });
      } else {
        // same lead as the branch above, for the case that still has to
        // wait on `handlePanelLayout` below — including arming the arrival
        // reaction, since the spring that will eventually cross the open
        // position hasn't started yet either.
        startEntranceScrimLead();
        isEntranceInFlight.value = true;

        // the panel doesn't exist yet — the "mount the panel" effect
        // below builds it one commit from now (see `isPanelRendering`'s
        // own doc comment for why that gap exists at all). mark the
        // travel pending instead of starting it: `handlePanelLayout` below
        // starts the spring once the panel's own first layout reports the
        // sheet is genuinely on screen.
        pendingEntranceLayoutRef.current = true;
      }
    } else if (!visible && wasVisibleBefore && !isClosingRef.current) {
      // `visible` went false through some route other than this
      // component's own `commitClose` — which, had it been the cause,
      // would already have set `isClosingRef.current = true`
      // *synchronously*, before ever calling `onRequestClose`, so this
      // branch could not observe it as `false`. this primitive
      // choreographs only its own three dismissal paths; anything else
      // hides immediately, skipping the exit animation entirely, matching
      // this component's previous, `visible`-gated behaviour for exactly
      // this case.
      cancelAnimation(translateY);
      pendingEntranceLayoutRef.current = false;
      // a lead this route's own hide just ended, if one was running — see
      // `isEntranceLeading`'s own doc comment.
      isEntranceLeading.value = false;
      // disarms the arrival reaction for the same reason — see
      // `isEntranceInFlight`'s own doc comment: without this, an entrance
      // spring still resolving in the background (`cancelAnimation` above
      // is best-effort — see this component's own doc comment on why this
      // branch cannot rely on it alone) could still cross the open position
      // and fire `sheetOpen` for a sheet this route has already hidden.
      isEntranceInFlight.value = false;
      setIsRendering(false);
      // forces the *next* open through the full one-commit-later reveal
      // again, rather than finding a panel this route just hid still
      // marked as built — see `isPanelRendering`'s own doc comment.
      setIsPanelRendering(false);
    }
    // `translateY`, `scrimOpacity`, `isEntranceLeading`, and
    // `isEntranceInFlight` are all stable shared-value refs across this
    // component's lifetime, not values that change render to render —
    // including them here would only fire this effect on every value any
    // one of them takes on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight, reduceMotion, isPanelRendering, onOpened]);

  // mounts the panel — the handle and `children`'s two compound-child
  // slots, everything `isPanelRendering`'s own doc comment says it gates —
  // one commit later
  // than the backdrop the effect above already made visible, for a
  // non-reduced-motion entrance. entrance option B needs that gap: the
  // scrim's own fade has to be able to reach the screen before the sheet's
  // contents even start building, and a single commit that mounted both
  // would build those contents (the fifty-two card faces, the 169-cell
  // grid) in the same synchronous pass whose paint the scrim is still
  // waiting to be flushed to the native side. Runs whenever `isRendering`
  // is true but the panel isn't yet — the state the branch above leaves
  // behind for a fresh, non-reduced-motion entrance — and does nothing
  // once the panel has caught up, which is already true by the time this
  // runs for a *reduce-motion* entrance: that branch sets
  // `isPanelRendering` itself, synchronously, so this effect's own
  // condition is already false and this is a no-op — see
  // `isPanelRendering`'s own doc comment for why reduce motion cannot go
  // through this deferral at all.
  //
  // `react-hooks/set-state-in-effect` reads this as a value React could
  // have derived during render instead — its usual case, and its usual
  // fix, since a `setState` an effect only turns around and calls straight
  // back invites a render this component didn't need. This one's
  // deliberately not that: the whole reason this effect exists, instead of
  // computing `isPanelRendering` inline, is to force the *extra*
  // render + commit the rule is warning about — that is the one-commit
  // gap entrance option B needs (this component's own doc comment), not
  // an accident to fix away.
  useEffect(() => {
    if (isRendering && !isPanelRendering) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPanelRendering(true);
    }
  }, [isRendering, isPanelRendering]);

  // the panel's own `onLayout` — the earliest moment this component can
  // know its surface, with its contents present, is genuinely on screen.
  // starts the entrance spring exactly once per fresh entrance, consuming
  // `pendingEntranceLayoutRef` so a *later* layout (a header changing the
  // panel's own height, say) never restarts it. does nothing at all unless
  // that flag is set — reduce motion never sets it (the visibility effect
  // above jumps straight to open instead), and neither does a re-open that
  // found the panel already mounted, so this only ever fires the spring
  // for the case this whole change exists to fix.
  const handlePanelLayout = useCallback(() => {
    if (!pendingEntranceLayoutRef.current) {
      return;
    }
    pendingEntranceLayoutRef.current = false;
    // `react-hooks/immutability` flags this the same way it flags
    // `commitClose`'s own write below — a false positive for the same
    // reason that comment gives: `translateY` is also read inside the
    // visibility effect above, and a shared value's `.value` is meant to
    // be mutated exactly like this from wherever the animation it drives
    // actually needs to start.
    // eslint-disable-next-line react-hooks/immutability
    translateY.value = withSpring(0, motionSpringConfig, (finished) => {
      // mirrors the "already mounted" branch's own completion above — the
      // open haptic does not wait for this; see `handleEntranceArrived`'s
      // own doc comment. `finished === false` here still means a drag
      // interrupted the entrance, but that drag's own `onStart` already
      // cleared `isEntranceInFlight`, so this write only settles the
      // scrim's own lead.
      if (finished) {
        isEntranceLeading.value = false;
      }
    });
  }, [translateY, isEntranceLeading]);

  // the exit's own completion — mirrors `handleEntranceArrived` above, but
  // for `sheetClose`: this is deliberately the *only* place that haptic
  // fires now, since `commitClose` below moves `onRequestClose` itself to
  // fire immediately, well before this runs. still gated on the exit
  // spring's own `finished` callback, unlike the open haptic now — a
  // `sheetClose` that fired the instant the exit started, rather than once
  // it actually finishes, would read as premature; see this component's
  // own doc comment. also what actually stops this component from
  // rendering (`setIsRendering(false)`) and clears `isClosingRef`, once
  // the exit has genuinely finished playing.
  //
  // guarded on `isClosingRef` for the same reason `handleEntranceArrived`
  // above is guarded on `wasVisible`: a completion callback is not proof
  // that the thing it was completing is still the thing that matters. the
  // reset effect above clears this flag the moment a re-open arrives, so
  // an exit completion that lands after that re-open — a stale callback
  // for an animation whose outcome nobody is waiting on any more — must
  // not fire `sheetClose` for a sheet that is opening, nor pull
  // `isRendering` back to `false` and tear down what the re-open just put
  // on screen.
  const handleExitSettled = useCallback(() => {
    if (!isClosingRef.current) {
      return;
    }
    triggerHaptic(HapticEvent.SheetClose);
    setIsRendering(false);
    // forces the *next* open through the full one-commit-later reveal
    // again — see `isPanelRendering`'s own doc comment.
    setIsPanelRendering(false);
    isClosingRef.current = false;
  }, []);

  // shared between the backdrop's plain JS `onPress` and the pan gesture's
  // UI-thread `onEnd` (via `runOnJS`, since only JS-thread code may call a
  // JS function — which also means this function itself always runs back
  // on the JS thread, `runOnJS`'s whole purpose, whichever caller reached
  // it). calls `onRequestClose` immediately — see this component's own
  // doc comment and `onRequestClose`'s own prop comment for why — then
  // animates the sheet fully offscreen; `handleExitSettled` above, not
  // this function, is what fires `sheetClose` and stops this component
  // from rendering, once that animation actually finishes. retimed to
  // this project's one motion character (`@/core/motion/tokens`'s
  // `motionSpringConfig`) so open and close are symmetrical.
  const commitClose = useCallback(() => {
    // a second dismissal trigger (another handle tap, drag past the
    // threshold, or backdrop tap) landing while this same dismissal is
    // already committing — its exit animation still playing — must have no
    // further effect: `isClosingRef` already marks exactly that window (see
    // its own doc comment), so this returns before resolving the sheet's
    // held input a second time or invoking `onRequestClose` again.
    if (isClosingRef.current) {
      return;
    }
    // set *before* `onRequestClose` runs, synchronously — this is what
    // lets the visibility effect above tell this dismissal's own
    // `visible={false}` apart from one arriving through any other route
    // (see that effect's own comment).
    isClosingRef.current = true;
    // a first layout that lands after this point (the panel's gestures are
    // live before its own layout necessarily settles, so this is genuinely
    // reachable) must not retroactively start an entrance spring on a
    // sheet that is now closing — see `pendingEntranceLayoutRef`'s own doc
    // comment.
    pendingEntranceLayoutRef.current = false;
    // a lead this dismissal just cut short, if one was running — a
    // backdrop tap can commit a dismissal with no preceding drag (`onStart`
    // above is what clears this for the drag paths), so this needs its own
    // defensive reset too. see `isEntranceLeading`'s own doc comment: once
    // `false`, `animatedBackdropStyle` below derives the scrim straight
    // from `translateY` for the whole exit, exactly as it did before
    // entrance option B existed — that spring is what actually animates it
    // now, not a colour timeline of its own.
    // eslint-disable-next-line react-hooks/immutability
    isEntranceLeading.value = false;
    // disarms the arrival reaction for the same reason — see
    // `isEntranceInFlight`'s own doc comment: a backdrop or handle tap can
    // commit a dismissal mid-entrance, before the spring above ever
    // finishes replacing it with the exit spring below, and this write is
    // what keeps that in-flight entrance from still firing `sheetOpen` for
    // a sheet that is now closing.
    // eslint-disable-next-line react-hooks/immutability
    isEntranceInFlight.value = false;
    onRequestClose();
    // `react-hooks/immutability` flags a shared value's `.value` like a
    // plain ref's `.current` once that value is also read inside a
    // `useEffect` (the reset effect above) — a known false positive: a
    // shared value is meant to be mutated exactly like this, and that
    // mutation is what Reanimated propagates to the UI thread. no
    // alternative keeps the drag on the UI thread, which this component's
    // doc comment already commits to.
    if (reduceMotion) {
      // `motionSpring`/`motionColor` themselves already collapse to an
      // immediate jump when `reduceMotion` is true — but that leaves no
      // animation to call `handleExitSettled` from `onComplete`, so this
      // branch reaches for `handleExitSettled` itself instead of either
      // wrapper. no `scrimOpacity` write is needed here: `translateY`
      // is already at `windowHeight`, and `isEntranceLeading` is already
      // `false`, so `animatedBackdropStyle` below already reads the scrim
      // as fully transparent from `translateY`'s own position alone.
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = windowHeight;
      // deferred one microtask rather than called inline: `handleExitSettled`
      // is what clears `isClosingRef` (see its own doc comment), and the
      // non-reduced-motion path below only ever reaches it from
      // `withSpring`'s own `onComplete`, itself always at least one turn
      // away from this synchronous call stack. calling it inline here would
      // set `isClosingRef.current` true and immediately clear it back to
      // `false` before this function even returns — reopening the exact
      // re-entrancy window the guard above exists to close, for a second
      // dismissal trigger that fires synchronously right after the first
      // (see `<BottomSheet /> dismissal re-entrancy`'s reduce-motion test).
      // `queueMicrotask` keeps the eventual clear on the same turn as
      // everything else microtask-scheduled here (Promise/`await`-based,
      // same as the rest of this codebase) rather than reaching for a timer;
      // it still resolves well within any single `await` a caller or test
      // performs afterwards, so a single ordinary dismissal is unaffected.
      queueMicrotask(handleExitSettled);
      return;
    }
    // the scrim keeps deriving straight from `translateY` through this
    // spring too — see `isEntranceLeading`'s own doc comment and this
    // component's own doc comment (only the entrance ever gets a timeline
    // of its own). no separate `scrimOpacity` write: `animatedBackdropStyle`
    // below recomputes it from `translateY`'s position on every frame this
    // spring updates, the same as it does for a drag's own release.
    translateY.value = withSpring(windowHeight, motionSpringConfig, (finished) => {
      if (finished) {
        runOnJS(handleExitSettled)();
      }
    });
  }, [
    translateY,
    windowHeight,
    handleExitSettled,
    reduceMotion,
    onRequestClose,
    isEntranceLeading,
    isEntranceInFlight,
  ]);

  // shared by `pan` (the handle's), `headerPan` (the header's), and
  // `contentPan` (the content area's) below — all three drag the identical
  // `translateY`/`dragStartTranslateY`/`dragGateWasOpen`/
  // `dragTranslationYOffset` shared values through the identical threshold
  // rule. built fresh every
  // render, unlike `../selection-grid/selection-grid.tsx`'s memoized
  // `Gesture.Pan()` (documented on its own build site): nothing here
  // calls `setState` or a prop callback mid-drag — the drag lives
  // entirely in `translateY`, a UI-thread shared value — so there's no
  // render to interrupt itself with. a caller flipping `visible` mid-drag
  // could still rebuild these gestures underneath an active touch; that
  // residual risk is accepted rather than adding `selection-grid.tsx`'s
  // ref-context machinery for it.
  //
  // `scrollOffset`, passed only for `contentPan` below, gates every one of
  // this pan's three callbacks: each reads `scrollOffset.value` directly,
  // on the UI thread, and no-ops once it reads above `0` — a live check
  // repeated on every call, not a value captured once at `onStart` — so
  // `BottomSheetBody`'s own `Animated.ScrollView` stays free to handle the
  // touch instead (see `BottomSheet`'s own doc comment). `onEnd` needs the
  // same gate as `onStart`/`onUpdate`: without it, a pan that never moved
  // `translateY` at all (every `onStart`/`onUpdate` call gated out because
  // the content stayed scrolled away from the top for the whole gesture)
  // would still reach `onEnd`'s own threshold check against whatever stale
  // `event.translationY`/`velocityY` the raw touch produced, and could
  // commit a dismissal the sheet never visually moved toward. `pan` and
  // `headerPan` below pass no `scrollOffset` at all, so this check never
  // triggers for either — both stay unconditional, and `dragGateWasOpen`
  // reads `true` on every call either one ever makes (see its own doc
  // comment), so neither ever takes `onUpdate`'s mid-gesture re-baseline
  // branch below either. `onUpdate`'s own re-baseline branch is what makes
  // the live, per-frame check genuinely live rather than only checked once:
  // see `dragGateWasOpen`'s and `dragTranslationYOffset`'s own doc comments,
  // and docs/decisions/2026-09-05-gate-bottom-sheet-content-drag-on-scroll-
  // position.md, for the mid-gesture transition this exists to carry
  // smoothly instead of as a jump.
  function buildDragPan(scrollOffset?: SharedValue<number>) {
    return Gesture.Pan()
      .onStart((event) => {
        const gateOpen = scrollOffset === undefined || scrollOffset.value <= 0;
        // rewritten unconditionally, before the gate-closed branch below
        // can return — see `dragGateWasOpen`'s own doc comment for why
        // every fresh gesture needs this write regardless of which way the
        // gate reads, and why nothing that runs after this gesture ends
        // needs to reset it back.
        dragGateWasOpen.value = gateOpen;
        if (!gateOpen) {
          return;
        }
        // `event.translationY` is `0` here for an ordinary `onStart` — a
        // gesture's own cumulative displacement always starts at `0` — so
        // this agrees with the pre-fix behaviour exactly (an implicit `0`
        // offset) for the gate-already-open case this project's tests
        // already cover; it exists at all only so `onUpdate` below has a
        // single formula that also covers the mid-gesture transition case.
        dragTranslationYOffset.value = event.translationY;
        cancelAnimation(translateY);
        dragStartTranslateY.value = translateY.value;
        // a drag starting hands the scrim's own control over to
        // `translateY`'s position for the rest of this gesture — see
        // `isEntranceLeading`'s own doc comment. ends any entrance lead
        // still running (the entrance's own `withSpring`/`withTiming`
        // calls keep resolving in the background; they simply stop being
        // read once this flips) and clears a still-pending fresh entrance
        // — see `clearPendingEntranceLayout`'s own doc comment for why a
        // drag needs that too, not only `onEnd` below.
        isEntranceLeading.value = false;
        // disarms the arrival reaction — see `isEntranceInFlight`'s own doc
        // comment. this is the one write that gate exists for: a drag can
        // interrupt an entrance at any point along its travel, including
        // after `translateY` has already crossed the open position on its
        // way to overshooting past it, and a release from here can snap the
        // sheet straight back down through that same position (`onEnd`
        // below, `motionSpring(0, reduceMotion)`) — a movement this must
        // not read as a second arrival. clearing the flag here, before
        // either the crossing or the snap-back's own reverse crossing can
        // reach the reaction, is what keeps both cases silent regardless of
        // where in its travel the entrance gets interrupted.
        isEntranceInFlight.value = false;
        runOnJS(clearPendingEntranceLayout)();
      })
      .onUpdate((event) => {
        const gateOpen = scrollOffset === undefined || scrollOffset.value <= 0;
        if (!gateOpen) {
          dragGateWasOpen.value = false;
          return;
        }
        if (!dragGateWasOpen.value) {
          // the gate just opened mid-gesture — `onStart` above never ran
          // its own gate-open branch for this gesture, so this frame does
          // the same capture `onStart` would have, exactly where the
          // transition actually happens rather than where the touch
          // happened to begin. `event.translationY` is the touch's own
          // cumulative displacement since it began, not since this frame,
          // so re-basing both `dragStartTranslateY` and
          // `dragTranslationYOffset` here is what keeps the very next line
          // from computing against the touch's earlier, gated-out
          // displacement — the jump this whole branch exists to prevent.
          // deliberately narrower than `onStart`'s own gate-open branch:
          // this re-bases the drag math only, not `isEntranceLeading`/
          // `isEntranceInFlight`/`pendingEntranceLayoutRef` — a content-area
          // drag beginning scrolled away from the top while a fresh
          // entrance is still in flight is a narrower edge case those three
          // exist for, outside what this fix addresses.
          cancelAnimation(translateY);
          dragStartTranslateY.value = translateY.value;
          dragTranslationYOffset.value = event.translationY;
          dragGateWasOpen.value = true;
        }
        // never past the open position — no upward rubber-band, since
        // there's nothing above "open" to reveal. no
        // `react-hooks/immutability` suppression needed here, unlike
        // `commitClose`'s write above: that false positive is specific to
        // a shared value also read inside a top-level `useEffect`; nested
        // inside this factory function, the rule doesn't flag it.
        translateY.value = Math.max(
          0,
          dragStartTranslateY.value + (event.translationY - dragTranslationYOffset.value),
        );
        // no separate scrim write here: `isEntranceLeading` is already
        // `false` (`onStart` above), so `animatedBackdropStyle` below
        // already derives the scrim straight from `translateY` on every
        // frame, computed once at the one place that reads it rather than
        // duplicated here too.
      })
      .onEnd((event) => {
        // this gesture is ending either way — reset the transition-
        // tracking state before the gate check below can return early, so
        // a `false`/non-zero value left over from this gesture can never
        // read as stale state for the next one. defensive, not
        // load-bearing: `onStart` above already (re)writes both
        // unconditionally at the start of every gesture, before either is
        // ever read again.
        dragGateWasOpen.value = true;
        dragTranslationYOffset.value = 0;

        if (scrollOffset !== undefined && scrollOffset.value > 0) {
          return;
        }
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
          // the scrim keeps deriving straight from `translateY` through
          // this spring too, exactly as it did through the drag itself —
          // `isEntranceLeading` stays `false` (`onStart` above already set
          // it), so this release never reaches for a timeline of its own.
          translateY.value = motionSpring(0, reduceMotion);
        }
      });
  }

  // `react-hooks/refs` flags this call: `buildDragPan`'s own `.onEnd`
  // closure calls `commitClose`, which reads/writes `isClosingRef.current`
  // — but that closure only *runs* once a real gesture actually ends, the
  // same "event handler" context the rule's own message names as safe (see
  // `isClosingRef`'s own doc comment); the rule just doesn't recognize
  // `Gesture.Pan()`'s own `.onEnd(callback)` as one.
  // eslint-disable-next-line react-hooks/refs
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
  // explicitly. built unconditionally, whether or not the caller actually
  // renders a `<BottomSheetHeader>` — a `Gesture.Pan()` nothing ever wraps
  // in a `GestureDetector` costs nothing to construct, and this component
  // has no way to know ahead of `children` rendering whether one exists
  // without the `React.Children` inspection its own compound-child contract
  // avoids.
  // eslint-disable-next-line react-hooks/refs -- see `pan`'s own comment above
  const headerPan = buildDragPan();

  // wraps `BottomSheetBody`'s own `Animated.ScrollView` (`Gesture.Native()`)
  // and the content area's own gated drag (`contentPan` below) — see
  // `BottomSheet`'s own doc comment and `buildDragPan`'s own `scrollOffset`
  // parameter above for why `.simultaneousWithExternalGesture` plus a live
  // scroll-position check, not a fixed win/lose relation, is what lets both
  // coexist.
  const nativeGesture = Gesture.Native();
  // eslint-disable-next-line react-hooks/refs -- see `pan`'s own comment above
  const contentPan = buildDragPan(scrollOffset).simultaneousWithExternalGesture(nativeGesture);

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
    // eslint-disable-next-line react-hooks/refs -- see `pan`'s own comment above
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
    headerPan.withTestId('header-drag');
    contentPan.withTestId('content-drag');
  }

  // a tap and a drag both start the same way — a finger touching the
  // handle — so `Race` lets a short, still touch resolve as the tap while
  // a touch that moves resolves as the drag, without the two gestures
  // fighting over it.
  const handleGesture = Gesture.Race(tap, pan);

  // handed to `BottomSheetHeader`/`BottomSheetBody` through
  // `BottomSheetSlotContext` — see that type's own doc comment for what
  // each field is for. a fresh object every render, same as `headerPan`/
  // `contentPan`/`nativeGesture` themselves, which are already rebuilt
  // fresh every render (`buildDragPan`'s own doc comment) — memoising this
  // wrapper would buy nothing since its own contents already change every
  // render regardless.
  const slotContextValue: BottomSheetSlotContextValue = {
    headerPan,
    contentPan,
    nativeGesture,
    scrollOffset,
  };

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // picks between the scrim's two sources every frame, on the UI thread —
  // see `isEntranceLeading`'s own doc comment for exactly when each
  // applies. `scrimOpacity.value` while an entrance is leading (the
  // colour/opacity character, decoupled from where the sheet actually is);
  // straight off `translateY`'s own position everywhere else — a drag, a
  // drag's own release, and the exit.
  const animatedBackdropStyle = useAnimatedStyle(() => {
    if (isEntranceLeading.value) {
      return { opacity: scrimOpacity.value };
    }
    return {
      opacity: windowHeight > 0 ? 1 - Math.min(1, Math.max(0, translateY.value / windowHeight)) : 1,
    };
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
  // there. `null` while `!isRendering` is `usePortal`'s own "renders
  // nothing" case — gated on this component's own internal `isRendering`
  // state, not directly on the caller's `visible` prop, so a committed
  // exit keeps rendering (and animating) even after `visible` has already
  // gone false; see this component's own doc comment. the panel nested
  // inside is gated a second, independent time, on `isPanelRendering` —
  // entrance option B's own one-commit-later reveal (see that state's own
  // doc comment): the backdrop above it renders on this same `isRendering`
  // pass, so it can reach the screen a commit before the panel — and
  // everything the panel holds — even exists.
  usePortal(
    isRendering ? (
      // `style` merged last, after this component's `styles.root`, so a
      // caller extending it doesn't wipe the full-bleed positioning every
      // child is anchored against; every other rest prop is spread after
      // `testID` so a caller can still override an explicit default, same
      // ordering `SegmentedTabs` uses.
      <View style={[styles.root, style]} testID={testID} {...props}>
        {
          // sits behind `AnimatedPressable` below in paint order — an
          // earlier sibling, so the flat scrim colour and its tap handling
          // are unaffected — and shares that same `animatedBackdropStyle`
          // object rather than a second `useAnimatedStyle` call, so both
          // layers fade in perfect lockstep off one opacity source.
          // `pointerEvents="none"` keeps every touch reaching the
          // `AnimatedPressable` beneath it, the same way `../portal/
          // portal.tsx`'s own portal-entry wrapper stays `box-none` so its
          // own empty area never captures one. `tint`/`intensity` are fixed
          // props (`BACKDROP_BLUR_INTENSITY`'s own comment). Rendered only
          // where `SUPPORTS_BACKDROP_BLUR` is `true` — see that constant's
          // own comment for why `blurMethod` itself can't be trusted to
          // fall back to nothing on its own below Android API 31.
        }
        {SUPPORTS_BACKDROP_BLUR ? (
          <AnimatedBlurView
            style={[styles.backdrop, animatedBackdropStyle]}
            tint="dark"
            intensity={BACKDROP_BLUR_INTENSITY}
            blurMethod="dimezisBlurViewSdk31Plus"
            blurTarget={blurTargetRef}
            pointerEvents="none"
            testID={testID ? 'backdrop-blur' : undefined}
          />
        ) : null}
        <AnimatedPressable
          style={[styles.backdrop, animatedBackdropStyle]}
          onPress={commitClose}
          accessible={false}
          testID={testID ? 'backdrop' : undefined}
        />
        {isPanelRendering ? (
          <Animated.View
            // `maxWidth` merged as a plain object, not a stylesheet key:
            // `styles.panel` already reads `rt` inside `StyleSheet.create`'s
            // own factory, which takes no caller argument to thread this
            // prop's value through — so this is applied here instead,
            // exactly like `animatedSheetStyle` beside it. `undefined` (the
            // default) merges in as `{ maxWidth: undefined }`, a no-op RN
            // style value — see `maxWidth`'s own prop doc comment above for
            // why this exists as a separate prop from `style` at all.
            style={[styles.panel, { maxWidth }, animatedSheetStyle]}
            // the entrance's own first-layout signal — see
            // `handlePanelLayout`'s own doc comment.
            onLayout={handlePanelLayout}
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
            {
              // `children` — `<BottomSheetHeader>` and/or `<BottomSheetBody>`
              // — renders here, as an ordinary React child rather than a
              // value this component inspects: each slot component reads
              // `slotContextValue` above through `BottomSheetSlotContext`
              // and renders its own real output (its own `GestureDetector`
              // and root element) at exactly this position, so `styles.panel`'s
              // own `gap` (below) spaces the handle row against whichever of
              // the two actually renders, the same way it already would for
              // any other flex column of a variable number of children.
            }
            <BottomSheetSlotContext.Provider value={slotContextValue}>
              {children}
            </BottomSheetSlotContext.Provider>
          </Animated.View>
        ) : null}
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

/**
 * `BottomSheet`'s optional top-chrome slot — a tab row, say — rendered
 * directly under the drag handle, outside the scrolling area
 * `BottomSheetBody` owns. Drags along with the handle (`headerPan`, read
 * from `BottomSheetSlotContext`): see `BottomSheet`'s own doc comment for
 * why that drag is unconditional, unlike `BottomSheetBody`'s own.
 *
 * a `GestureDetector`-wrapped component, per
 * docs/conventions/component-contracts.md's rule for one: its props type
 * extends the real element rendered inside the wrapper, the `View` that
 * `children` actually reaches, not `GestureDetector` itself (which renders
 * no native view of its own and accepts no rest props to receive them).
 */
export function BottomSheetHeader({
  children,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & { testID?: string }) {
  const { headerPan } = useBottomSheetSlot('BottomSheetHeader');

  return (
    <GestureDetector gesture={headerPan}>
      <View style={[styles.header, style]} testID={testID} {...props}>
        {children}
      </View>
    </GestureDetector>
  );
}

/**
 * `BottomSheet`'s required scrolling-content slot — every sheet has one,
 * unlike `BottomSheetHeader`. Renders `children` inside an
 * `Animated.ScrollView`, per the two-surface styling pattern
 * (docs/conventions/component-styling.md): `style` sizes the scroll
 * container, `contentContainerStyle` lays out the scrollable content
 * itself — never a `style` repurposed for both.
 *
 * a `GestureDetector`-wrapped component extending the real element the
 * wrapper renders, same as `BottomSheetHeader` above — here, the
 * `Animated.ScrollView` itself, nested one `GestureDetector` deeper than
 * that component's own (`nativeGesture`, wrapping the `Animated.ScrollView`
 * directly, inside `contentPan`'s own `GestureDetector`, wrapping the
 * plain `View` both live in — see `BottomSheet`'s own doc comment for why
 * two separate gestures, not one, cover this one area).
 *
 * `scrollHandler` below writes `event.contentOffset.y` into
 * `scrollOffset` on every scroll frame, entirely on the UI thread — the
 * live position `contentPan`'s own worklets gate on, read from
 * `BottomSheet`'s own render, never through a JS-thread round trip.
 */
export function BottomSheetBody({
  children,
  testID,
  style,
  contentContainerStyle,
  ...props
}: ComponentProps<typeof Animated.ScrollView> & { testID?: string }) {
  const { contentPan, nativeGesture, scrollOffset } = useBottomSheetSlot('BottomSheetBody');

  const scrollHandler = useAnimatedScrollHandler((event) => {
    // `react-hooks/immutability` flags this the same way it flags
    // `BottomSheet`'s own writes to `translateY`/`scrimOpacity` elsewhere in
    // this file — a false positive: `scrollOffset` is a Reanimated shared
    // value, sourced through `useBottomSheetSlot` (a `useContext` wrapper)
    // rather than a local `useSharedValue` call, but mutating its `.value`
    // exactly like this is still how Reanimated propagates a write to the
    // UI thread; the rule does not recognize a shared value handed down
    // through context as one it should exempt.
    // eslint-disable-next-line react-hooks/immutability
    scrollOffset.value = event.contentOffset.y;
  });

  return (
    <GestureDetector gesture={contentPan}>
      {
        // a plain `View`, not `Animated.ScrollView` itself, is what
        // `contentPan`'s own `GestureDetector` wraps: `nativeGesture`'s own
        // `GestureDetector` needs to wrap the scroll view directly (the
        // documented shape for composing `Gesture.Native()` with a real
        // `ScrollView`), so this component nests one `GestureDetector`
        // inside the other rather than asking one to wrap both roles at
        // once. `flexShrink: 1` (`styles.contentContainer` below) is what
        // lets this box — and the `Animated.ScrollView` filling it — shrink
        // within `BottomSheet`'s own `maxHeight`-capped panel instead of
        // forcing the panel taller than its own cap; React Native's default
        // `flexShrink` is `0`, unlike the web's `1`, so this is set
        // explicitly rather than relied on. not confirmed against a real
        // device's own layout — docs/conventions/testing.md's own note that
        // no test in this project can observe real measured geometry.
      }
      <View style={styles.contentContainer}>
        <GestureDetector gesture={nativeGesture}>
          <Animated.ScrollView
            style={[styles.contentScroll, style]}
            contentContainerStyle={contentContainerStyle}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            testID={testID}
            {...props}
          >
            {children}
          </Animated.ScrollView>
        </GestureDetector>
      </View>
    </GestureDetector>
  );
}

// 24 (top corners), 60×7 (handle), 20 (handle's top offset within its
// 27-tall row), 14.5 (side padding), and 40 (gap below the handle row) are
// all the design's own measured values — see docs/conventions/
// design-system.md's Spacing and Radius section on why faithful
// reproduction, not normalizing onto the 4/8px grid, is the default now.
const SHEET_CORNER_RADIUS = 24;
const HANDLE_ROW_HEIGHT = 27;
const HANDLE_TOP_OFFSET = 20;
// exported: `../card-fan-geometry.ts` reads
// this rather than keeping its own copy — see that file's own doc comment
// on why its fan-width computation depends on this exact value rather
// than merely a coincidentally-equal one.
export const SIDE_PADDING = 14.5;
const CONTENT_GAP = 40;

// capped at 600 rather than left to grow with the screen — see
// [decisions/2026-09-05-cap-the-bottom-sheet-panel-at-600pt.md](../../../../docs/decisions/2026-09-05-cap-the-bottom-sheet-panel-at-600pt.md)
// for why. exported for the same reason `SIDE_PADDING` above is.
export const PANEL_MAX_WIDTH = 600;

/**
 * the panel's own outer width — `Math.min(screenWidth, PANEL_MAX_WIDTH)`,
 * factored out here so `sidePadding` and `sheetContentWidth` below, and
 * `styles.panel`'s own `width` further down, all read it from this one
 * place instead of each computing it independently.
 *
 * `styles.panel`'s own `width` reads this function's result directly
 * rather than a plain CSS percentage: a percentage the layout engine
 * resolves on its own can diverge from this same `rt.screen.width`
 * reading — the reading `sidePadding` and `sheetContentWidth` already use
 * for everything else on that screen — since nothing ties the two
 * together. feeding this function's result straight into `styles.panel`'s
 * own `width` (below) makes the panel's outer box and its content agree by
 * construction instead of through two separate calculations that can
 * diverge.
 */
// exported alongside `SIDE_PADDING` and `PANEL_MAX_WIDTH` above, for the
// same reason.
export function panelWidth(screenWidth: number): number {
  return Math.min(screenWidth, PANEL_MAX_WIDTH);
}

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
// same reason: `sheetContentWidth` below, and `../card-fan-geometry.ts`,
// both call this directly now rather than reimplementing its
// cap-and-inset arithmetic.
export function sidePadding(inset: number, screenWidth: number): number {
  const panelEdgeGap = (screenWidth - panelWidth(screenWidth)) / 2;
  return Math.max(SIDE_PADDING, inset - panelEdgeGap);
}

/**
 * the sheet's own content box width — `styles.panel`'s rendered width
 * (`panelWidth(screenWidth)`, the same call `styles.panel`'s own `width`
 * itself makes below, not merely a value that happens to equal it) minus
 * its own left/right `sidePadding` — computed synchronously from the same
 * three terms `styles.panel` below already reads off `useUnistyles()`'s `rt`,
 * rather than measured via `onLayout`. exported so a child rendered inside
 * this sheet's `content` (`../cards-pane/cards-pane.tsx`'s fan) can
 * lay itself out on its first render instead of waiting a frame for a
 * measurement of a box this function already knows the width of — see that
 * component's own doc comment for why this was worth doing there and the
 * trade-off it accepts by relying on this cross-module read.
 */
export function sheetContentWidth(screenWidth: number, insetLeft: number, insetRight: number) {
  return (
    panelWidth(screenWidth) -
    sidePadding(insetLeft, screenWidth) -
    sidePadding(insetRight, screenWidth)
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    // this component renders through `<PortalHost />` (`usePortal` above),
    // painting outside its caller's own layout entirely — its caller is
    // therefore not in a position to place it, which is why this root sets
    // its own `position: 'absolute'` and all four insets rather than
    // taking placement from a caller the way docs/conventions/
    // component-styling.md's "Placement Is the Caller's" rule otherwise
    // requires. this is that rule's one stated exception, not a violation
    // of it.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  // `theme.colors.scrim` — this sheet's own backdrop colour role, since
  // the design file draws the sheet with nothing behind it. see that
  // token's doc comment (`src/core/theme/tokens.ts`) and docs/conventions/
  // design-system.md's "Bottom Sheet Scrim" entry for the value and the
  // decision behind it. the *opacity* that fades this in and
  // out with the drag animates separately, in `animatedBackdropStyle` —
  // this base style only carries the flat colour and full-bleed
  // positioning. `AnimatedBlurView` above reuses this same style object for
  // its own sizing and positioning, so its blur layer stays exactly
  // coextensive with this flat-colour one.
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
    // comment. below the cap, `panelWidth` resolves to `rt.screen.width`
    // itself, so this still spans the full screen edge-to-edge, and
    // `alignSelf: 'center'` is a no-op there, since there is no leftover
    // width for it to centre within. see `panelWidth`'s own doc comment
    // for why this is computed explicitly, from the same `rt.screen.width`
    // reading `sidePadding`/`sheetContentWidth` already use, rather than
    // through a CSS `100%` percentage.
    width: panelWidth(rt.screen.width),
    alignSelf: 'center',
    paddingStart: sidePadding(rt.insets.left, rt.screen.width),
    paddingEnd: sidePadding(rt.insets.right, rt.screen.width),
    // this component renders through `<PortalHost />`, so the panel's
    // bottom edge is the physical bottom of the window, where the home
    // indicator or gesture bar actually sits — this inset is exactly the
    // clearance it needs.
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
    // spaces the handle row against whichever of `BottomSheetHeader`/
    // `BottomSheetBody` actually renders as this box's next child, and the
    // two against each other when both do — the "handle row to tab row"
    // landmark gap `../../../features/hand-ranges/ui/holding-input-sheet/
    // holding-input-sheet.tsx`'s doc comment names, now this panel's own
    // flex `gap` rather than a `marginTop` repeated on each slot's own root:
    // a `marginTop` on `BottomSheetHeader`/`BottomSheetBody`'s own root
    // would be exactly the placement docs/conventions/component-styling.md's
    // "Placement Is the Caller's" rule forbids a component's own root from
    // setting, now that each is a component of its own rather than a view
    // this function built inline.
    gap: CONTENT_GAP,
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
  // `BottomSheetHeader`'s own root — no `marginTop` of its own now that
  // `styles.panel`'s own `gap` above supplies it.
  header: {},
  // `BottomSheetBody`'s own outer wrapper — the plain `View`
  // `contentPan`'s `GestureDetector` wraps; see that component's own doc
  // comment for why this sits between `contentPan` and the
  // `Animated.ScrollView` `nativeGesture` wraps, rather than either
  // gesture wrapping the scroll view directly.
  contentContainer: {
    flexShrink: 1,
  },
  // the `Animated.ScrollView`'s own container half of the two-surface
  // styling pattern (docs/conventions/component-styling.md) — `flexGrow: 1`
  // is what lets it fill `contentContainer` once that box has been shrunk
  // to fit `styles.panel`'s own `maxHeight` cap, so the scroll view — not
  // the box around it — is what ends up bounded enough to actually scroll
  // its overflow rather than growing past the panel's own cap. a caller's
  // own `style` (`BottomSheetBody`'s own `style` prop) merges in after this,
  // per that same document's "The Caller's Style Lands on the JSX Root"
  // rule.
  contentScroll: {
    flexGrow: 1,
  },
}));
