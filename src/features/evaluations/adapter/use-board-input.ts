import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { EMPTY_BOARD_SLOTS, type BoardSlots } from '../model/board';

/**
 * the board input sheet's own slot state (`../ui/board-input-sheet/`),
 * cleared every time the sheet opens — `@/shared/ui/bottom-sheet/` stays
 * mounted across `visible` toggling (see its own doc comment), so without
 * this a sheet reopened after a first edit would still show the first
 * edit's leftover cards.
 *
 * **the reset is a render-phase state adjustment, not a `useEffect`** —
 * React's own supported pattern for adjusting state when a prop changes
 * ("Adjusting some state when a prop changes",
 * https://react.dev/learn/you-might-not-need-an-effect), the same shape
 * `@/shared/ui/cards-pane/cards-pane.tsx`'s `FanCard` already uses. The
 * sibling hook `@/features/hand-ranges/adapter/use-holding-input.ts`
 * re-seeds from an effect instead, and that ordering does not work here:
 * an effect runs after the commit, so `CardsPane` would already have
 * mounted underneath the stale slots and read its own initial focus off
 * them. On the board that is not cosmetic — focus is clamped to the first
 * empty slot, so focus derived from a stale three-card board would sit at
 * slot 3 over a board this hook is about to empty, and the next pick would
 * land there, leaving slots 0 to 2 empty behind it: exactly the gap the
 * left-packed policy exists to make unreachable. Adjusting during render
 * re-runs this component before React renders any child or commits
 * anything, so no child ever observes the stale value.
 */
export function useBoardInput(
  visible: boolean,
): readonly [BoardSlots, Dispatch<SetStateAction<BoardSlots>>] {
  const [slots, setSlots] = useState<BoardSlots>(EMPTY_BOARD_SLOTS);
  const [wasVisible, setWasVisible] = useState(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSlots(EMPTY_BOARD_SLOTS);
    }
  }

  return [slots, setSlots];
}
