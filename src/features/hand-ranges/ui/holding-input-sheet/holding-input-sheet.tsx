import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { Card } from '@/shared/model/card';
import { BottomSheet } from '@/shared/ui/bottom-sheet/bottom-sheet';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { CardsPane } from '@/shared/ui/cards-pane/cards-pane';
import { SlotFillPolicy, type CardsPaneSlots } from '@/shared/ui/cards-pane/selection';
import { editSheetMaxWidth } from '@/shared/ui/edit-sheet-max-width';
import { HandRangePane } from '@/shared/ui/hand-range-pane/hand-range-pane';
import { SegmentedTabs, type SegmentedTabsItem } from '@/shared/ui/segmented-tabs/segmented-tabs';

import { useHoldingInput } from '../../adapter/use-holding-input';
import {
  resolveHoldingOutcome,
  type Holding,
  type HoldingDismissReason,
} from '../../model/holding';

// the four landmark gaps docs/specs/hand-ranges.md's card/range input
// sheet draws uniformly 40 apart, each a local constant owned by the
// component that renders it, not one of `theme.space`'s own steps: handle
// row to tab row and tab row to slots-or-chips
// (`../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s `CONTENT_GAP`),
// slots to fan (`../../../../shared/ui/cards-pane/cards-pane.tsx`'s
// `SLOTS_TO_FAN_GAP`), and chips to grid
// (`../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`'s
// `CHIP_ROW_TO_GRID_GAP`). the panes below render as direct, un-gapped
// siblings once built, since exactly one of the two is ever in flow at a
// time and `gap` has nothing to insert between a single visible child.

/**
 * the card/range input sheet (docs/specs/hand-ranges.md): `BottomSheet` +
 * `SegmentedTabs` + the hand-range pane and the cards pane, one active at
 * a time. reached from Analyze's `+ New Player` or an existing player row
 * — this component knows nothing about either caller, only the `Holding`
 * it hands back.
 *
 * **no preset control of any kind.** the spec's own "Preset selection is
 * a separate button" is deliberately not built here — see
 * decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md
 * — because there is no preset list or data layer for a preset button to
 * reach yet; adding one now would be a control with nothing behind it.
 *
 * **both tabs keep their own state.** `rankPairs` and `holeCards` are two
 * independent pieces of state, both always present, switching `activeTab`
 * never clears either — a player who fills in two hole cards, switches to
 * `Hand Range` to look at the grid, and switches back finds their two
 * cards exactly as left. `resolveHoldingOutcome` (`../../model/holding.ts`)
 * is what reads *only* the active tab's side at close time; this
 * component owns collecting the two tabs' state, not deciding which one
 * counts.
 *
 * **exactly one of `onSubmit`/`onDismiss` fires per close, exactly
 * once** — docs/conventions/component-contracts.md's central rule.
 * `BottomSheet`'s own `onRequestClose` already fires exactly once per
 * committed dismissal (a tap on the handle, a drag past its threshold, or
 * a backdrop tap — this component adds no further way to close the
 * sheet, since docs/specs/hand-ranges.md draws no separate confirm
 * button); `handleRequestClose` below turns that one call into exactly
 * one call to `resolveHoldingOutcome`, which returns exactly one of a
 * `submit` or a `dismiss` outcome, which this component forwards to
 * exactly one of its own two callbacks. neither callback is this
 * component's to call outside that one path.
 *
 * **its own state — `activeTab`, `holeCards`, `rankPairs`, `builtTabs`
 * (which tab or tabs have been selected this open, so a pane below builds
 * once and stays built), and the re-seed-on-reopen behaviour
 * that resets all four together — now all live in one hook,**
 * `../../adapter/use-holding-input.ts`'s `useHoldingInput`, per
 * docs/conventions/component-contracts.md's state-management-hook rule:
 * this component itself no longer calls `useState` or `useEffect` at all.
 *
 * **its props type extends `ComponentProps<typeof View>`, not
 * `ComponentProps<typeof BottomSheet>`**, even though `<BottomSheet>` is
 * this component's own literal root child element. `BottomSheet`'s props
 * include `onRequestClose`, `accessibilityLabel`, `handleAccessibilityLabel`,
 * `header`, and `children` — every one of which this component already
 * computes or owns internally, so inheriting them would let a caller pass
 * a value this component would silently never use. what a caller of
 * *this* component actually wants to extend is the sheet's own outer
 * `View` — the same one `bottom-sheet.tsx`'s rest spread already reaches
 * — so that's the root this type targets, one layer further down than
 * its own literal JSX return, the same reasoning `BottomSheet`'s doc
 * comment gives for its portalled root.
 */
