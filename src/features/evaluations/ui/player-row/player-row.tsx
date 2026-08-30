import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionSpring, motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { TrashIcon } from '@/core/icons/trash-icon';
import type { Suit } from '@/shared/model/card';
import type { CardPair } from '@/shared/model/card-pair';
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
// same status `../../../hand-ranges/ui/cards-pane/cards-pane.tsx`'s own
// `CANDIDATE_LIFT` comment gives for an implementer's pick with no design
// figure to reproduce.
const SWIPE_ACTIVATION_DISTANCE = 10;

// the design's own literal notation for an exact holding's label
// (docs/specs/equity-analysis.md's Player Kinds, `A♡T♡`) — hearts takes
// the outline glyph specifically: that spec, the plan's own design
// exhibit (its rendered row label, not only its prose), and issue #87's
// own body all independently write `A♡T♡`, never `A♥T♥`. no other suit
// has a literal example anywhere in this project's own docs to match
// against, so the other three take the standard filled poker-notation
// glyphs instead — also `docs/glossary.md`'s own `A♠K♠` example for
// spades. a mixed glyph family, reproduced exactly rather than normalized
// onto one, per this project's "faithful reproduction of a measured value
// is the default" rule (docs/conventions/design-system.md).
const SUIT_NOTATION_GLYPH: Record<Suit, string> = {
  s: '♠',
  h: '♡',
  d: '♦',
  c: '♣',
};

function holdingNotation(pair: CardPair): string {
  return `${pair.first.rank}${SUIT_NOTATION_GLYPH[pair.first.suit]}${pair.second.rank}${SUIT_NOTATION_GLYPH[pair.second.suit]}`;
}

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
 * deletion through `onDelete`, named for the outcome per
 * docs/conventions/component-contracts.md, and `../player-list/
 * player-list.tsx` is what actually calls `../../adapter/use-players.ts`'s
 * `removePlayer`.
 *
 * **the swipe tracks the finger on the UI thread.** `translateX` is a
 * Reanimated shared value driven directly by `Gesture.Pan()`'s worklet
 * callbacks, the same pattern `../../../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`'s own drag already establishes in this project — every
 * further animation (a release settling into one of `dismissal.ts`'s three
 * outcomes, or the collapse that follows a committed delete) reads
 * `@/core/motion/tokens`'s `motionSpring`/`motionSpringConfig` rather than
 * a locally tuned spring, and collapses to an immediate jump under
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
 * **the row's own collapse on a committed delete is one continuous spring
 * from 96 to 0,** not a paused 96→48→0 two-step: the design's own
 * `Dismissing=Ongoing` variant shows the remaining band at 48 tall, which
 * this project reads as a snapshot along that same continuous collapse —
 * a spring animating straight from 96 to 0 passes through 48 on its own —
 * rather than a distinct rest state with a pause duration nothing in the
 * design measures.
 *
 * **deletable without the gesture.** `accessibilityActions` carries one
 * `'delete'` action, its own label from `analyze.playerRow.
 * deleteAccessibilityLabel` — `onAccessibilityAction` below calls
 * `onDelete` directly, skipping the swipe's own visual/haptic sequence
 * entirely: a screen-reader user driving this action already has their
 * own confirmation from the assistive technology itself once the row
 * leaves the list, and animating an off-screen slide for them has nothing
 * to add.
 */
export function PlayerRow({
  player,
  onDelete,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  player: Player;
  /** fires exactly once, once this player's deletion is committed — by a
   * swipe crossing `dismissal.ts`'s own commit threshold, a tap on the
   * revealed delete panel, or the row's own accessibility action. */
  onDelete: () => void;
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
    rowHeight.value = withSpring(0, motionSpringConfig, (finished) => {
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

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    if (event.nativeEvent.actionName === 'delete') {
      onDelete();
    }
  }

  const isHoleCards = player.holding.kind === 'holeCards';
  const deleteLabel = t('playerRow.deleteAccessibilityLabel');

  const label = isHoleCards
    ? holdingNotation(player.holding.holeCards)
    : t('playerRow.customLabel');
  const subtitle = isHoleCards
    ? t('playerRow.holeCardsSubtitle')
    : tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) });
  const accessibilityLabel = isHoleCards
    ? t('playerRow.holeCardsAccessibilityLabel', {
        first: cardSpokenName(player.holding.holeCards.first, tHandRanges),
        second: cardSpokenName(player.holding.holeCards.second, tHandRanges),
      })
    : t('playerRow.handRangeAccessibilityLabel', { combos: subtitle });

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
          accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
          onAccessibilityAction={handleAccessibilityAction}
          testID={testID ? 'content' : undefined}
        >
          <View style={styles.preview}>
            {isHoleCards ? (
              <HoleCardsPreview holeCards={player.holding.holeCards} size={PREVIEW_SIZE} />
            ) : (
              <RankPairGrid rankPairs={player.holding.rankPairs} size={PREVIEW_SIZE} />
            )}
          </View>
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
    ...theme.typography.description,
    color: theme.colors.text.neutral.low,
  },
}));
