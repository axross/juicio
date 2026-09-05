import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import type { Card } from '@/shared/model/card';
import { BottomSheet } from '@/shared/ui/bottom-sheet/bottom-sheet';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { CardsPane } from '@/shared/ui/cards-pane/cards-pane';
import { SlotFillPolicy } from '@/shared/ui/cards-pane/selection';
import { editSheetMaxWidth } from '@/shared/ui/edit-sheet-max-width';

import { useBoardInput } from '../../adapter/use-board-input';
import { resolveBoardOutcome, type Board, type BoardDismissReason } from '../../model/board';

/**
 * the board input sheet (docs/specs/equity-analysis.md): the drag handle,
 * then five preview slots and the fanned card picker directly beneath it.
 * Reached by pressing one of the board's own five slots
 * (`../board/board.tsx`) — this component knows nothing about that caller,
 * only which slot to open focused on and the `Board` it hands back.
 *
 * **no tab row, no heading, no preset control, no confirm button.** The
 * design draws a `Hand Range` / `Hand` tab row above these slots; entering
 * a hand range *as the board* is meaningless — the board is five specific
 * community cards — so the tab row is dropped, and with it the only thing
 * that sat between the handle and the slots. See
 * docs/decisions/2026-08-30-drop-the-hand-range-tab-from-the-board-input-sheet.md,
 * which also covers why the sheet is about 47pt shorter than the sibling
 * player sheet and the two do not line up vertically as a result.
 *
 * **exactly one of `onSubmit`/`onDismiss` fires per close, exactly
 * once** — docs/conventions/component-contracts.md's central rule, and
 * the same construction the sibling sheet uses: `BottomSheet`'s own
 * `onRequestClose` already fires exactly once per committed dismissal (a
 * handle tap, a drag past its threshold, or a backdrop tap — this
 * component adds no further way to close), `handleRequestClose` below
 * turns that one call into exactly one call to `resolveBoardOutcome`,
 * which returns exactly one of a `submit` or a `dismiss` outcome, and this
 * component forwards it to exactly one of its own two callbacks. Neither
 * callback is this component's to call outside that one path.
 *
 * **its props type extends `ComponentProps<typeof View>`, not
 * `ComponentProps<typeof BottomSheet>`**, even though `<BottomSheet>` is
 * this component's own literal root child element — the same non-obvious
 * choice the sibling `HoldingInputSheet` makes, and for the same reason.
 * Every prop `BottomSheet` adds of its own — `onRequestClose`,
 * `accessibilityLabel`, `handleAccessibilityLabel`, `header`, `children` —
 * is one this component already computes internally or deliberately omits
 * (`header`, per option 1A), so inheriting them would let a caller pass a
 * value this component silently never uses. What a caller of *this*
 * component can usefully extend is the sheet's own outer `View`, one layer
 * below this file's literal JSX return, which is exactly where
 * `bottom-sheet.tsx`'s own rest spread lands.
 *
 * **it reads two i18n namespaces.** `analyze` carries this sheet's own
 * copy, since namespaces here are named for the screen and this is
 * Analyze's own sheet; `handRanges` carries only the spoken card names
 * `cardSpokenName` composes, which every card surface in the app shares
 * and none of which is this sheet's to restate.
 */
export function BoardInputSheet({
  visible,
  focusedSlot,
  initialBoard,
  unavailableCards,
  onSubmit,
  onDismiss,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /** the board slot the user pressed to open this sheet. clamped by the
   * picker to the first empty slot, so on an empty board every slot opens
   * the sheet focused on the first. */
  focusedSlot: number;
  /** the board's own current cards, seeded into this sheet's preview slots
   * on every hidden-to-visible transition — mirroring `HoldingInputSheet`'s
   * existing `initialHolding` — so reopening this sheet shows the board's
   * current cards rather than resetting to five empty slots. `undefined`
   * (never mounted with an initial board at all) also seeds five empty
   * slots, the same as an explicit empty `Board` — see `../../adapter/
   * use-board-input.ts`'s own `deriveBoardSlots`. */
  initialBoard?: Board;
  /** the cards every *other* picker has already claimed — every
   * exact-holding player's own two cards
   * (`@/features/evaluations/model/unavailable-cards.ts`'s
   * `unavailableCardsForBoard`). forwarded to `CardsPane` unchanged; this
   * sheet's own current cards (`initialBoard` above) are never part of it,
   * since they were never a player's cards to begin with. */
  unavailableCards?: readonly Card[];
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires exactly once per
   * close, mutually exclusive with `onDismiss`; see this component's own
   * doc comment. */
  onSubmit: (board: Board) => void;
  /** fires exactly once per close, mutually exclusive with `onSubmit` —
   * see this component's own doc comment. */
  onDismiss: (reason: BoardDismissReason) => void;
  testID?: string;
}) {
  const { t } = useTranslation('analyze');
  const { t: tCards } = useTranslation('handRanges');
  const { rt } = useUnistyles();

  const [slots, setSlots] = useBoardInput(visible, initialBoard);

  // the same ceiling the sibling `HoldingInputSheet` applies, and
  // for the same reason — see `@/shared/ui/edit-sheet-max-width.ts`'s own
  // doc comment. `undefined` below `BottomSheet`'s own 600px cap, in
  // either orientation, so every narrower viewport keeps rendering exactly
  // as it does today.
  const maxWidth = editSheetMaxWidth(
    rt.screen.width,
    rt.screen.height,
    rt.insets.top,
    rt.insets.bottom,
  );

  const handleRequestClose = useCallback(() => {
    const outcome = resolveBoardOutcome({ slots });
    if (outcome.kind === 'submit') {
      onSubmit(outcome.board);
    } else {
      onDismiss(outcome.reason);
    }
  }, [slots, onSubmit, onDismiss]);

  // `CardsPane` carries no copy of its own (see its doc comment), so this
  // sheet resolves each slot's label here, where `t` is still typed
  // against the `analyze` namespace's own literal keys.
  const slotAccessibilityLabel = useCallback(
    ({ index, card, focused }: { index: number; card: Card | null; focused: boolean }) => {
      const position = index + 1;
      if (card === null) {
        return t('boardInput.emptySlotAccessibilityLabel', { position });
      }
      const spokenCard = cardSpokenName(card, tCards);
      return focused
        ? t('boardInput.focusedSlotAccessibilityLabel', { position, card: spokenCard })
        : t('boardInput.filledSlotAccessibilityLabel', { position, card: spokenCard });
    },
    [t, tCards],
  );

  return (
    // no `header` prop — see this component's own doc comment for why.
    // `style` is passed through rather than merged here — this component
    // sets none of its own on the sheet's root. every other rest prop
    // spreads last, the default ordering per
    // docs/conventions/component-contracts.md.
    <BottomSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      handleAccessibilityLabel={t('boardInput.handle.accessibilityLabel')}
      accessibilityLabel={t('boardInput.sheet.accessibilityLabel')}
      maxWidth={maxWidth}
      testID={testID}
      style={style}
      {...props}
    >
      <CardsPane
        slots={slots}
        fillPolicy={SlotFillPolicy.LeftPacked}
        initialFocusedSlot={focusedSlot}
        unavailableCards={unavailableCards}
        slotAccessibilityLabel={slotAccessibilityLabel}
        emptySlotsAccessibilityLabel={t('boardInput.allSlotsEmptyAccessibilityLabel')}
        onSlotsChange={setSlots}
        testID="cards-pane"
      />
    </BottomSheet>
  );
}
