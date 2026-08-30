import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/shared/ui/bottom-sheet/bottom-sheet';
import { SegmentedTabs, type SegmentedTabsItem } from '@/shared/ui/segmented-tabs/segmented-tabs';

import { useHoldingInput } from '../../adapter/use-holding-input';
import {
  resolveHoldingOutcome,
  type Holding,
  type HoldingDismissReason,
} from '../../model/holding';
import { CardsPane } from '../cards-pane/cards-pane';
import { HandRangePane } from '../hand-range-pane/hand-range-pane';

// the four landmark gaps docs/specs/hand-ranges.md's card/range input
// sheet draws uniformly 40 apart: handle row to tab row and tab row to
// slots-or-chips (both now owned by `../../../../shared/ui/bottom-sheet/
// bottom-sheet.tsx`'s own `CONTENT_GAP` — that component renders the tab
// row itself, through its `header` prop below, since the widened drag
// surface needs the tab row inside the same gesture chrome the handle
// already is), slots to fan (`../cards-pane/cards-pane.tsx`'s
// `SLOTS_TO_FAN_GAP`), and chips to grid
// (`../hand-range-pane/hand-range-pane.tsx`'s `CHIP_ROW_TO_GRID_GAP`).
// not one of `theme.space`'s steps (`x32`, `x48`), so each file names its
// own local constant rather than sharing one — the same "duplicate the
// one-off measured pixel value, don't centralise it" shape this project's
// other fixed dimensions already take (`bottom-sheet.tsx`'s
// `CONTENT_GAP` and `segmented-tabs.tsx`'s `TRACK_PADDING`, for two).
// this file no longer owns any of the four — both panes below render as
// direct, un-gapped siblings, since exactly one of the two is ever in
// flow at a time (`styles.hidden`'s `display: 'none'` removes the other)
// and `gap` has nothing to insert between a single visible child.

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
 * cards exactly as left. `resolveHoldingOutcome` (`../model/holding.ts`)
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
 * **its own state — `activeTab`, `holeCards`, `rankPairs`, and the
 * re-seed-on-reopen effect — now all live in one hook,**
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
  onSubmit,
  onDismiss,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  initialHolding?: Holding;
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

  const { activeTab, setActiveTab, holeCards, setHoleCards, rankPairs, setRankPairs } =
    useHoldingInput(visible, initialHolding);

  const handleRequestClose = useCallback(() => {
    const outcome = resolveHoldingOutcome({ activeTab, holeCards, rankPairs });
    if (outcome.kind === 'submit') {
      onSubmit(outcome.holding);
    } else {
      onDismiss(outcome.reason);
    }
  }, [activeTab, holeCards, rankPairs, onSubmit, onDismiss]);

  const tabs: readonly SegmentedTabsItem[] = [
    { key: 'handRange', label: t('tabs.handRange') },
    { key: 'cards', label: t('tabs.cards') },
  ];

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      handleAccessibilityLabel={t('handle.accessibilityLabel')}
      accessibilityLabel={t('sheet.accessibilityLabel')}
      // the tab row rides `header`'s drag surface now — see
      // `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s doc
      // comment: a drag started anywhere on the tab row follows the
      // finger the same way one started on the handle already did, while
      // a tap still reaches `SegmentedTabs`' own `Pressable` untouched,
      // since only the handle races a tap against its own drag.
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
      testID={testID}
      style={style}
      {...props}
    >
      <View>
        {
          // both panes stay mounted for this sheet's whole lifetime,
          // switching only which one is visible — never a conditional
          // render that unmounts the inactive one: unmounting `CardsPane`
          // on every switch away from it reset its own `fanWidth`
          // (`../cards-pane/cards-pane.tsx`) to `null` on every switch
          // back, so its fan measured `0` tall for one frame and the
          // sheet's height (which follows its content) collapsed and
          // sprang back. keeping both mounted means each pane's layout
          // state is measured at most once, on its own true first reveal,
          // and never reset by a remount after that — whether that still
          // leaves a glitch on a pane's very first reveal has not been
          // confirmed on a real device.
          //
          // `display: 'none'` (`styles.hidden` below) on the inactive
          // pane, not an opacity or a positioning trick: it removes that
          // pane from layout entirely (so it contributes no height to
          // this sheet, and the panel still sizes to just the active
          // pane, per `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
          // content-follows-height behaviour), takes it out of touch
          // hit-testing, and drops it from the accessibility tree — the
          // same reason RNTL's own default, accessibility-aware queries
          // already treat a `display: 'none'` element as hidden (see
          // `./holding-input-sheet.test.tsx`'s assertions on this).
        }
        <HandRangePane
          selectedRankPairs={rankPairs}
          onSelectionChange={setRankPairs}
          testID="hand-range-pane"
          style={activeTab === 'handRange' ? undefined : styles.hidden}
        />
        <CardsPane
          slots={holeCards}
          onSlotsChange={setHoleCards}
          testID="cards-pane"
          style={activeTab === 'cards' ? undefined : styles.hidden}
        />
      </View>
    </BottomSheet>
  );
}

/** derived from the component's own argument type — per
 * docs/conventions/component-contracts.md's props-declaration rule — so
 * this stays a single source of truth rather than a hand-duplicated copy,
 * while keeping `HoldingInputSheetProps` importable exactly as before
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
