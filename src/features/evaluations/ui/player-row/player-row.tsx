import type { ComponentProps } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import {
  motionColor,
  motionSizeTimingConfig,
  motionSpring,
  motionSpringConfig,
} from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { TrashIcon } from '@/core/icons/trash-icon';
import { handRangeCardPairCount } from '@/shared/model/hand-range';

import type { Player } from '../../model/player';
import { ROW_HEIGHT } from '../player-row-content/player-row-content';
import { resolveSwipeRelease, SWIPE_COMMIT_THRESHOLD, SWIPE_REVEAL_OFFSET } from './dismissal';
import { PlayerRowLiveContent } from './player-row-live-content';
import {
  clampReorderTranslateY,
  DRAG_LIFT_SCALE,
  LONG_PRESS_MIN_DURATION_MS,
  reorderIndexAt,
  reorderVisualOffset,
} from './reorder';

// this row's own container, while it is not the one currently being
// dragged — see this file's own doc comment on `isPickedUp` below for why
// the dragged row's own container skips this and stays a plain,
// un-animated reflow instead. built once, at module scope: it depends on
// nothing per-render, unlike this row's other animated values.
//
// `?? 1` below satisfies `LinearTransition`'s own `dampingRatio(value:
// number)` — `WithSpringConfig`'s own `dampingRatio` field is optional at
// the type level (react-native-reanimated's `commonTypes.d.ts`), even
// though `@/core/motion/tokens`'s own `motionSpringConfig` literal always
// sets one; the fallback is unreachable in practice.
const ROW_LAYOUT_TRANSITION = LinearTransition.springify(motionSpringConfig.duration).dampingRatio(
  motionSpringConfig.dampingRatio ?? 1,
);

const TRASH_ICON_SIZE = 20;

// a little further than `SWIPE_COMMIT_THRESHOLD`, so a finger carried
// straight past it still gets a small amount of give before the drag hard
// clamps — the design measures the two named rest positions
// (`dismissal.ts`), not a drag-clamp floor; this project's own choice.
const MIN_DRAG_OFFSET = SWIPE_COMMIT_THRESHOLD - 60;

// where a committed row finishes sliding, well past any device's own
// width at this row's 393-wide reference — "removes the row," the
// design's own words for `Dismissing=Ongoing` (`dismissal.ts`'s doc
// comment). not a measured value: the design draws the row as gone
// outright at that state, with nothing to measure a further offset
// against, so this is simply far enough to guarantee it reads as gone
// before `rowHeight`'s own collapse (below) finishes.
const COMMIT_EXIT_OFFSET = -500;

// react-native-gesture-handler's own standard technique for a
// horizontally-swiped row inside a vertically-scrolling container (this
// row's own container is `../player-list/player-list.tsx`'s stack inside
// the screen's `ScrollView`): activate only once a drag has travelled
// this far horizontally, and fail — yielding to the surrounding
// `ScrollView` — once it has travelled this far vertically first. neither
// figure is a design measurement; both are this project's own choice, the
// same status `../../../../shared/ui/cards-pane/cards-pane.tsx`'s own
// `CANDIDATE_LIFT` comment gives for an implementer's pick with no design
// figure to reproduce.
const SWIPE_ACTIVATION_DISTANCE = 10;

/** clamps a drag's own running offset between `MIN_DRAG_OFFSET` and `0` —
 * shared by the gesture's `onUpdate` and `onEnd` below, so the two can
 * never disagree on what a given translation resolves to. marked
 * `'worklet'` so it runs on the UI thread from either callback, the same
 * reason `@/core/motion/tokens`'s `motionSpring` is. */
function clampDragOffset(offset: number): number {
  'worklet';
  return Math.min(0, Math.max(MIN_DRAG_OFFSET, offset));
}

