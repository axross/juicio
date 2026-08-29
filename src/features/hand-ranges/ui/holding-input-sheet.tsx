import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { BottomSheet } from '@/shared/ui/bottom-sheet/bottom-sheet';
import { SegmentedTabs, type SegmentedTabsItem } from '@/shared/ui/segmented-tabs/segmented-tabs';

import {
  resolveHoldingOutcome,
  type Holding,
  type HoldingDismissReason,
  type HoldingInputState,
} from '../model/holding';
import type { RankPairKey } from '../model/rank-pair';
import { CardsPane, type CardsPaneSlots } from './cards-pane';
import { HandRangePane } from './hand-range-pane';

export type HoldingInputSheetProps = {
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
};

type ActiveTab = 'handRange' | 'cards';

const EMPTY_HOLE_CARDS: CardsPaneSlots = [null, null];

function inputStateFromHolding(holding: Holding | undefined): HoldingInputState {
  if (holding?.kind === 'holeCards') {
    return {
      activeTab: 'cards',
      holeCards: [holding.holeCards.first, holding.holeCards.second],
      rankPairs: new Set(),
    };
  }
  if (holding?.kind === 'handRange') {
    return {
      activeTab: 'handRange',
      holeCards: EMPTY_HOLE_CARDS,
      rankPairs: holding.rankPairs,
    };
  }
  // no `initialHolding` at all: the `Hand Range` tab is this sheet's own
  // default, matching the tab order docs/specs/hand-ranges.md itself
  // draws the two tabs in.
  return { activeTab: 'handRange', holeCards: EMPTY_HOLE_CARDS, rankPairs: new Set() };
}

// the four landmark gaps docs/specs/hand-ranges.md's card/range input
// sheet draws uniformly 40 apart: handle row to tab row (already
// `../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s own `CONTENT_GAP`,
// applied to every one of its children including this sheet's own root
// below), tab row to slots-or-chips (this file's own `styles.paneWrapper`),
// slots to fan (`./cards-pane.tsx`'s own `SLOTS_TO_FAN_GAP`), and chips to
// grid (`./hand-range-pane.tsx`'s own `CHIP_ROW_TO_GRID_GAP`). not one of
// `theme.space`'s own steps (`x32`, `x48`), so each file names its own
// local constant rather than sharing one — the same "duplicate the one-off
// measured pixel value, do not centralise it" shape this project's other
// fixed dimensions already take (`bottom-sheet.tsx`'s `CONTENT_GAP` and
// `segmented-tabs.tsx`'s `TRACK_PADDING`, for two).
const LANDMARK_GAP = 40;

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
 * is what reads *only* the active tab's own side at close time; this
 * component owns collecting the two tabs' state, not deciding which one
 * counts.
 *
 * **exactly one of `onSubmit`/`onDismiss` fires per close, exactly
 * once** — docs/conventions/component-contracts.md's central rule.
 * `BottomSheet`'s own `onRequestClose` already fires exactly once per
 * committed dismissal (a tap on the handle, a drag past its threshold, or
 * a backdrop tap — this component adds no further way to close the
 * sheet, since docs/specs/hand-ranges.md draws no separate confirm
 * button of its own);
 * `handleRequestClose` below turns that one call into exactly one call to
 * `resolveHoldingOutcome`, which returns exactly one of a `submit` or a
 * `dismiss` outcome, which this component forwards to exactly one of its
 * own two callbacks. Neither callback is this component's to decide when
 * to call outside that one path.
 */
export function HoldingInputSheet({
  visible,
  initialHolding,
  onSubmit,
  onDismiss,
  testID,
}: HoldingInputSheetProps) {
  const { t } = useTranslation('handRanges');

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => inputStateFromHolding(initialHolding).activeTab,
  );
  const [holeCards, setHoleCards] = useState<CardsPaneSlots>(
    () => inputStateFromHolding(initialHolding).holeCards,
  );
  const [rankPairs, setRankPairs] = useState<ReadonlySet<RankPairKey>>(
    () => inputStateFromHolding(initialHolding).rankPairs,
  );

  // re-seeds every field above from `initialHolding` on each transition
  // from hidden to visible — `../../../shared/ui/bottom-sheet/
  // bottom-sheet.tsx` itself stays mounted across `visible` toggling (see
  // its own doc comment), so without this a sheet reopened for a second
  // player would still show the first player's leftover selection. an
  // effect, not a read during render: this project's own lint rule
  // (`react-hooks/refs`) forbids reading a ref's `.current` during
  // render, the same rule `bottom-sheet.tsx`'s own matching
  // hidden-to-visible effect (its `wasVisible` ref, resetting
  // `translateY`) is already written to satisfy.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const seeded = inputStateFromHolding(initialHolding);
      setActiveTab(seeded.activeTab);
      setHoleCards(seeded.holeCards);
      setRankPairs(seeded.rankPairs);
    }
    wasVisible.current = visible;
    // `initialHolding` is read only at the moment `visible` flips from
    // false to true, above — including it here would re-seed on every
    // render where the caller passes a fresh object literal, discarding
    // whatever the player had just entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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

  // `SegmentedTabs` requires a `testID`, unlike every other component this
  // sheet composes — falls back to a fixed id so a caller that omits its
  // own `testID` still gets one, rather than this sheet forcing every
  // caller to supply one just to satisfy that one child.
  const baseTestID = testID ?? 'holding-input-sheet';

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={handleRequestClose}
      handleAccessibilityLabel={t('handle.accessibilityLabel')}
      testID={testID}
    >
      <View style={styles.root}>
        <SegmentedTabs
          items={tabs}
          selectedKey={activeTab}
          // `SegmentedTabs` itself already fires `selectionChange` on
          // every press (see that component's own doc comment) — this
          // run's own brief's "a tab switch fires selectionChange" is
          // already satisfied there; firing it again here would double
          // it.
          onSelectionChange={(key) => setActiveTab(key as ActiveTab)}
          testID={`${baseTestID}-tabs`}
        />
        {activeTab === 'handRange' ? (
          <HandRangePane
            selectedRankPairs={rankPairs}
            onSelectionChange={setRankPairs}
            testID={`${baseTestID}-hand-range-pane`}
          />
        ) : (
          <CardsPane
            slots={holeCards}
            onSlotsChange={setHoleCards}
            testID={`${baseTestID}-cards-pane`}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create(() => ({
  // the sheet's own root, holding the tab row and whichever pane is
  // active — `gap` gives every direct child the same 40 landmark spacing
  // (`LANDMARK_GAP`) regardless of which pane is showing.
  root: {
    gap: LANDMARK_GAP,
  },
}));
