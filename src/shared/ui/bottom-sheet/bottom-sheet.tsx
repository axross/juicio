import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { motionColor, motionSpring, motionSpringConfig } from '@/core/motion/tokens';
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
 * mount-side half of this. Before this change the spring started at the
 * request itself, with the sheet's contents (`CardsPane`'s fifty-two card
 * faces, `HandRangePane`'s 169-cell grid) still unbuilt and nothing on
 * screen yet to show it — invisible in this suite, since this project's
 * reanimated mock resolves every animation synchronously, but not on a
 * real device. See docs/decisions/
 * 2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md.
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
 * scrim keeps deriving straight from `translateY`'s own position, exactly
 * as it did before entrance option B existed: the formula
 * `buildDragPan`'s `onUpdate` below still writes on every drag frame, and
 * `animatedBackdropStyle` itself computes once `isEntranceLeading` is
 * `false`. Only the entrance ever gave the scrim a timeline independent of
 * where the sheet actually is.
 *
 * **`onRequestClose` fires immediately once a dismissal commits, before
 * the exit even starts playing — not once it finishes.** it used to wait
 * for the exit spring's own `finished` callback, which an underdamped
 * spring (a slight overshoot, by design) reports well after the sheet
 * already reads as offscreen; a caller whose own state update rode on
 * that callback (`../../../features/hand-ranges/ui/holding-input-sheet/
 * holding-input-sheet.tsx`'s `onSubmit`/`onDismiss`, and everything
 * downstream of them) waited on an animation it had no reason to wait
 * for. only the `sheetClose` haptic still waits for the exit to actually
 * settle — a haptic firing before the sheet visually finishes moving
 * would read as premature, which `onRequestClose`'s own caller-facing
 * state update has no equivalent concern for.
 *
 * **this component tracks its own "still rendering" state internally
 * (`isRendering` below), independent of the `visible` prop, to make that
 * timing change safe.** a caller almost always flips `visible` to `false`
 * from inside `onRequestClose` itself — which, now that `onRequestClose`
 * fires at the *start* of the exit, means `visible` usually goes false
 * while the exit is still playing. gating the portal's own output
 * directly on `visible` (this component's previous behaviour) would have
 * unmounted the sheet the instant the prop changed, cutting the exit
 * short and reading as a snap rather than a slide. `isRendering` instead
 * flips to `false` only once the exit's own completion callback runs
 * (`handleExitSettled` below) — or immediately, under reduce motion,
 * where there is nothing to wait for — so the exit always plays out in
 * full regardless of how quickly the caller reacts to `onRequestClose`.
 * `visible` flipping to `false` through some route other than this
 * component's own three dismissal paths (none of which this effect can
 * distinguish from one already in flight — see `isClosingRef` below)
 * still hides immediately, skipping the exit animation entirely, exactly
 * as before this change: this primitive only choreographs the three
 * dismissal paths it owns.
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
  // component's own doc comment (entrance option B, "a sheet mounted
  // already open") and `isEntranceLeading`'s own seed a few lines down,
  // which the same first frame depends on together with this one.
  const translateY = useSharedValue(visible ? windowHeight : 0);
  const dragStartTranslateY = useSharedValue(0);
  // the scrim's own timeline — see this component's own doc comment (entrance
  // option B) for why it no longer derives from `translateY`. starts fully
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
  // exit), unchanged from before entrance option B existed. read by
  // `animatedBackdropStyle` below, on the UI thread. set `true` only at the
  // moment a fresh, non-reduced-motion entrance is requested (the
  // visibility effect below) — reduce motion never sets it, since there is
  // no travel for the scrim to lead ahead of — and reset to `false` the
  // moment anything ends that lead: the entrance settling
  // (`handleEntranceSettled`), a drag interrupting it
  // (`buildDragPan`'s `onStart`), a dismissal committing (`commitClose`,
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

  const wasVisible = useRef(false);

  // whether this component is currently rendering its own portalled
  // output — deliberately independent of the `visible` prop; see this
  // component's own doc comment for why. initialised from `visible` so a
  // caller that mounts this component already `visible={true}` renders
  // immediately, the same as the previous `visible`-gated behaviour did.
  const [isRendering, setIsRendering] = useState(visible);

  // whether the panel — the handle, `header`, and `children`, everything
  // but the backdrop — is currently mounted. **always starts `false`,
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
  const [isPanelRendering, setIsPanelRendering] = useState(false);

  // `true` from the moment `commitClose` below starts a dismissal this
  // component itself owns, until that dismissal's own animation settles
  // (or immediately, under reduce motion) — set synchronously, before
  // `onRequestClose` is even called, so the visibility effect below can
  // tell "the caller's `visible` prop just went false because *this*
  // dismissal reached them" apart from "`visible` went false through some
  // other route entirely," which still hides immediately (see that
  // effect's own `else if` branch). a plain `useRef`, not a Reanimated
  // shared value: `useSharedValue` was tried first, since it sidesteps the
  // `react-hooks/refs` lint noted below — but this project's own
  // `react-native-reanimated/mock` (`useSharedValue`'s own source,
  // `node_modules/react-native-reanimated/src/mock.ts`) constructs a fresh,
  // unmemoized value object on every call, unlike real Reanimated's
  // `useRef`-backed one; a value this needs to survive from one render's
  // `commitClose` into a *later* render's effect read (exactly this flag's
  // own job) silently resets to its initial value every render under that
  // mock, which a real device would never reproduce but this project's own
  // test suite would then be powerless to catch regressing. `useRef` has no
  // such gap — plain React, not reanimated-mocked — at the cost of the
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

  // guards the entrance's completion callback against firing after the
  // sheet is hidden by any route other than this component's own three
  // dismissal paths, none of which touch `translateY` — an in-flight
  // spring would otherwise still fire `sheetOpen` once it settles.
  // clears a still-pending fresh entrance the moment a drag starts — see
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

  const handleEntranceSettled = useCallback(() => {
    // the lead has nothing left to lead — see `isEntranceLeading`'s own
    // doc comment. unconditional: a stale callback that fires after the
    // sheet was already hidden by some other route finds this already
    // `false` (that route's own branch above already reset it), so this
    // is a harmless no-op in that case rather than one this guard needs to
    // special-case.
    isEntranceLeading.value = false;
    // `wasVisible.current`, not a closured `visible`: the closure would
    // report this render's value, not whatever is current once the
    // spring actually completes.
    if (wasVisible.current) {
      triggerHaptic(HapticEvent.SheetOpen);
    }
    // `isEntranceLeading` is a stable shared-value ref across this
    // component's lifetime, the same reason the opening effect below
    // excludes `translateY`/`scrimOpacity` from its own deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // `react-hooks/immutability` flags this write and not the later ones
      // in this same effect (`isEntranceLeading.value = true`/`= false`
      // below) — a known false positive specific to this rule, the same
      // shape as the one already noted on `handlePanelLayout`'s and
      // `commitClose`'s own writes to `translateY`/`scrimOpacity`.
      // eslint-disable-next-line react-hooks/immutability
      isEntranceLeading.value = false;

      // `windowHeight` first either way (still offscreen, in case a
      // previous exit was still in flight, or never reached it at all — a
      // dismiss triggered by something other than this component's own
      // three paths, per this component's own doc comment) — both this
      // write and whichever branch below runs land in the same tick,
      // before any frame paints, so there is no visible flash of the
      // fully-open resting position first.
      cancelAnimation(translateY);
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
        // this branch needs no `handleEntranceSettled`-style guard. true
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
        // never had before entrance option B and must not gain now, since
        // there is no travel here for a staged reveal to lead.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPanelRendering(true);
        triggerHaptic(HapticEvent.SheetOpen);
      } else if (isPanelRendering) {
        // entrance option B: the scrim leads regardless of whether the
        // sheet's own contents are ready — see this component's own doc
        // comment and `isEntranceLeading`'s own. started here, at the
        // request itself, not deferred to whichever of this branch or the
        // one below actually runs.
        startEntranceScrimLead();

        // the panel is already mounted and has already had its own first
        // paint — a re-open that arrived while a previous exit's own
        // spring hadn't finished playing yet (the case this branch's own
        // comment above already covers). there is nothing left to build,
        // so the travel starts right here, exactly as this whole branch
        // did before this change — `handlePanelLayout` below has nothing
        // to wait for, since this frame is not the panel's first.
        translateY.value = withSpring(0, motionSpringConfig, (finished) => {
          // `finished === false` means a drag interrupted the entrance
          // (`buildDragPan`'s `onStart` cancels this animation) — no open
          // haptic fires for that presentation, even if the drag is then
          // released under the threshold and the sheet snaps back open.
          if (finished) {
            runOnJS(handleEntranceSettled)();
          }
        });
      } else {
        // same lead as the branch above, for the case that still has to
        // wait on `handlePanelLayout` below.
        startEntranceScrimLead();

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
      setIsRendering(false);
      // forces the *next* open through the full one-commit-later reveal
      // again, rather than finding a panel this route just hid still
      // marked as built — see `isPanelRendering`'s own doc comment.
      setIsPanelRendering(false);
    }
    // `translateY` and `scrimOpacity` are both stable shared-value refs
    // across this component's lifetime, not values that change render to
    // render — including them here would only fire this effect on every
    // value either one takes on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, windowHeight, reduceMotion, handleEntranceSettled, isPanelRendering]);

  // mounts the panel — the handle, `header`, and `children`, everything
  // `isPanelRendering`'s own doc comment says it gates — one commit later
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
      // mirrors the "already mounted" branch's own completion above —
      // `finished === false` still means a drag interrupted the entrance,
      // no open haptic for it.
      if (finished) {
        runOnJS(handleEntranceSettled)();
      }
    });
  }, [translateY, handleEntranceSettled]);

  // the exit's own completion — mirrors `handleEntranceSettled` above, but
  // for `sheetClose`: this is deliberately the *only* place that haptic
  // fires now, since `commitClose` below moves `onRequestClose` itself to
  // fire immediately, well before this runs. also what actually stops this
  // component from rendering (`setIsRendering(false)`) and clears
  // `isClosingRef`, once the exit has genuinely finished playing.
  //
  // guarded on `isClosingRef` for the same reason `handleEntranceSettled`
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
  // `motionSpringConfig`) so open and close are symmetrical — this used to
  // animate at a plain 250ms `withTiming`, unrelated to the entrance
  // spring above.
  const commitClose = useCallback(() => {
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
      // branch calls it directly instead of reaching for either wrapper at
      // all. no `scrimOpacity` write needed here any more: `translateY` is
      // already at `windowHeight`, and `isEntranceLeading` is already
      // `false`, so `animatedBackdropStyle` below already reads the scrim
      // as fully transparent from `translateY`'s own position alone.
      // eslint-disable-next-line react-hooks/immutability
      translateY.value = windowHeight;
      handleExitSettled();
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
  ]);

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
        // a drag starting hands the scrim's own control over to
        // `translateY`'s position for the rest of this gesture — see
        // `isEntranceLeading`'s own doc comment. ends any entrance lead
        // still running (the entrance's own `withSpring`/`withTiming`
        // calls keep resolving in the background; they simply stop being
        // read once this flips) and clears a still-pending fresh entrance
        // — see `clearPendingEntranceLayout`'s own doc comment for why a
        // drag needs that too, not only `onEnd` below.
        isEntranceLeading.value = false;
        runOnJS(clearPendingEntranceLayout)();
      })
      .onUpdate((event) => {
        // never past the open position — no upward rubber-band, since
        // there's nothing above "open" to reveal. no
        // `react-hooks/immutability` suppression needed here, unlike
        // `commitClose`'s write above: that false positive is specific to
        // a shared value also read inside a top-level `useEffect`; nested
        // inside this factory function, the rule doesn't flag it.
        translateY.value = Math.max(0, dragStartTranslateY.value + event.translationY);
        // no separate scrim write here: `isEntranceLeading` is already
        // `false` (`onStart` above), so `animatedBackdropStyle` below
        // already derives the scrim straight from `translateY` on every
        // frame — the same formula this used to write into `scrimOpacity`
        // by hand, now computed once at the one place that reads it
        // instead of duplicated here too.
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
  // explicitly.
  // eslint-disable-next-line react-hooks/refs -- see `pan`'s own comment above
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

  // picks between the scrim's two sources every frame, on the UI thread —
  // see `isEntranceLeading`'s own doc comment for exactly when each
  // applies. `scrimOpacity.value` while an entrance is leading (the
  // colour/opacity character, decoupled from where the sheet actually is);
  // straight off `translateY`'s own position everywhere else — a drag, a
  // drag's own release, and the exit — the same formula this component
  // computed the backdrop's opacity by before entrance option B existed.
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
        <AnimatedPressable
          style={[styles.backdrop, animatedBackdropStyle]}
          onPress={commitClose}
          accessible={false}
          testID={testID ? 'backdrop' : undefined}
        />
        {isPanelRendering ? (
          <Animated.View
            style={[styles.panel, animatedSheetStyle]}
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
            {header !== undefined && headerPan !== null ? (
              <GestureDetector gesture={headerPan}>
                <View style={styles.header} testID={testID ? 'header' : undefined}>
                  {header}
                </View>
              </GestureDetector>
            ) : null}
            <View style={styles.content}>{children}</View>
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
// on why, now that its fan-width fix (PR #70) depends on this exact value
// rather than merely a coincidentally-equal one.
export const SIDE_PADDING = 14.5;
const CONTENT_GAP = 40;

// the design's own reference frame width (docs/conventions/
// design-system.md's `430×932` samples, and this project's existing "430
// reference" already named in ../card-fan-geometry.test.ts and
// hand-range-pane/hand-range-pane.tsx) — the design file also
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
// same reason: `sheetContentWidth` below, and `../card-fan-geometry.ts`,
// both call this directly now rather than reimplementing its
// cap-and-inset arithmetic.
export function sidePadding(inset: number, screenWidth: number): number {
  const panelWidth = Math.min(screenWidth, PANEL_MAX_WIDTH);
  const panelEdgeGap = (screenWidth - panelWidth) / 2;
  return Math.max(SIDE_PADDING, inset - panelEdgeGap);
}

/**
 * the sheet's own content box width — `styles.panel`'s rendered width
 * (`Math.min(screenWidth, PANEL_MAX_WIDTH)`) minus its own left/right
 * `sidePadding` — computed synchronously from the same three terms
 * `styles.panel` below already reads off `useUnistyles()`'s `rt`, rather than
 * measured via `onLayout`. exported so a child rendered inside this sheet's
 * `content` (`../cards-pane/cards-pane.tsx`'s fan, PR #70) can lay itself out
 * on its first render instead of waiting a frame for a measurement of a box
 * this function already knows the width of — see that component's own doc
 * comment for why this was worth doing there and the trade-off it accepts by
 * relying on this cross-module read.
 */
export function sheetContentWidth(screenWidth: number, insetLeft: number, insetRight: number) {
  const panelWidth = Math.min(screenWidth, PANEL_MAX_WIDTH);
  return panelWidth - sidePadding(insetLeft, screenWidth) - sidePadding(insetRight, screenWidth);
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
  // "handle row to tab row" landmark gap `../../../features/hand-ranges/ui/
  // holding-input-sheet/holding-input-sheet.tsx`'s doc comment names, now
  // owned here instead of by that caller's own root `View`.
  header: {
    marginTop: CONTENT_GAP,
  },
  content: {
    marginTop: CONTENT_GAP,
  },
}));
