import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { Card } from '@/shared/model/card';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { PlayingCard } from '@/shared/ui/playing-card/playing-card';

import { boardToSlots, type Board as BoardType } from '../../model/board';

// a playing card's own measured aspect ratio, not a spacing decision — the
// fixed-element-dimension exemption react-component-styling documents, the
// same one `PlayingCard`'s own `SIZE_CONFIG` (`@/shared/ui/playing-card/
// playing-card.tsx`, and this file's own doc comment below) already takes
// rather than normalizing onto the 4/8px grid.
const SLOT_WIDTH = 48;
const SLOT_HEIGHT = 75;

// how far a slot fades while a finger is down on it — see
// docs/decisions/2026-09-05-set-the-board-slot-pressed-opacity-to-0-66.md
// for why this value, and why opacity rather than a border recolour.
const SLOT_PRESSED_OPACITY = 0.66;

/**
 * the Analyze screen's board: five card slots in a centred row, read from
 * the design's `I600:26731;600:26661` (docs/specs/equity-analysis.md).
 * each slot is its own press target, opening the board input sheet
 * (`../board-input-sheet/`) on the slot pressed. a filled slot renders the
 * card it holds — the same 48×75, 8px-radius `PlayingCard` the input
 * sheet's own preview slots render (Figma node `142:13181`, the `Home`
 * frame `142:13177`) — and an empty one keeps its dashed outline; `cards`
 * is this component's whole board state, sourced from `../../adapter/
 * use-board.ts` by its own caller. the board's own geometry does not
 * change with it: still 16px between slots, no label, the nav bar's own
 * band.
 *
 * **the row does not collapse into one accessibility element.**
 * `accessible={true}` would collapse every descendant into one element, so
 * five separate controls could not be reached through it. each slot carries
 * its own label and `accessibilityRole="button"` instead — which is also
 * what actually announces the slot as pressable, since the pressed state
 * (see `SLOT_PRESSED_OPACITY` above) is a deliberately low-contrast
 * signal. the row itself keeps its summary through
 * `accessibilityRole="summary"` + `accessibilityLabel`, the same shape
 * `@/shared/ui/cards-pane/cards-pane.tsx`'s own slots row uses for the
 * identical problem — `summary` collapses no descendant, so the summary
 * survives without costing the five slots their own stops. unlike that
 * pane's own row, this one keeps the summary unconditionally rather than
 * dropping it once populated: `t('board.populatedAccessibilityLabel')`
 * reads out every filled card, joined, alongside each slot's own label.
 *
 * draws its own `Sheet` shadow at its own bottom edge, on its own
 * `background.neutral.subtle` background — a design decision that belongs
 * to this board alone. **until issue #260, this matched the nav bar above
 * it exactly, with that nav bar's own shadow suppressed by its caller so
 * the two read as one unbroken top band; issue #260 flattened every
 * screen's header (no border, no shadow, ever, background matching the
 * screen instead of this board's own `subtle` token) and removed that
 * suppression mechanism outright**, so the nav bar and this board no
 * longer coordinate — this board's own background and shadow are
 * unchanged by that issue and are recorded here only as this board's own
 * choice now, not half of a shared presentation. rendered outside the
 * Analyze screen's `Animated.ScrollView`, so the board stays pinned while
 * the players list beneath it scrolls.
 */
export function Board({
  cards,
  onEditRequest,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** the board's own current cards, in dealing order — 0 for an empty
   * board, 3/4/5 for a flop/turn/river. `boardToSlots` (`../../model/
   * board.ts`) is what turns this back into the five-long, left-packed row
   * this component actually maps over. */
  cards: BoardType;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — a press on a slot reports
   * that the user asked to edit the board, carrying the slot they pressed
   * so the sheet can open focused on it. this component draws its own
   * cards but holds no board state of its own — it is handed `cards`, not
   * a store reference — so this is the whole of what it reports. */
  onEditRequest: (slotIndex: number) => void;
}) {
  const { t } = useTranslation('analyze');
  const { t: tCards } = useTranslation('handRanges');

  const slots = boardToSlots(cards);
  const isPopulated = cards.length > 0;
  const summaryLabel = isPopulated
    ? t('board.populatedAccessibilityLabel', {
        cards: cards.map((card) => cardSpokenName(card, tCards)).join(', '),
      })
    : t('board.allSlotsEmptyAccessibilityLabel');

  return (
    // `style` is pulled out of the rest spread and merged via array syntax,
    // this component's `styles.root` first, the caller's last, so a caller
    // extending it doesn't wipe the board's own row layout/shadow — a
    // spread `style` would replace it instead of merging; every other rest
    // prop, `testID` included, spreads last, letting a caller override an
    // explicit default.
    <View
      style={[styles.root, style]}
      accessibilityRole="summary"
      accessibilityLabel={summaryLabel}
      {...props}
    >
      {slots.map((card, index) => (
        <BoardSlot
          key={index}
          slotIndex={index}
          card={card}
          onPress={onEditRequest}
          accessibilityLabel={
            card === null
              ? t('board.slotAccessibilityLabel', { position: index + 1 })
              : t('board.filledSlotAccessibilityLabel', {
                  position: index + 1,
                  card: cardSpokenName(card, tCards),
                })
          }
          testID={`slot-${index}`}
        />
      ))}
    </View>
  );
}

/**
 * one of the board's five slots — empty (a dashed outline) or filled (the
 * `PlayingCard` it holds); its label says which position it is and, once
 * filled, which card it holds.
 *
 * fires `primaryAction` before reporting the press, the event
 * docs/conventions/haptics.md already assigns to Analyze's `+ New
 * Player`: both open a bottom sheet, and that document's consistency rule
 * asks that the same gesture keep the same sensation across the app.
 */
function BoardSlot({
  slotIndex,
  card,
  onPress,
  accessibilityLabel,
  testID,
}: {
  slotIndex: number;
  card: Card | null;
  onPress: (slotIndex: number) => void;
  accessibilityLabel: string;
  testID: string;
}) {
  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress(slotIndex);
  }, [onPress, slotIndex]);

  return (
    // the pressed style is a function of `Pressable`'s own press state, not
    // a Unistyles dynamic-function style — `styles.slot`/`styles.slotEmpty`/
    // `styles.slotPressed` are all plain entries, merged here at the call
    // site, which is what
    // docs/decisions/2026-08-29-ban-dynamic-function-styles.md requires.
    // a filled slot draws none of `styles.slotEmpty`'s own dashed border —
    // `PlayingCard` already draws its own — the same split `@/shared/ui/
    // cards-pane/cards-pane.tsx`'s `PreviewSlot` already uses.
    <Pressable
      style={({ pressed }) => [
        styles.slot,
        card === null ? styles.slotEmpty : null,
        pressed && styles.slotPressed,
      ]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {card !== null ? <PlayingCard card={card} size="preview" scale={1} /> : null}
    </Pressable>
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
  // the whole 48×75 slot is the press target, not an inner region of it, so
  // the target clears both platforms' 44pt floor on each axis with no
  // `hitSlop` needed, and the row's own 16 gap keeps a near miss off a
  // neighbouring slot.
  slot: {
    width: SLOT_WIDTH,
    height: SLOT_HEIGHT,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // an empty slot draws its own dashed border; a filled slot draws none of
  // its own — `PlayingCard` already draws its own border — see
  // `BoardSlot`'s own doc comment.
  slotEmpty: {
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
  slotPressed: {
    opacity: SLOT_PRESSED_OPACITY,
  },
}));
