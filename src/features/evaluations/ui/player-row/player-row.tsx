import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionSizeTimingConfig, motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { TrashIcon } from '@/core/icons/trash-icon';
import { handRangeCardPairCount } from '@/shared/model/hand-range';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { HoleCardsPreview } from '@/shared/ui/hole-cards-preview/hole-cards-preview';
import { RankPairGrid } from '@/shared/ui/rank-pair-grid/rank-pair-grid';

import type { Player } from '../../model/player';
import { resolveSwipeRelease, SWIPE_COMMIT_THRESHOLD, SWIPE_REVEAL_OFFSET } from './dismissal';

const ROW_HEIGHT = 96;
const PREVIEW_SIZE = 64;
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
 * **tapping the preview edits this player, the rest of the row stays
 * inert.** the card faces / rank-pair grid are the only pressable region
 * (`styles.preview` below, wrapped in a `Pressable`) — nothing else in this
 * row has a press handler, and the swipe gesture below still covers the
 * row's full width regardless. a stationary tap still reaches that
 * `Pressable` because `pan` never claims it: `pan`'s `activeOffsetX`
 * requires `SWIPE_ACTIVATION_DISTANCE` (10px) of horizontal travel before
 * it activates, so a touch that never moves is never taken from the
 * `Pressable` in the first place — there is nothing here for the two to
 * actually contend over.
 *
 * **that reasoning crosses two different touch systems, not one gesture
 * arena.** `Pressable` runs on React Native's own responder system; `pan`
 * runs on react-native-gesture-handler. nothing settles the two against
 * each other inside one arena the way `../../../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`'s own `tap` and `pan` are, raced with `Gesture.Race()`
 * there — this row only avoids needing that because the pan's own
 * activation distance already keeps a stationary tap out of its way. that
 * is the ordinary shape for a swipe-to-delete row regardless:
 * react-native-gesture-handler's own `Swipeable` renders an arbitrary
 * pressable child inside a pan handler the same way, which is why this row
 * isn't built `bottom-sheet.tsx`'s way instead.
 *
 * **and it is unverified by anything in this repository's automated
 * gates.** react-native-gesture-handler is Jest-mocked, so
 * `fireEvent.press` in `player-row.test.tsx` calls the `Pressable`'s
 * `onPress` directly and never exercises the real arbitration between the
 * two touch systems; `e2e/flows/SCN-014.yaml` taps `preview` and could
 * exercise it, but Maestro does not run in CI (docs/conventions/testing.md).
 * only an on-device pass confirms this actually holds. the preview's own
 * `Pressable` is `accessible={false}` — like `bin` below, the row's own
 * accessibility action already offers this same outcome (`'edit'`,
 * alongside `'delete'`) without a second, nested stop for a screen reader
 * to navigate into that the parent's own `accessible` group would swallow
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
 */
export function PlayerRow({
  player,
  onDelete,
  onEditRequested,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  player: Player;
  /** fires exactly once, once this player's deletion is committed — by a
   * swipe crossing `dismissal.ts`'s own commit threshold, a tap on the
   * revealed delete panel, or the row's own accessibility action. */
  onDelete: () => void;
  /** fires when this player's preview is tapped, or the row's own
   * accessibility `'edit'` action is invoked — this row knows nothing about
   * what opens in response; `../player-list/player-list.tsx` is what turns
   * this into the sheet the store's `replacePlayerHolding` reads from. */
  onEditRequested: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tHandRanges } = useTranslation('handRanges');
  const reduceMotion = usePrefersReducedMotion();

  const translateX = useSharedValue(0);
  const dragStartTranslateX = useSharedValue(0);
  const rowHeight = useSharedValue<number>(ROW_HEIGHT);

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
      onDelete();
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
        runOnJS(onDelete)();
      }
    });
  }

  function handleReleaseSettled(target: number) {
    triggerHaptic(HapticEvent.DragEnd);
    translateX.value = motionSpring(target, reduceMotion);
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

  const animatedRowBoxStyle = useAnimatedStyle(() => ({ height: rowHeight.value }));
  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  function handleEditPress() {
    // the same event the empty state's own `+ New Player` button and the
    // list's own trailing `New Player` row fire (docs/conventions/
    // haptics.md's `primaryAction` row) — all three open the identical
    // sheet, and Apple's Consistency Rule is explicit that the same
    // gesture must not read as a different sensation on two different
    // screens.
    triggerHaptic(HapticEvent.PrimaryAction);
    onEditRequested();
  }

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    if (event.nativeEvent.actionName === 'delete') {
      onDelete();
      return;
    }
    if (event.nativeEvent.actionName === 'edit') {
      onEditRequested();
    }
  }

  const isHoleCards = player.holding.kind === 'holeCards';
  const editLabel = t('playerRow.editAccessibilityLabel');
  const deleteLabel = t('playerRow.deleteAccessibilityLabel');

  const label = t('playerRow.title', { number: player.number });
  const subtitle = isHoleCards
    ? t('playerRow.holeCardsSubtitle')
    : tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) });
  const accessibilityLabel = isHoleCards
    ? t('playerRow.holeCardsAccessibilityLabel', {
        number: player.number,
        first: cardSpokenName(player.holding.holeCards.first, tHandRanges),
        second: cardSpokenName(player.holding.holeCards.second, tHandRanges),
      })
    : t('playerRow.handRangeAccessibilityLabel', { number: player.number, combos: subtitle });

  return (
    <Animated.View style={[styles.rowBox, animatedRowBoxStyle, style]} testID={testID} {...props}>
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
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.row, animatedContentStyle]}
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[
            { name: 'edit', label: editLabel },
            { name: 'delete', label: deleteLabel },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
          testID={testID ? 'content' : undefined}
        >
          <Pressable
            style={styles.preview}
            onPress={handleEditPress}
            // hidden from a screen reader — the row's own `'edit'`
            // accessibility action above already offers this same outcome;
            // see this component's own doc comment for why a nested
            // focusable stop here would be unreachable anyway, once the
            // parent `Animated.View` above groups the row as one
            // accessible element.
            accessible={false}
            testID={testID ? 'preview' : undefined}
          >
            {isHoleCards ? (
              <HoleCardsPreview holeCards={player.holding.holeCards} size={PREVIEW_SIZE} />
            ) : (
              <RankPairGrid rankPairs={player.holding.rankPairs} size={PREVIEW_SIZE} />
            )}
          </Pressable>
          <View style={styles.meta}>
            <Text style={styles.label} numberOfLines={1} testID={testID ? 'label' : undefined}>
              {label}
            </Text>
            <Text
              style={styles.subtitle}
              numberOfLines={1}
              testID={testID ? 'subtitle' : undefined}
            >
              {subtitle}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    padding: theme.space.x16,
    width: '100%',
    height: ROW_HEIGHT,
    backgroundColor: theme.colors.background.neutral.app,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: theme.space.x8,
  },
  label: {
    ...theme.typography.rowLabel,
    color: theme.colors.text.neutral.high,
  },
  subtitle: {
    ...theme.typography.rowSubtitle,
    color: theme.colors.text.neutral.low,
  },
}));
