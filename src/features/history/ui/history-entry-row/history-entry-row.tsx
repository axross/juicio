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
import { TrashIcon } from '@/core/icons/trash-icon';
// this project's own existing swipe-to-delete precedent — its pure
// dismissal math, not its React/gesture code — reused directly rather than
// re-derived, per issue #180's own plan ("reusing the app's existing
// swipe-dismissal mechanism (thresholds, motion...)") and
// `docs/specs/calculation-history.md`'s own "using the same dismissal
// states as an Analyze player row." Reading from `features/evaluations/`
// is within this task's own protected-surfaces allowance ("you're
// reusing/reading its components, not modifying them"); nothing here
// touches that file. See this repository's own directory-structure.md
// `shared/` precedent (`shared/ui/empty-state/`) for the promotion bar a
// second real reader like this one would otherwise clear — flagged in
// this change's own receipt as a residual follow-up rather than performed
// here, since promoting the file would mean editing
// `player-row.tsx`'s own import, a protected surface this task does not
// touch.
import {
  resolveSwipeRelease,
  SWIPE_COMMIT_THRESHOLD,
  SWIPE_REVEAL_OFFSET,
} from '@/features/evaluations/ui/player-row/dismissal';
import { motionSizeTimingConfig, motionSpring } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import { handRangeCardPairCount } from '@/shared/model/hand-range';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { HoleCardsPreview } from '@/shared/ui/hole-cards-preview/hole-cards-preview';
import { RankPairGrid } from '@/shared/ui/rank-pair-grid/rank-pair-grid';

import type { HistoryEntry } from '../../model/history-entry';

/** this row's own design-fixed height — `docs/specs/calculation-history.md`'s
 * own measured figure ("narrower and shorter than an Analyze player row
 * (356×72, against 393×96)"), already recorded rather than re-measured
 * here. Stays with this component per
 * docs/conventions/component-styling.md's "A Design-Fixed Intrinsic
 * Dimension Stays With the Component" rule. */
export const HISTORY_ENTRY_ROW_HEIGHT = 72;

// the preview column's own size — not itself a Figma measurement (this
// task's own artifact manifest supplies a screenshot, not per-node
// metrics): derived proportionally from Analyze's own 64-wide preview at
// its 96-tall row (`../../../evaluations/ui/player-row-content/
// player-row-content.tsx`'s `PREVIEW_SIZE`), scaled by this row's own
// 72/96 height ratio — 64 * 72/96 = 48. Flagged in this change's own
// receipt as an implementer's derivation, not a re-measurement, for the
// maintainer's own on-device pass to confirm or correct.
const PREVIEW_SIZE = 48;

// no design measurement of its own ties this row's bin icon to a
// particular size, and it previously diverged from
// `../../../evaluations/ui/player-row/player-row.tsx`'s own
// identically-named/purposed constant (18 against that row's 20) with no
// rationale behind the difference — an implementer's arbitrary pick, not a
// derivation. Matched to that row's own value instead, for the same reason
// the swipe geometry constants below reuse that file's rather than
// inventing a second, potentially-diverging set of implementer choices for
// an interaction this project's own docs already call identical.
const TRASH_ICON_SIZE = 20;

// mirrors `../../../evaluations/ui/player-row/player-row.tsx`'s own
// identically-named constants and their own doc comments — this row's
// swipe reuses the exact same measured rest/commit offsets
// (`SWIPE_REVEAL_OFFSET`/`SWIPE_COMMIT_THRESHOLD`, imported above), so its
// own drag clamp and activation geometry mirror that row's rather than
// inventing a second, potentially-diverging set of implementer choices for
// an interaction this project's own docs already call identical.
const MIN_DRAG_OFFSET = SWIPE_COMMIT_THRESHOLD - 60;
const COMMIT_EXIT_OFFSET = -500;
const SWIPE_ACTIVATION_DISTANCE = 10;

function clampDragOffset(offset: number): number {
  'worklet';
  return Math.min(0, Math.max(MIN_DRAG_OFFSET, offset));
}

/**
 * one condensed History row (`docs/specs/calculation-history.md`,
 * `docs/glossary.md`'s History Entry): one saved `HistoryEntry`'s own
 * range icon and truncated holding description, swiped left to reveal a
 * red delete panel — the same dismissal states, thresholds, and haptics as
 * an Analyze player row's own swipe-to-delete
 * (`../../../evaluations/ui/player-row/player-row.tsx`), minus that row's
 * own long-press-to-drag reorder gesture, which issue #180's own plan
 * scopes out ("its reorder/drag half is Analyze-specific and out of scope
 * here").
 *
 * **renders one representative player's holding, not every player in the
 * entry.** `HistoryEntry.players` can hold two or three players
 * (docs/specs/calculation-history.md's own "each history entry is a
 * condensed row" — one row per saved entry, never one row per player
 * inside it; see `../../usecase/group-history-entries.ts`'s own doc
 * comment for the fuller reasoning). Neither the design frame nor the
 * domain model marks a player as this entry's own "primary" one, so this
 * component renders `entry.players[0]` — the first seat, the same order
 * `HistoryEntry.players`'s own doc comment already fixes ("seat order") —
 * a deterministic, low-risk default rather than a design-file reading.
 * Flagged in this change's own receipt as a decision worth the
 * maintainer's own double-check.
 *
 * **built from `RankPairGrid`/`HoleCardsPreview` directly, not
 * `PlayerRowContent`.** That shared building block is fixed at Analyze's
 * own 96-tall row with a reserved chevron column and a result figure,
 * neither of which this row has (issue #180's own plan: no tap-to-open
 * detail, no equity result to show) — issue #180's own task package names
 * this exact building-block split ("the same building block
 * `PlayerRowContent` already composes from `RankPairGrid`/
 * `HoleCardsPreview` + a `numberOfLines={1}` label/subtitle").
 *
 * **no accessibility `'edit'` action, unlike a player row.** Tapping this
 * row does nothing (issue #180's own stated non-goal), so there is no
 * edit outcome for a screen-reader user to reach either — only `'delete'`,
 * mirroring the player row's own non-gesture deletion path.
 */