/**
 * one row of the Analyze players list (docs/specs/equity-analysis.md,
 * issue #87): a holding's own preview, label, and subtitle, swiped left to
 * reveal a red delete panel. **holds no store reference** — it reports a
 * deletion through `onDelete` and an edit request through `onEditRequested`,
 * both named for their outcome per docs/conventions/component-contracts.md,
 * and `../player-list/player-list.tsx` is what actually calls
 * `../../adapter/use-players.ts`'s `removePlayer`/`replacePlayerHolding`.
 *
 * **the row's own label is the player's fixed number** (`Player {{number}}`
 * — the maintainer's own on-device pass over PR #93), not the holding's own
 * notation or a `Custom` label: `player.number` is assigned once, at
 * creation (`../../model/player.ts`'s `addPlayer`), so a row's own title
 * never changes as other rows are added or removed around it. an exact
 * holding's own rank-and-suit notation (`A♡T♡`) no longer renders as text at
 * all — the two card faces already carry it — and every row's subtitle now
 * says only what *kind* of holding it carries (`Hole cards`, or the range's
 * own card-pair count).
 *
 * **tapping the preview edits this player; a hand-range row's own detail
 * region opens its breakdown instead** (issue #102) **— the bin aside,
 * these two are this row's only pressable regions.** `../player-row-content/
 * player-row-content.tsx` lays out both: the card faces / rank-pair grid
 * (`styles.preview`, wrapped in a `Pressable` given `onPreviewPress`) and,
 * for a hand-range row only, everything after it up to the chevron column
 * (`styles.detail`, wrapped in a `Pressable` given `onDetailPress`) — a
 * hole-cards row's detail region renders as a plain, non-interactive `View`
 * instead, since it has no press handler to receive (`isHandRange` below).
 * The swipe gesture still covers the row's full width regardless of which
 * of the two regions, if either, is pressable. A stationary tap still
 * reaches whichever `Pressable` it lands on because `pan` never claims it:
 * `pan`'s `activeOffsetX` requires `SWIPE_ACTIVATION_DISTANCE` (10px) of
 * horizontal travel before it activates, so a touch that never moves is
 * never taken from either `Pressable` in the first place — there is
 * nothing here for the two to actually contend over.
 *
 * **that reasoning crosses two different touch systems, not one gesture
 * arena, and it covers both pressable regions alike.** `Pressable` runs on
 * React Native's own responder system; `pan` runs on
 * react-native-gesture-handler. nothing settles the two against each other
 * inside one arena the way `../../../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`'s own `tap` and `pan` are, raced with `Gesture.Race()`
 * there — this row only avoids needing that because the pan's own
 * activation distance already keeps a stationary tap out of its way,
 * regardless of which region a stationary touch happens to land on: the
 * gate is on `pan`'s own `activeOffsetX`, not on which child underneath it
 * a given touch hits, so the preview and the detail region need no
 * separate case each. that is the ordinary shape for a swipe-to-delete row
 * regardless: react-native-gesture-handler's own `Swipeable` renders an
 * arbitrary pressable child inside a pan handler the same way, which is
 * why this row isn't built `bottom-sheet.tsx`'s way instead.
 *
 * **and it is unverified by anything in this repository's automated gates,
 * for either region.** react-native-gesture-handler is Jest-mocked, so
 * `fireEvent.press` in `player-row.test.tsx` calls a `Pressable`'s
 * `onPress` directly — the preview's or the detail region's — and never
 * exercises the real arbitration between the two touch systems;
 * `e2e/flows/SCN-015.yaml` taps `preview` and `e2e/flows/SCN-017.yaml` taps
 * `detail`, and either could exercise it for its own region, but Maestro
 * does not run in CI (docs/conventions/testing.md). only an on-device pass
 * confirms this actually holds, for both regions. both the
 * preview's and the detail region's own `Pressable`s are `accessible={false}` —
 * like `bin` below, the row's own `'edit'` accessibility action already
 * offers the preview's own outcome, and a hand-range row's own
 * `accessibilityRole="button"` (see `isHandRange` below) already offers the
 * detail region's, without a second, nested stop for a screen reader to
 * navigate into that the parent's own `accessible` group would swallow
 * anyway.
 *
 * **the swipe tracks the finger on the UI thread.** `translateX` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s worklet
 * callbacks, the same pattern `../../../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`'s own drag already establishes in this project — a
 * release settling into one of `dismissal.ts`'s three outcomes reads
 * `@/core/motion/tokens`'s `motionSpring` rather than a locally tuned
 * spring, and collapses to an immediate jump under
 * `usePrefersReducedMotion`.
 *
 * **a release short of the commit threshold rests revealed, not always
 * closed.** `dismissal.ts`'s own `SWIPE_REVEAL_THRESHOLD` — halfway to the
 * resting reveal offset — decides it: this reads as the more coherent
 * gesture (a partial swipe that has clearly passed the reveal point stays
 * revealed, offering the tap-to-delete panel, rather than snapping away
 * from a deliberate gesture) and mirrors `bottom-sheet.tsx`'s own
 * half-distance release rule rather than inventing a new one.
 *
 * **the row's own collapse on a committed delete is one continuous ease-out
 * timing curve from 96 to 0,** not a spring, and not a paused 96→48→0
 * two-step. the design's own `Dismissing=Ongoing` variant shows the
 * remaining band at 48 tall, which this project reads as a snapshot along
 * one continuous collapse rather than a distinct rest state with a pause
 * duration nothing in the design measures — but that collapse used to run
 * on `motionSpringConfig`, and the maintainer's own on-device pass over
 * PR #93 caught what that produces: the row flashed back to full height
 * for a frame at the very end of the collapse, after it had already
 * reached zero. an underdamped spring overshoots past its `0` target and
 * then rebounds back up through positive values, and this row's own
 * `overflow: 'hidden'` box (`styles.rowBox`) clips a child of fixed
 * `ROW_HEIGHT`, so any rebound re-exposes that child — while the spring's
 * `finished` callback (what actually calls `onDelete` and lets
 * `../player-list/player-list.tsx` unmount this row) only fires once the
 * spring settles, well after the rebound has painted. **that sequence is
 * the established part; exactly how the layout engine resolves the
 * negative height at the bottom of the overshoot is not** — nobody on
 * this change verified it, and nothing here depends on it, since a curve
 * that never leaves `[0, ROW_HEIGHT]` has no rebound to resolve in the
 * first place. `rowHeight` now
 * reads `@/core/motion/tokens`'s `motionSizeTimingConfig` directly, with
 * `withTiming` called here rather than through a wrapper — that config's
 * own doc comment explains why it ships with none, the same reason
 * `commitClose` in `bottom-sheet.tsx` reaches for `motionSpringConfig`
 * directly rather than through `motionSpring`: this needs a completion
 * callback to know when to call `onDelete`. its plain ease-out curve
 * cannot overshoot past `0` and settles exactly when the row visually
 * reaches zero height, so the two can never disagree again.
 *
 * **deletable and editable without the gesture.** `accessibilityActions`
 * carries `'edit'` and `'delete'`, each with its own label from
 * `analyze.playerRow.*AccessibilityLabel` — `onAccessibilityAction` below
 * calls `onEditRequested`/`onDelete` directly, skipping the swipe's own
 * visual/haptic sequence entirely for delete: a screen-reader user driving
 * that action already has their own confirmation from the assistive
 * technology itself once the row leaves the list, and animating an
 * off-screen slide for them has nothing to add.
 *
 * **every row now carries a result figure, and a hand-range row a press
 * target beside its own preview** (issue #102): `../player-row-content/
 * player-row-content.tsx` is what actually lays out the preview, the
 * label/subtitle, the result figure, and the chevron column — this
 * component wraps that shared content, by way of `./player-row-live-content.tsx`'s
 * `PlayerRowLiveContent` as of issue #163 (see below), in its own swipe
 * gesture and accessible group, exactly as it always wrapped the preview
 * and the meta block before this change. `onDetailPress` fires the same
 * `primaryAction` haptic `handleEditPress` already fires — both open a
 * sheet, and Apple's Consistency Rule forbids the same gesture reading as a
 * different sensation depending on which region of the row it landed on.
 *
 * **the result figure is real, and its presence — not the holding kind
 * alone — decides the row's own chevron and detail press** (issue #103,
 * superseding the `isHandRange`-only logic issue #102 shipped):
 * `../../adapter/use-equity-evaluation.ts`'s own `usePlayerEquityResult`
 * looks this player up by id; `null` means no result is currently
 * available (fewer than 2 players, more than 3, or an evaluation not yet
 * far enough along to have reported one), and both the result figure and
 * the chevron column render nothing at all for it (`chevron: 'omitted'`,
 * `resultLabel: null`) — exactly the "no detail to open" presentation a
 * hole-cards row already had, now shared by every row with nothing to
 * show. Once a result exists, a hand-range row gets its chevron and
 * `onDetailPress` back (`'shown'`); a hole-cards row still has no
 * distribution to break down, so it keeps the reserved, inert column it
 * always rendered (`'reserved'`) — docs/specs/equity-analysis.md's own point
 * that a hole-cards row's result figure sits at the same x position a
 * hand-range row's does. **as of issue #163, this component itself no
 * longer calls `usePlayerEquityResult` or computes any of the above** — see
 * that issue's own paragraph further below for where it moved and why.
 *
 * **that result can be live and still updating, not only a settled one, as
 * of issue #143.** `usePlayerEquityResult` returns non-`null` the moment
 * the running evaluation's first progress tick reports a number for this
 * player, not only once the whole calculation settles — its own caller
 * reads nothing about *which* case it is; the same `hasResult`/`chevron`/
 * `onDetailPress` logic above already covers both, unchanged, since neither
 * that caller nor `PlayerRowContent` distinguishes a live number from a
 * settled one. A hand-range row's chevron and detail press are therefore
 * reachable mid-calculation too, the moment its own row shows any number.
 *
 * **as of issue #163, this component no longer reads the live equity
 * result at all, or computes anything derived from it — that subscription,
 * and everything downstream of it (`resultLabel`, `chevron`,
 * `onDetailPress`'s own gating, and the result portion of
 * `accessibilityLabel`), moved one level down, into
 * `./player-row-live-content.tsx`'s own `PlayerRowLiveContent`, which this
 * component now renders inside `GestureDetector` in place of the accessible
 * group described two paragraphs above.** The reason is
 * `GestureDetector`'s own native re-sync: its own effect that pushes this
 * row's gesture configuration to the native side depends on its entire
 * incoming `props` object, not on any individual prop's own identity
 * (`react-native-gesture-handler`'s own `GestureDetector/
 * useDetectorUpdater.ts`, confirmed against the installed 2.32.0 source),
 * and React rebuilds that whole `props` object fresh on every render of
 * whatever renders `GestureDetector` — so as long as *this* component read
 * the live result directly, this component re-rendered on every one of
 * this player's own live equity-result updates, `GestureDetector`
 * re-rendered right along with it (it is this component's own child), and
 * it re-synced its native configuration on every one of those updates too,
 * for nothing the gesture itself needed to know about.
 * `PlayerRowLiveContent`'s own doc comment covers the fix's own other half
 * in more detail. This component's own gesture setup below
 * (`reorderPan`/`pan`/`composedGesture`) is completely unaffected — this is
 * purely about *which* component subscribes to the live result, never about
 * how the gesture itself works.
 *
 * **long-pressed and dragged to reorder** (issue #153): held past
 * `./reorder.ts`'s own `LONG_PRESS_MIN_DURATION_MS`, the row lifts off the
 * stack — `DRAG_LIFT_SCALE` (1.02) and the `Sheet` elevation effect
 * (`docs/conventions/design-system.md`'s Effects section), both reversed
 * on release — and tracks the finger vertically until released. **this is
 * this row's own root's first use of a real, additional `Animated.View`
 * wrapper**, not `styles.rowBox` itself: the `Sheet` shadow has to render
 * outside `styles.rowBox`'s own `overflow: 'hidden'` box (needed for the
 * swipe's own off-screen exit and this row's own height collapse above),
 * so `styles.dragWrapper` below is a new, un-clipped parent carrying the
 * lift's own `translateY`/`scale` transform and a `pointerEvents="none"`
 * shadow-casting sibling of `styles.rowBox`, rather than either living on
 * `rowBox` itself. This is not docs/conventions/component-contracts.md's
 * own carve-out for a component with no single native root element — this
 * component still has exactly one, an ordinary `Animated.View` — it is
 * that same document's plain top-level rule applying to a root that has
 * simply changed: this wrapper, not `rowBox`, is now the element this
 * component's own literal JSX returns at its own top level, so it is now
 * the element this component's own props type extends, and what
 * `testID`/`style`/the rest spread below land on; every other,
 * already-`testID`'d descendant (`bin`, `content`, and the rest) stays
 * reachable underneath it exactly as before, since `within()`/
 * `getByTestId` scope by an element's own subtree, not by which ancestor
 * happens to carry the caller's `testID`.
 *
 * **one `Gesture.Pan()`, not a separate `Gesture.LongPress()` handed off
 * to one.** `react-native-gesture-handler`'s own `activateAfterLongPress`
 * config is exactly a pan gesture that requires a preceding long press —
 * the same "long-press, then hands off to a vertical pan" shape this
 * project's own plan describes, built into one native recognizer rather
 * than hand-composed from two (`Gesture.LongPress()` plus
 * `Gesture.Simultaneous`) with a JS-thread flag between them. This is
 * what keeps `Gesture.Exclusive(reorderPan, pan)` below correct against a
 * quick horizontal swipe: `reorderPan`'s own native activation gate never
 * opens before the long press elapses, so a swipe that never holds still
 * that long never contends with `pan`'s own delete gesture — no manual
 * activation state to get wrong.
 *
 * **committed live, on every row it crosses, not once on release.** the
 * functional requirement is that the *other* rows animate into the
 * vacated slot while this row is still held — `handleReorderCrossing`
 * below calls `onReorder` the instant `./reorder.ts`'s own
 * `reorderIndexAt` resolves to a new index, which is what lets
 * `../player-list/player-list.tsx`'s own store write reflow the other
 * rows immediately, through each of *their* own `ROW_LAYOUT_TRANSITION`.
 * **this row's own container skips that same transition while it is the
 * one being dragged** (`isPickedUp` below, gating `layout` on this
 * component's own root): its own flex slot reflows exactly as
 * instantaneously as every other row's does the moment the store
 * reorders, and `./reorder.ts`'s own `reorderVisualOffset` is the
 * residual, always-fractional-of-a-row `translateY` that exactly cancels
 * that instant reflow — animating this row's own container the same way
 * would let its layout spring toward the new slot on its own timeline
 * while the residual offset already assumes an instant snap, drifting the
 * two apart into a visible wobble for the one row the finger is actually
 * on.
 *
 * **`isPickedUp` is plain, non-animated React state, not a shared
 * value** — the same status `../../../../shared/ui/cards-pane/
 * cards-pane.tsx`'s own `FanCard` gives its `zIndex`/`elevated`: it drives
 * two *discrete* choices (whether this row's own container carries
 * `ROW_LAYOUT_TRANSITION` at all, and whether it draws above its
 * siblings), neither of which is a value Reanimated could smoothly
 * interpolate between two states in the first place.
 *
 * **the drag's own math lives in `./reorder.ts`, mirroring `./dismissal.ts`'s
 * own role for the swipe** — `clampReorderTranslateY`, `reorderIndexAt`,
 * and `reorderVisualOffset` are pure and worklet-safe, tested with no
 * gesture and no render. `dragStartIndex`/`dragLastIndex` below are what
 * let those functions stay correct across a live drag that may itself
 * trigger a re-render (a store write reorders `../player-list/
 * player-list.tsx`'s own `.map()`, changing this row's own `index` prop
 * mid-gesture): both are shared values, set once at pickup from that
 * render's own `index` and read — never re-seeded — on every later frame,
 * so a live reorder changing `index` out from under an in-progress drag
 * never re-bases its own math on a value that has since moved; the
 * underlying native recognizer's own `event.translationY` already stays
 * relative to the original touch-down regardless of how many times this
 * component re-renders and rebuilds `reorderPan` meanwhile — the same
 * "safe to rebuild a gesture object every render" property
 * `commitDeletion`/`handleReleaseSettled` below already rely on for the
 * swipe.
 *
 * **manual, on-device verification is required and not optional here**
 * (the plan's own Verification strategy): `fireGestureHandler` proves
 * only that this row's own JS-thread callbacks respond to a synthetic
 * state sequence, never that a real long-press-then-pan recognizer
 * actually disambiguates from the existing swipe and tap on a real
 * device, and RNTL renders no layout engine at all, so neither the lift's
 * own feel nor the other rows' live reflow is observable from any
 * automated check this project has (docs/conventions/testing.md).
 */
