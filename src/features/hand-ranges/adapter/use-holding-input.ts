import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { Holding, HoldingInputState } from '../model/holding';
import { useHandRangeSelection } from './use-hand-range-selection';
import { useHoleCardsSelection } from './use-hole-cards-selection';

const EMPTY_HOLE_CARDS: HoldingInputState['holeCards'] = [null, null];

/**
 * derives the sheet's own seed state from `initialHolding` — read only at
 * the moment `visible` flips from `false` to `true` (see this hook's own
 * effect below), never on every render, so switching `initialHolding` to a
 * fresh object literal mid-session never discards whatever the player had
 * just entered. no `initialHolding` at all defaults to the `Hand Range`
 * tab, matching the tab order docs/specs/hand-ranges.md itself draws the
 * two tabs in.
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
  return { activeTab: 'handRange', holeCards: EMPTY_HOLE_CARDS, rankPairs: new Set() };
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
 * the re-seed-on-reopen effect — re-deriving all three fields from
 * `initialHolding` every time `visible` transitions from `false` to
 * `true` — moves here unchanged from `HoldingInputSheet`'s previous
 * `useEffect`: `../../../shared/ui/bottom-sheet/bottom-sheet.tsx` stays
 * mounted across `visible` toggling (see its own doc comment), so without
 * this a sheet reopened for a second player would still show the first
 * player's leftover selection.
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
  // hidden-to-visible transition rather than on every render — the
  // `eslint-disable` below is the same `react-hooks/exhaustive-deps`
  // suppression `bottom-sheet.tsx`'s matching effect carries, for the same
  // reason: `initialHolding` is read only at the moment `visible` flips,
  // not on every render where the caller passes a fresh object literal.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const seeded = deriveHoldingInputState(initialHolding);
      setActiveTab(seeded.activeTab);
      setHoleCards(seeded.holeCards);
      setRankPairs(seeded.rankPairs);
    }
    wasVisible.current = visible;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return { activeTab, setActiveTab, holeCards, setHoleCards, rankPairs, setRankPairs };
}
