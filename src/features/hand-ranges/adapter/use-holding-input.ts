import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { Holding, HoldingInputState } from '../model/holding';
import { useHandRangeSelection } from './use-hand-range-selection';
import { useHoleCardsSelection } from './use-hole-cards-selection';

const EMPTY_HOLE_CARDS: HoldingInputState['holeCards'] = [null, null];

/**
 * derives the sheet's own seed state from `initialHolding` — read only at
 * the moment `visible` flips from `false` to `true` (see this hook's own
 * render-phase check below), never on every render, so switching
 * `initialHolding` to a fresh object literal mid-session never discards
 * whatever the player had just entered. no `initialHolding` at all
 * defaults to the `Cards` tab, matching the tab order
 * docs/specs/hand-ranges.md itself draws the two tabs in.
 */
function deriveHoldingInputState(holding: Holding | undefined): HoldingInputState {
  if (holding?.kind === 'holeCards') {
    return {
      activeTab: 'cards',
      holeCards: [holding.holeCards.first, holding.holeCards.second],
      rankPairs: new Set(),
    };
  }
  if (holding?.kind === 'handRange') {
    return { activeTab: 'handRange', holeCards: EMPTY_HOLE_CARDS, rankPairs: holding.rankPairs };
  }
  return { activeTab: 'cards', holeCards: EMPTY_HOLE_CARDS, rankPairs: new Set() };
}

export type UseHoldingInputResult = {
  activeTab: HoldingInputState['activeTab'];
  setActiveTab: Dispatch<SetStateAction<HoldingInputState['activeTab']>>;
  holeCards: HoldingInputState['holeCards'];
  setHoleCards: Dispatch<SetStateAction<HoldingInputState['holeCards']>>;
  rankPairs: HoldingInputState['rankPairs'];
  setRankPairs: Dispatch<SetStateAction<HoldingInputState['rankPairs']>>;
};

/**
 * the composing hook for the card/range input sheet's whole holding
 * input — built on the two leaf hooks (`./use-hand-range-selection.ts`,
 * `./use-hole-cards-selection.ts`). `HoldingInputSheet`
 * (`../ui/holding-input-sheet/`) consumes this hook alone now rather than
 * three separate `useState` calls and their own re-seed effect.
 *
 * **`activeTab` is managed directly here, not as a third leaf hook.**
 * unlike a hand range's rank-pair selection or a hole-card pair — both
 * name a piece of state meaningful, and reusable, on their own (a future
 * preset editor could reuse either independently of this sheet) —
 * `activeTab` has no meaning outside this composed holding-input flow: it
 * is this sheet's own two-tab UI mode, not a hand-ranges domain concept a
 * second, unrelated screen would ever reuse in isolation. giving it a leaf
 * hook of its own would manufacture a reusability seam nothing calls for.
 *
 * **the re-seed on reopen is a render-phase state adjustment, not a
 * `useEffect`** — React's own supported pattern for adjusting state when a
 * prop changes ("Adjusting some state when a prop changes",
 * https://react.dev/learn/you-might-not-need-an-effect), the same shape
 * `../../evaluations/adapter/use-board-input.ts` already uses for its own
 * sibling reset. An effect does not work here, and this hook's own history
 * is exactly why: `@/shared/ui/bottom-sheet/bottom-sheet.tsx` stays
 * mounted across `visible` toggling, but the portalled subtree it renders
 * through (`@/shared/ui/portal/portal.tsx`'s `usePortal`, called from a
 * `useLayoutEffect`) genuinely unmounts and remounts — and React flushes a
 * child's layout effect before its parent's passive effect, so
 * `usePortal`'s remount, nested inside `BottomSheet`, a descendant of
 * whatever renders this hook, would already be committed by the time a
 * `useEffect` here got to run. `@/shared/ui/cards-pane/cards-pane.tsx`
 * derives its own `focusedSlot` once, in a lazy `useState` initializer, on
 * that exact mount — so an effect-based re-seed lands one commit too late:
 * the freshly mounted pane would already have read its initial focus off
 * the closed sheet's leftover `holeCards`, before the reset it never saw
 * emptied them. Adjusting during render instead re-runs this hook's whole
 * function body with the seeded values before React renders any child or
 * commits anything, so `HoldingInputSheet` builds its
 * `<CardsPane slots={holeCards} …>` element from the seeded pair, and the
 * pane's lazy initializer never reads anything but that pair. Under this
 * sheet's `Independent` fill policy the old ordering only ever cost a
 * cosmetic misplaced focus ring, corrected by the very next pick — see
 * `useBoardInput`'s own doc comment for why its `LeftPacked` policy has no
 * such tolerance, which is why that hook was written this way first.
 */
export function useHoldingInput(visible: boolean, initialHolding?: Holding): UseHoldingInputResult {
  const [activeTab, setActiveTab] = useState<HoldingInputState['activeTab']>(
    () => deriveHoldingInputState(initialHolding).activeTab,
  );
  const [holeCards, setHoleCards] = useHoleCardsSelection(
    deriveHoldingInputState(initialHolding).holeCards,
  );
  const [rankPairs, setRankPairs] = useHandRangeSelection(
    deriveHoldingInputState(initialHolding).rankPairs,
  );

  // see this hook's doc comment above for why this re-seeds on every
  // hidden-to-visible transition as a render-phase adjustment rather than
  // in an effect.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const seeded = deriveHoldingInputState(initialHolding);
      setActiveTab(seeded.activeTab);
      setHoleCards(seeded.holeCards);
      setRankPairs(seeded.rankPairs);
    }
  }

  return { activeTab, setActiveTab, holeCards, setHoleCards, rankPairs, setRankPairs };
}
