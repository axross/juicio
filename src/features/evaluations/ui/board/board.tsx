import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { BOARD_SLOT_COUNT } from '../../model/board';

// a playing card's own measured aspect ratio, not a spacing decision — the
// fixed-element-dimension exemption react-component-styling documents, the
// same one EmptyState's button height and NativeJobDemo's spinner already
// take rather than normalizing onto the 4/8px grid.
const SLOT_WIDTH = 48;
const SLOT_HEIGHT = 75;

// how far a slot fades while a finger is down on it — option 2B of issue
// #85's exhibit, the maintainer's own pick over recolouring the slot's
// border. the design file draws no pressed state for this slot, so the
// value itself is an implementer's choice rather than a measurement: two
// thirds, deliberately short of React Native's own `TouchableOpacity`
// default (0.2), which on an already-faint dashed outline reads as the
// slot vanishing rather than as a press. the exhibit records this signal
// as deliberately subtle and never the only one — the sheet opening and
// the `primaryAction` haptic carry the press too — and whether it is
// perceptible under a real fingertip is a device check, not something any
// test here can observe.
const SLOT_PRESSED_OPACITY = 0.66;

const SLOT_INDICES = Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => index);

/**
 * the Analyze screen's board: five dashed card slots in a centred row,
 * read from the design's `I600:26731;600:26661`
 * (docs/specs/equity-analysis.md). each slot is its own press target,
 * opening the board input sheet (`../board-input-sheet/`) on the slot
 * pressed; the row itself still renders no card in any state — the equity
 * engine and the board state behind a populated board are not part of this
 * change, so what the sheet submits is dropped (see
 * `src/app/(tabs)/index.tsx`'s own doc comment).
 *
 * **the row no longer collapses into one accessibility element.** it used
 * to carry a single `accessible` + `accessibilityLabel` for all five
 * slots, on the reasoning that five identical unlabelled stops would be
 * noise. that reasoning held only while the slots did nothing:
 * `accessible={true}` collapses every descendant into one element, so five
 * separate controls simply cannot be reached through it. each slot carries
 * its own label and `accessibilityRole="button"` instead — which is also
 * what actually announces the slot as pressable, since the pressed state
 * (see `SLOT_PRESSED_OPACITY` above) is a deliberately low-contrast
 * signal. the row itself keeps its summary through
 * `accessibilityRole="summary"` + `accessibilityLabel`, the same shape
 * `@/shared/ui/cards-pane/cards-pane.tsx`'s own slots row uses for the
 * identical problem — `summary` collapses no descendant, so the summary
 * survives without costing the five slots their own stops.
 *
 * shares the nav bar's own `background.neutral.subtle` background and
 * draws the `Sheet` shadow at its own bottom edge, so the nav bar above it
 * and this board read as one unbroken top band — the design's own
 * presentation (option A of the exhibit at issue #64) — with `NavBar`'s
 * own shadow suppressed by its caller instead of drawn twice. rendered
 * outside the Analyze screen's `ScrollView`, so the board stays pinned
 * while the players list beneath it scrolls.
 */
export function Board({
  onEditRequest,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — a press on a slot reports
   * that the user asked to edit the board, carrying the slot they pressed
   * so the sheet can open focused on it. this component draws no card and
   * holds no board state, so this is the whole of what it reports. */
  onEditRequest: (slotIndex: number) => void;
}) {
  const { t } = useTranslation('analyze');

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the board's own row layout/shadow — a
    // spread `style` would replace it instead of merging; every other rest
    // prop, `testID` included, spreads last, letting a caller override an
    // explicit default.
    <View
      style={[styles.root, style]}
      // unconditional, unlike the pane's own row, which announces its
      // summary only while every slot is empty: this board renders no card
      // in any state (see this component's doc comment), so all-empty is
      // the only state it has.
      accessibilityRole="summary"
      accessibilityLabel={t('board.allSlotsEmptyAccessibilityLabel')}
      {...props}
    >
      {SLOT_INDICES.map((index) => (
        <BoardSlot
          key={index}
          slotIndex={index}
          onPress={onEditRequest}
          accessibilityLabel={t('board.slotAccessibilityLabel', { position: index + 1 })}
          testID={`slot-${index}`}
        />
      ))}
    </View>
  );
}

type BoardSlotProps = {
  slotIndex: number;
  onPress: (slotIndex: number) => void;
  accessibilityLabel: string;
  testID: string;
};

/**
 * one of the board's five slots. always empty — this component has no
 * filled state to render, so its label says only which position it is and
 * that it holds no card; a filled label would be copy nothing renders.
 *
 * fires `primaryAction` before reporting the press, the event
 * docs/conventions/haptics.md already assigns to Analyze's `+ New
 * Player`: both open a bottom sheet, and that document's consistency rule
 * asks that the same gesture keep the same sensation across the app.
 */
function BoardSlot({ slotIndex, onPress, accessibilityLabel, testID }: BoardSlotProps) {
  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress(slotIndex);
  }, [onPress, slotIndex]);

  return (
    // the pressed style is a function of `Pressable`'s own press state, not
    // a Unistyles dynamic-function style — `styles.slot`/`styles.slotPressed`
    // are both plain entries, merged here at the call site, which is what
    // docs/decisions/2026-08-29-ban-dynamic-function-styles.md requires.
    <Pressable
      style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.x16,
    paddingVertical: theme.space.x16,
    backgroundColor: theme.colors.background.neutral.subtle,
    boxShadow: theme.effects.sheet,
  },
  // the whole 48×75 slot is the press target, not an inner region of it —
  // the exhibit's own bound on option 2B's subtle pressed state — so the
  // target clears both platforms' 44pt floor on each axis with no
  // `hitSlop` needed, and the row's own 16 gap keeps a near miss off a
  // neighbouring slot.
  slot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
  slotPressed: {
    opacity: SLOT_PRESSED_OPACITY,
  },
}));
