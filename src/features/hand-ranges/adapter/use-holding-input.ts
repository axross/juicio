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
  /** every tab `activeTab` has held at least once during this open — the
   * tab the sheet opened on, plus any other tab `setActiveTab` has since
   * been called with. Never shrinks while the sheet stays open, and
   * resets to just the freshly seeded tab on every reopen, the same
   * render-phase transition that reseeds `activeTab`/`holeCards`/
   * `rankPairs` below — see this hook's own doc comment for why a reopen
   * needs that. `HoldingInputSheet` reads this to decide whether a tab's
   * pane exists in the tree at all yet, never merely whether it is the
   * *active* one — that is what keeps the sheet from building the tab the
   * user is not looking at until they actually select it. */
  builtTabs: ReadonlySet<HoldingInputState['activeTab']>;
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
 * `useEffect`** — the same pattern `../../evaluations/adapter/
 * use-board-input.ts` uses for its own sibling reset. see
 * docs/decisions/2026-09-05-use-render-phase-state-not-useeffect-for-holding-sheet-reopen-reseed.md
 * for the React commit-ordering reason a future change to this hook must
 * keep in mind.
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

  // `builtTabs`'s own doc comment (above, on the return type) says what
  // this tracks and why; the seed matches `activeTab`'s own lazy
  // initializer above, so the tab this sheet opens on is already marked
  // built on the very first render.
  const [builtTabs, setBuiltTabs] = useState<ReadonlySet<HoldingInputState['activeTab']>>(
    () => new Set([deriveHoldingInputState(initialHolding).activeTab]),
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
      // discards whatever the previous session built — a fresh open shows
      // only the tab it opens on, per `builtTabs`'s own doc comment, never
      // a tab a *previous* session happened to have already selected.
      setBuiltTabs(new Set([seeded.activeTab]));
    }
  }

  // a second, independent render-phase adjustment (the pattern this hook's
  // own doc comment already cites supports more than one): whenever
  // `activeTab` takes on a value `builtTabs` doesn't have yet — an ordinary
  // in-session tab switch, or the reopen transition above having just
  // reseeded it — that tab joins `builtTabs` too, in the same render pass
  // rather than a commit later, so the newly built pane appears in the same
  // frame as the tab switch itself. Compared against its own tracked
  // previous value, not the reopen block's `wasVisible`, since an ordinary
  // tab switch carries no visibility transition for that block to catch.
  const [lastSeenActiveTab, setLastSeenActiveTab] = useState(activeTab);
  if (activeTab !== lastSeenActiveTab) {
    setLastSeenActiveTab(activeTab);
    setBuiltTabs((tabs) => (tabs.has(activeTab) ? tabs : new Set(tabs).add(activeTab)));
  }

  return {
    activeTab,
    setActiveTab,
    builtTabs,
    holeCards,
    setHoleCards,
    rankPairs,
    setRankPairs,
  };
}