export function HoldingInputSheet({
  visible,
  initialHolding,
  unavailableCards,
  onSubmit,
  onDismiss,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  initialHolding?: Holding;
  /** the cards every *other* picker has already claimed — the board's own
   * current cards plus every *other* exact-holding player's own two cards
   * (`@/features/evaluations/model/unavailable-cards.ts`'s
   * `unavailableCardsForPlayer`). forwarded to the `Cards` tab's own
   * `CardsPane` only — the `Hand Range` tab excludes nothing, per the
   * plan's own non-goal: every rank pair stays selectable and the card
   * pair count is unchanged. this sheet's own edited player's cards are
   * never part of it, the same "never lock out the cards this sheet is
   * itself editing" rule `initialHolding` above already relies on. */
  unavailableCards?: readonly Card[];
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires exactly once per
   * close, mutually exclusive with `onDismiss`; see this component's own
   * doc comment. */
  onSubmit: (holding: Holding) => void;
  /** fires exactly once per close, mutually exclusive with `onSubmit` —
   * see this component's own doc comment. */
  onDismiss: (reason: HoldingDismissReason) => void;
  testID?: string;
}) {
  const { t } = useTranslation('handRanges');
  const { rt } = useUnistyles();

  const { activeTab, setActiveTab, builtTabs, holeCards, setHoleCards, rankPairs, setRankPairs } =
    useHoldingInput(visible, initialHolding);

  // on a viewport wide enough to hit `BottomSheet`'s 600px cap but short
  // relative to that width (a tablet in landscape), the two tab panes can
  // render taller than the sheet's height cap since neither looks at
  // viewport height — see `@/shared/ui/edit-sheet-max-width.ts`.
  // `undefined` below that cap, in either orientation.
  const maxWidth = editSheetMaxWidth(
    rt.screen.width,
    rt.screen.height,
    rt.insets.top,
    rt.insets.bottom,
  );

  const handleRequestClose = useCallback(() => {
    const outcome = resolveHoldingOutcome({ activeTab, holeCards, rankPairs });
    if (outcome.kind === 'submit') {
      onSubmit(outcome.holding);
    } else {
      onDismiss(outcome.reason);
    }
  }, [activeTab, holeCards, rankPairs, onSubmit, onDismiss]);

  // `CardsPane` reports a slot row of whatever length it was handed now
  // that it serves the board's five slots too, so this narrows the two it
  // was given back to the pair `holeCards` is typed as. the pane always
  // returns exactly as many slots as it received, so neither index is ever
  // absent; nothing about the pair's own behaviour changes here.
  const handleSlotsChange = useCallback(
    (slots: CardsPaneSlots) => {
      setHoleCards([slots[0], slots[1]]);
    },
    [setHoleCards],
  );

  // this sheet resolves each slot's label here, where `t` is typed against
  // the `handRanges` namespace's own literal keys — `CardsPane` itself
  // carries no copy.
  const slotAccessibilityLabel = useCallback(
    ({ index, card, focused }: { index: number; card: Card | null; focused: boolean }) => {
      const slot = t(index === 0 ? 'cards.slotName.left' : 'cards.slotName.right');
      if (card === null) {
        return t('cards.emptySlotAccessibilityLabel', { slot });
      }
      return focused
        ? t('cards.focusedSlotAccessibilityLabel', { slot, card: cardSpokenName(card, t) })
        : t('cards.filledSlotAccessibilityLabel', {
            index: index + 1,
            card: cardSpokenName(card, t),
          });
    },
    [t],
  );

  // `Cards` first, `Hand Range` second — docs/specs/hand-ranges.md's tab
  // order, and the order the sheet opens in (`../../adapter/
  // use-holding-input.ts`'s `deriveHoldingInputState`).
  const tabs: readonly SegmentedTabsItem[] = [
    { key: 'cards', label: t('tabs.cards') },
    { key: 'handRange', label: t('tabs.handRange') },
  ];

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      handleAccessibilityLabel={t('handle.accessibilityLabel')}
      accessibilityLabel={t('sheet.accessibilityLabel')}
      // the tab row rides `header`'s drag surface — see
      // `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s doc
      // comment: a drag started anywhere on the tab row follows the
      // finger the same way one started on the handle does, while a tap
      // still reaches `SegmentedTabs`' own `Pressable` untouched, since
      // only the handle races a tap against its own drag.
      header={
        <SegmentedTabs
          items={tabs}
          selectedKey={activeTab}
          // `SegmentedTabs` itself already fires `selectionChange` on
          // every press (see that component's doc comment) — a tab
          // switch firing `selectionChange` is already satisfied there;
          // firing it again here would double it.
          onSelectionChange={(key) => setActiveTab(key as typeof activeTab)}
          testID="tabs"
        />
      }
      maxWidth={maxWidth}
      testID={testID}
      style={style}
      {...props}
    >
      <View>
        {
          // a pane is built only once its own tab has been selected at
          // least once this open (`builtTabs`, `../../adapter/
          // use-holding-input.ts`), and stays mounted for the rest of this
          // open — see
          // docs/decisions/2026-09-05-keep-hand-range-and-cards-panes-mounted-once-built.md
          // for why.
          //
          // `display: 'none'` (`styles.hidden` below) on the inactive-but-
          // already-built pane, not an opacity or a positioning trick: it
          // removes that pane from layout entirely (so it contributes no
          // height to this sheet, and the panel still sizes to just the
          // active pane, per `../../../../shared/ui/bottom-sheet/
          // bottom-sheet.tsx`'s content-follows-height behaviour), takes it
          // out of touch hit-testing, and drops it from the accessibility
          // tree — the same reason RNTL's own default, accessibility-aware
          // queries already treat a `display: 'none'` element as hidden
          // (see `./holding-input-sheet.test.tsx`'s assertions on this). a
          // tab not yet in `builtTabs` gets neither treatment: it does not
          // exist in the tree at all yet, stronger than merely hidden.
        }
        {builtTabs.has('handRange') ? (
          <HandRangePane
            selectedRankPairs={rankPairs}
            onSelectionChange={setRankPairs}
            testID="hand-range-pane"
            style={activeTab === 'handRange' ? undefined : styles.hidden}
          />
        ) : null}
        {builtTabs.has('cards') ? (
          <CardsPane
            slots={holeCards}
            fillPolicy={SlotFillPolicy.Independent}
            unavailableCards={unavailableCards}
            slotAccessibilityLabel={slotAccessibilityLabel}
            emptySlotsAccessibilityLabel={t('cards.bothSlotsEmptyAccessibilityLabel')}
            onSlotsChange={handleSlotsChange}
            testID="cards-pane"
            style={activeTab === 'cards' ? undefined : styles.hidden}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** derived from the component's own argument type — per
 * docs/conventions/component-contracts.md's props-declaration rule — so
 * this stays a single source of truth rather than a hand-duplicated copy,
 * while keeping `HoldingInputSheetProps` importable
 * (this file's own test does: `Partial<Omit<HoldingInputSheetProps,
 * 'testID'>>`). */
export type HoldingInputSheetProps = ComponentProps<typeof HoldingInputSheet>;

const styles = StyleSheet.create(() => ({
  // see `HoldingInputSheet`'s own render body for why this is
  // `display: 'none'`, not an opacity or a positioning trick.
  hidden: {
    display: 'none',
  },
}));
