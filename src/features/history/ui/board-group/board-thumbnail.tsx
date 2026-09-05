import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { Card } from '@/shared/model/card';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { PlayingCard } from '@/shared/ui/playing-card/playing-card';

/** how many dashed slots a saved entry with no board cards set draws —
 * `docs/specs/calculation-history.md`'s own "a board with no cards at all
 * (drawn as three dashed slots — the design does not distinguish a
 * pre-flop board from an unset one)". */
const EMPTY_BOARD_SLOT_COUNT = 3;

// this thumbnail's own scale against `PlayingCard`'s `'preview'` size
// (48×75, the same card face `../../../evaluations/ui/board/board.tsx`'s
// own full-size slots and this project's card/range input sheet both
// draw).
//
// not a Figma re-measurement — this task's own artifact manifest supplies
// a rendered screenshot of the `History/Example` frame, not per-node
// metrics, so this value is calibrated by eye against that screenshot
// instead.
const THUMBNAIL_SCALE = 0.5;

/**
 * one board group's own board-thumbnail (`docs/specs/
 * calculation-history.md`) — the board every entry beneath it was
 * calculated against, drawn small: one `PlayingCard` per card the board
 * actually holds (3/4/5, dealing order), or `EMPTY_BOARD_SLOT_COUNT`
 * dashed slots for a saved entry with no board cards set, matching this
 * project's own dashed-empty-slot treatment
 * (`../../../evaluations/ui/board/board.tsx`'s `styles.slotEmpty`,
 * `docs/conventions/design-system.md`'s `border.neutral.unselectedControl`
 * role) rather than a new one invented for this screen.
 *
 * **presentational only — no press target, no gesture.** Unlike Analyze's
 * own `Board`, this thumbnail cannot be edited; it is a read-only record of
 * what a past calculation ran against.
 */
export function BoardThumbnail({
  board,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  board: readonly Card[];
  testID?: string;
}) {
  const { t } = useTranslation('history');
  const { t: tCards } = useTranslation('handRanges');

  const isPopulated = board.length > 0;
  const summaryLabel = isPopulated
    ? t('boardThumbnail.populatedAccessibilityLabel', {
        cards: board.map((card) => cardSpokenName(card, tCards)).join(', '),
      })
    : t('boardThumbnail.noCardsAccessibilityLabel');

  return (
    <View
      style={[styles.root, style]}
      accessibilityRole="summary"
      accessibilityLabel={summaryLabel}
      testID={testID}
      {...props}
    >
      {isPopulated
        ? board.map((card, index) => (
            <PlayingCard
              key={index}
              card={card}
              size="preview"
              scale={THUMBNAIL_SCALE}
              accessible={false}
              testID={testID ? `card-${index}` : undefined}
            />
          ))
        : Array.from({ length: EMPTY_BOARD_SLOT_COUNT }, (_, index) => (
            <View
              key={index}
              style={styles.emptySlot}
              testID={testID ? `empty-slot-${index}` : undefined}
            />
          ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    gap: theme.space.x4,
  },
  // mirrors `../../../evaluations/ui/board/board.tsx`'s own `slot`/
  // `slotEmpty` styles, at this thumbnail's own `THUMBNAIL_SCALE` rather
  // than that component's full 48×75 — the same dashed treatment, the same
  // token, a different, smaller size.
  emptySlot: {
    width: 48 * THUMBNAIL_SCALE,
    height: 75 * THUMBNAIL_SCALE,
    borderRadius: theme.radius.sm,
    borderWidth: theme.borderWidth.base,
    borderStyle: 'dashed',
    borderColor: theme.colors.border.neutral.unselectedControl,
  },
}));