export function HistoryEntryRow({
  entry,
  onDelete,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  entry: HistoryEntry;
  /** fires once this entry's deletion commits — a swipe crossing the
   * commit threshold, a tap on the revealed delete panel, or this row's
   * own accessibility action. Carries `entry.id`, the same "report the
   * outcome, not hold the store reference" shape
   * `../../../evaluations/ui/player-row/player-row.tsx`'s own `onDelete`
   * takes. */
  onDelete: (id: string) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('history');
  const { t: tHandRanges } = useTranslation('handRanges');
  const reduceMotion = usePrefersReducedMotion();

  const translateX = useSharedValue(0);
  const dragStartTranslateX = useSharedValue(0);
  const rowHeight = useSharedValue<number>(HISTORY_ENTRY_ROW_HEIGHT);

  const player = entry.players[0];
  const isHoleCards = player.holding.kind === 'holeCards';
  const subtitle = isHoleCards
    ? t('entryRow.holeCardsSubtitle')
    : tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) });
  const accessibilityLabel = isHoleCards
    ? t('entryRow.holeCardsAccessibilityLabel', {
        name: player.name,
        first: cardSpokenName(player.holding.holeCards.first, tHandRanges),
        second: cardSpokenName(player.holding.holeCards.second, tHandRanges),
      })
    : t('entryRow.handRangeAccessibilityLabel', { name: player.name, combos: subtitle });
  const deleteLabel = t('entryRow.deleteAccessibilityLabel');

  const preview = isHoleCards ? (
    <HoleCardsPreview holeCards={player.holding.holeCards} size={PREVIEW_SIZE} />
  ) : (
    <RankPairGrid rankPairs={player.holding.rankPairs} size={PREVIEW_SIZE} />
  );

  // plain functions, rebuilt fresh every render — mirrors
  // `player-row.tsx`'s own `commitDeletion`/`handleReleaseSettled` and
  // their own doc comment on why (`react-hooks/immutability` flags a
  // shared value write once that value is a `useCallback`/`useMemo`
  // dependency anywhere in this component; nothing here uses either, so
  // this needs no suppression comment at all, but the shape stays
  // consistent with that file's own).
  function commitDeletion() {
    triggerHaptic(HapticEvent.DragEnd);
    translateX.value = motionSpring(COMMIT_EXIT_OFFSET, reduceMotion);
    if (reduceMotion) {
      rowHeight.value = 0;
      onDelete(entry.id);
      return;
    }
    rowHeight.value = withTiming(0, motionSizeTimingConfig, (finished) => {
      if (finished) {
        runOnJS(onDelete)(entry.id);
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
    pan.withTestId('swipe');
  }

  function handleAccessibilityAction(event: { nativeEvent: { actionName: string } }) {
    if (event.nativeEvent.actionName === 'delete') {
      onDelete(entry.id);
    }
  }

  const animatedRowBoxStyle = useAnimatedStyle(() => ({ height: rowHeight.value }));
  const animatedContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.rowBox, animatedRowBoxStyle, style]} testID={testID} {...props}>
      <Pressable
        style={styles.bin}
        onPress={commitDeletion}
        // hidden from a screen reader — this row's own accessibility
        // action below already offers this same outcome, mirroring
        // `player-row.tsx`'s own `bin`.
        accessible={false}
        testID={testID ? 'bin' : undefined}
      >
        <TrashIcon color={theme.colors.text.neutral.high} size={TRASH_ICON_SIZE} />
      </Pressable>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.content, animatedContentStyle]}
          accessible
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
          onAccessibilityAction={handleAccessibilityAction}
          testID={testID ? 'content' : undefined}
        >
          <View style={styles.preview} testID={testID ? 'preview' : undefined}>
            {preview}
          </View>
          <View style={styles.meta}>
            <Text style={styles.label} numberOfLines={1} testID={testID ? 'label' : undefined}>
              {player.name}
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
    // Component's Own Children Is Not Placement" rule — the same reason
    // `player-row.tsx`'s own `rowBox` carries it.
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
  content: {
    width: '100%',
    height: HISTORY_ENTRY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    paddingHorizontal: theme.space.x16,
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
    gap: theme.space.x4,
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