export function PlayerRow({
  player,
  index,
  rowCount,
  onDelete,
  onEditRequested,
  onBreakdownRequested,
  onReorder,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  player: Player;
  /** this row's own current position among `../player-list/
   * player-list.tsx`'s siblings — the `fromIndex` `./reorder.ts`'s own
   * clamp and threshold math resolve every drag against. supplied fresh
   * on every render; this row's own drag gesture captures it once, at
   * pickup, into a persisted shared value rather than re-reading it later
   * (see this component's own doc comment above for why a live reorder
   * mid-drag must not re-base an already-running drag on a value that has
   * since moved). */
  index: number;
  /** the list's own total row count — the other half of `./reorder.ts`'s
   * own clamp, alongside `index` above. */
  rowCount: number;
  /** fires exactly once, once this player's deletion is committed — by a
   * swipe crossing `dismissal.ts`'s own commit threshold, a tap on the
   * revealed delete panel, or the row's own accessibility action. carries
   * this player's own `id` (issue #162's own plan), so `../player-list/
   * player-list.tsx` can hand every row the same stable function
   * reference — its own `onDeletePlayer` prop, unwrapped — instead of
   * building a fresh closure per row on every one of its own renders,
   * which is what lets that list wrap each row in a render-skipping
   * boundary that actually does something (see that file's own doc
   * comment, and docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md). */
  onDelete: (id: string) => void;
  /** fires with this player's own `id` when this player's preview is
   * tapped, or the row's own accessibility `'edit'` action is invoked —
   * this row knows nothing about what opens in response; `../player-list/
   * player-list.tsx` is what turns this into the sheet the store's
   * `replacePlayerHolding` reads from. carries `id` for the same reason
   * `onDelete` above does. */
  onEditRequested: (id: string) => void;
  /** fires with this player's own `id` when anywhere on a hand-range row
   * other than its preview is pressed (issue #102) — never fires for a
   * hole-cards row, which has no distribution to break down. This row
   * knows nothing about the Equity Breakdown sheet that opens in response;
   * `../analyze-screen/analyze-screen.tsx` is what owns which player, if
   * any, that sheet is open for. carries `id` for the same reason
   * `onDelete` above does. */
  onBreakdownRequested: (id: string) => void;
  /** fires with this player's own `id` and the target index a long-press
   * drag has crossed to — potentially several times over one held drag,
   * live, as it crosses further rows' own midpoints, not once at the very
   * end (this component's own doc comment above). named for the outcome,
   * not the mechanism, per docs/conventions/component-contracts.md; this
   * row knows nothing about `../../adapter/use-players.ts`'s own
   * `movePlayerById`, which `../player-list/player-list.tsx` is what
   * actually calls — `id` is what lets that list hand every row that same
   * function reference directly, unwrapped, the same reason `onDelete`
   * above carries it. */
  onReorder: (id: string, toIndex: number) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tHandRanges } = useTranslation('handRanges');
  const reduceMotion = usePrefersReducedMotion();

  const translateX = useSharedValue(0);
  const dragStartTranslateX = useSharedValue(0);
  const rowHeight = useSharedValue<number>(ROW_HEIGHT);

  // the long-press-to-drag gesture's own shared values — kept apart from
  // the swipe's `translateX`/`dragStartTranslateX` above, since the two
  // gestures animate two different transforms on two different elements
  // (`styles.dragWrapper`'s own `translateY`/`scale`, versus the content
  // box's own `translateX`) and settle independently.
  const dragTranslateY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const dragShadowOpacity = useSharedValue(0);
  // seeded fresh at every pickup (`reorderPan`'s own `onStart` below) from
  // that render's own `index` prop, then only ever read — never
  // re-seeded — for the rest of that one drag; see this component's own
  // doc comment above for why a live reorder changing `index` mid-drag
  // must not re-base an already-running drag's own math on it.
  const dragStartIndex = useSharedValue(0);
  // this row's own most recently committed index over the current drag —
  // compared against on every `onUpdate` frame so `onReorder` fires only
  // when a crossing actually changes it, the same "compare against the
  // last-known value so a per-frame callback fires only on an actual
  // change" shape `../../../../shared/ui/cards-pane/cards-pane.tsx`'s own
  // `lastIndexRef` already takes for `dragTick`.
  const dragLastIndex = useSharedValue(0);

  // plain, non-animated state — see this component's own doc comment
  // above (`FanCard`'s own `zIndex`/`elevated` precedent) for why: it
  // gates two discrete choices, whether this row's own container carries
  // `ROW_LAYOUT_TRANSITION` at all and whether it draws above its
  // siblings, neither a value to interpolate between.
  const [isPickedUp, setIsPickedUp] = useState(false);

  // plain functions, rebuilt fresh every render, rather than `useCallback` —
  // the same shape `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
  // own `buildDragPan` takes, and for the same reason:
  // `react-hooks/immutability` flags a shared value's `.value` write once
  // that value has been passed as a `useCallback`/`useMemo` dependency-array
  // argument anywhere in this component (this one already does, for
  // `useAnimatedStyle` below) — nested inside a plain function instead, the
  // rule doesn't flag it, so this needs no per-line suppression comment the
  // way `bottom-sheet.tsx`'s own `commitClose` still does for its one
  // literal (non-`withSpring`) write. nothing here calls `setState` or a
  // prop callback mid-drag — the drag lives entirely in `translateX`, a
  // UI-thread shared value — so memoizing these would buy nothing anyway.
  function commitDeletion() {
    triggerHaptic(HapticEvent.DragEnd);
    translateX.value = motionSpring(COMMIT_EXIT_OFFSET, reduceMotion);
    if (reduceMotion) {
      rowHeight.value = 0;
      onDelete(player.id);
      return;
    }
    // `withTiming` directly, against `motionSizeTimingConfig` — that
    // config's own doc comment explains why it ships with no wrapper, the
    // same reason `bottom-sheet.tsx`'s own `commitClose` calls `withSpring`
    // directly against `motionSpringConfig` rather than through
    // `motionSpring`: this needs the completion callback a wrapper has
    // nowhere to thread through. see this component's own doc comment for
    // why a plain timing curve, not a spring, is what fixes the rebound
    // this used to produce.
    rowHeight.value = withTiming(0, motionSizeTimingConfig, (finished) => {
      if (finished) {
        runOnJS(onDelete)(player.id);
      }
    });
  }

  function handleReleaseSettled(target: number) {
    triggerHaptic(HapticEvent.DragEnd);
    translateX.value = motionSpring(target, reduceMotion);
  }

  // plain functions, rebuilt fresh every render, for the same reason
  // `commitDeletion`/`handleReleaseSettled` above are — `reorderPan`
  // below calls each through `runOnJS`.
  function handleDragPickup() {
    setIsPickedUp(true);
    triggerHaptic(HapticEvent.DragStart);
  }

  function handleReorderCrossing(toIndex: number) {
    onReorder(player.id, toIndex);
  }

  function handleDragRelease() {
    setIsPickedUp(false);
    triggerHaptic(HapticEvent.DragEnd);
  }

  // one native recognizer, gated to activate only once
  // `LONG_PRESS_MIN_DURATION_MS` has elapsed — see this component's own
  // doc comment above for why this is `activateAfterLongPress` rather
  // than a hand-composed `Gesture.LongPress()` plus `Gesture.Simultaneous`.
  const reorderPan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MIN_DURATION_MS)
    .onStart(() => {
      dragStartIndex.value = index;
      dragLastIndex.value = index;
      dragScale.value = motionSpring(DRAG_LIFT_SCALE, reduceMotion);
      dragShadowOpacity.value = motionColor(1, reduceMotion);
      runOnJS(handleDragPickup)();
    })
    .onUpdate((event) => {
      const clampedTranslationY = clampReorderTranslateY(
        dragStartIndex.value,
        rowCount,
        ROW_HEIGHT,
        event.translationY,
      );
      const resolvedIndex = reorderIndexAt(dragStartIndex.value, ROW_HEIGHT, clampedTranslationY);
      if (resolvedIndex !== dragLastIndex.value) {
        dragLastIndex.value = resolvedIndex;
        runOnJS(handleReorderCrossing)(resolvedIndex);
      }
      dragTranslateY.value = reorderVisualOffset(
        dragStartIndex.value,
        ROW_HEIGHT,
        clampedTranslationY,
      );
    })
    .onEnd(() => {
      dragTranslateY.value = motionSpring(0, reduceMotion);
      dragScale.value = motionSpring(1, reduceMotion);
      dragShadowOpacity.value = motionColor(0, reduceMotion);
      runOnJS(handleDragRelease)();
    });

  if (testID) {
    // exposes this gesture to `getByGestureTestId`/`fireGestureHandler`
    // separately from the swipe's own `'swipe'` id below — the two are
    // two different native recognizers, composed via `Gesture.Exclusive`
    // rather than one, so a test drives each independently.
    reorderPan.withTestId('reorder');
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-SWIPE_ACTIVATION_DISTANCE, SWIPE_ACTIVATION_DISTANCE])
    .failOffsetY([-SWIPE_ACTIVATION_DISTANCE, SWIPE_ACTIVATION_DISTANCE])
    .onStart(() => {
      cancelAnimation(translateX);
      dragStartTranslateX.value = translateX.value;
      runOnJS(triggerHaptic)(HapticEvent.DragStart);
    })
    .onUpdate((event) => {
      translateX.value = clampDragOffset(dragStartTranslateX.value + event.translationX);
    })
    .onEnd((event) => {
      // computed directly from this gesture's own start and end
      // translation, rather than read back off `translateX.value` — the
      // two agree on a real device (`onUpdate` above keeps `translateX`
      // exactly this same value on every frame), but computing it
      // independently here is what lets this decision be exercised with
      // nothing but a `BEGAN`→`END` pair under
      // `react-native-gesture-handler/jest-utils`' `fireGestureHandler`,
      // with no dependency on that testing module's own synthesised
      // intermediate `ACTIVE` step actually carrying `onUpdate`'s value
      // forward.
      const offset = clampDragOffset(dragStartTranslateX.value + event.translationX);
      const outcome = resolveSwipeRelease(offset);
      if (outcome === 'commitsDelete') {
        runOnJS(commitDeletion)();
        return;
      }
      const target = outcome === 'restsRevealed' ? SWIPE_REVEAL_OFFSET : 0;
      runOnJS(handleReleaseSettled)(target);
    });

  if (testID) {
    // exposes this gesture to `getByGestureTestId`/`fireGestureHandler`
    // from `react-native-gesture-handler/jest-utils` — a local, fixed id,
    // not derived from this row's own `testID`, per docs/conventions/
    // component-contracts.md's own carve-out for a gesture's `.withTestId()`.
    pan.withTestId('swipe');
  }

  // long-press-then-pan first: `reorderPan`'s own native activation gate
  // (`activateAfterLongPress` above) never opens before the long press
  // elapses, so a quick horizontal swipe that never holds still that long
  // still reaches `pan` unchanged — see this component's own doc comment
  // above.
  const composedGesture = Gesture.Exclusive(reorderPan, pan);

  const animatedRowBoxStyle = useAnimatedStyle(() => ({ height: rowHeight.value }));
  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const animatedDragWrapperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragTranslateY.value }, { scale: dragScale.value }],
  }));
  const animatedElevationStyle = useAnimatedStyle(() => ({
    opacity: dragShadowOpacity.value,
  }));

  function handleEditPress() {
    // the same event the Analyze players section's own add-player FAB
    // fires (docs/conventions/haptics.md's `primaryAction` row,
    // `../new-player-fab/new-player-fab.tsx`) — both open the identical
    // sheet, and Apple's Consistency Rule is explicit that the same
    // gesture must not read as a different sensation on two different
    // screens.
    triggerHaptic(HapticEvent.PrimaryAction);
    onEditRequested(player.id);
  }

  // shares `primaryAction` with `handleEditPress` above, for the same
  // reason: both open a bottom sheet from a press on this row, and this
  // project's haptics table maps every sheet-opening press to that one
  // event regardless of which sheet it opens (docs/conventions/
  // haptics.md).
  function handleDetailPress() {
    triggerHaptic(HapticEvent.PrimaryAction);
    onBreakdownRequested(player.id);
  }

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    if (event.nativeEvent.actionName === 'delete') {
      onDelete(player.id);
      return;
    }
    if (event.nativeEvent.actionName === 'edit') {
      onEditRequested(player.id);
    }
  }

  const isHoleCards = player.holding.kind === 'holeCards';
  const editLabel = t('playerRow.editAccessibilityLabel');
  const deleteLabel = t('playerRow.deleteAccessibilityLabel');

  const label = t('playerRow.title', { number: player.number });
  const subtitle = isHoleCards
    ? t('playerRow.holeCardsSubtitle')
    : tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) });

  return (
    // this component's own root now — see its own doc comment above for
    // why `styles.rowBox` below no longer is: the `Sheet` elevation
    // effect (`styles.elevation` below) has to render outside `rowBox`'s
    // own `overflow: 'hidden'` box. `layout` carries `ROW_LAYOUT_TRANSITION`
    // only while this row isn't the one being dragged — animating this
    // row's own reflow the same way would fight the residual offset
    // `reorderVisualOffset` already assumes is instant (this component's
    // own doc comment above).
    <Animated.View
      style={[styles.dragWrapper, isPickedUp && styles.pickedUp, animatedDragWrapperStyle, style]}
      layout={isPickedUp ? undefined : ROW_LAYOUT_TRANSITION}
      testID={testID}
      {...props}
    >
      <Animated.View style={[styles.elevation, animatedElevationStyle]} pointerEvents="none" />
      <Animated.View style={[styles.rowBox, animatedRowBoxStyle]}>
        <Pressable
          style={styles.bin}
          onPress={commitDeletion}
          // hidden from a screen reader — the row's own accessibility
          // action above already offers this same outcome without a
          // second, only-sometimes-revealed stop to navigate to (see this
          // component's own doc comment).
          accessible={false}
          testID={testID ? 'bin' : undefined}
        >
          <TrashIcon color={theme.colors.text.neutral.high} size={TRASH_ICON_SIZE} />
        </Pressable>
        <GestureDetector gesture={composedGesture}>
          <PlayerRowLiveContent
            player={player}
            label={label}
            subtitle={subtitle}
            animatedContentStyle={animatedContentStyle}
            editLabel={editLabel}
            deleteLabel={deleteLabel}
            handleAccessibilityAction={handleAccessibilityAction}
            onPreviewPress={handleEditPress}
            onDetailPress={handleDetailPress}
            testID={testID}
          />
        </GestureDetector>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // this component's own root — see its own doc comment above for why it
  // is a new wrapper rather than `rowBox` below. `position: 'relative'`
  // anchors `elevation` below, the same reason `rowBox`'s own carries it
  // for `bin`.
  dragWrapper: {
    width: '100%',
    position: 'relative',
  },
  // drawn above its siblings only while picked up, so a row dragged
  // downward across a later sibling still paints on top of it — plain,
  // non-animated, driven by `isPickedUp` (this component's own doc
  // comment above), not `dragScale`/`dragTranslateY`.
  pickedUp: {
    zIndex: 1,
  },
  // the `Sheet` elevation effect (docs/conventions/design-system.md),
  // faded in and out on pickup/release rather than always drawn — a
  // transparent, `pointerEvents="none"` sibling of `rowBox` below, not a
  // style on `rowBox` itself, since `rowBox`'s own `overflow: 'hidden'`
  // would otherwise clip a shadow drawn outside its bounds. this row's
  // first use of a shadow at all — `Sheet` was previously used only for a
  // top-anchored surface (the nav bar), never a list row.
  elevation: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    boxShadow: theme.effects.sheet,
  },
  rowBox: {
    width: '100%',
    overflow: 'hidden',
    // anchors this row's own full-bleed `bin` below, not a placement
    // choice about where this row itself sits among its siblings, per
    // docs/conventions/component-styling.md's "A Positioning Context for a
    // Component's Own Children Is Not Placement" rule.
    position: 'relative',
  },
  bin: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.solid.destructive.rest,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: theme.space.x16,
  },
}));
