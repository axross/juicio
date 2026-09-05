import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { boardToSlots, EMPTY_BOARD_SLOTS, type Board, type BoardSlots } from '../model/board';

/**
 * derives this hook's own seed slots from `initialBoard` — read only at the
 * moment `visible` flips from `false` to `true` (see this hook's own
 * render-phase check below), never on every render, so switching
 * `initialBoard` to a fresh array literal mid-session never discards
 * whatever the user had just picked. no `initialBoard` at all seeds five
 * empty slots — `EMPTY_BOARD_SLOTS` itself, not `boardToSlots([])`, so a
 * caller that never passes this prop keeps a stable reference across
 * renders. the same "seed from an
 * optional initial value on the visible transition" shape
 * `../../hand-ranges/adapter/use-holding-input.ts`'s
 * `deriveHoldingInputState` already gives the sibling sheet.
 */
function deriveBoardSlots(initialBoard: Board | undefined): BoardSlots {
  return initialBoard === undefined ? EMPTY_BOARD_SLOTS : boardToSlots(initialBoard);
}

/**
 * the board input sheet's own slot state (`../ui/board-input-sheet/`),
 * seeded from `initialBoard` every time the sheet opens — `@/shared/ui/
 * bottom-sheet/` stays mounted across `visible` toggling (see its own doc
 * comment), so without this a sheet reopened after a first edit would still
 * show the first edit's leftover cards rather than the board's own current
 * cards.
 *
 * **the reset is a render-phase state adjustment, not a `useEffect`** —
 * React's own supported pattern for adjusting state when a prop changes
 * ("Adjusting some state when a prop changes",
 * https://react.dev/learn/you-might-not-need-an-effect), the same shape
 * `@/shared/ui/cards-pane/cards-pane.tsx`'s `FanCard` and the sibling hook
 * `../../hand-ranges/adapter/use-holding-input.ts` both already use. An
 * effect does not work here: it runs after the commit, so `CardsPane`
 * would already have mounted underneath the stale slots and read its own
 * initial focus off them before the reset landed. On the board that is
 * not cosmetic the way it is for the sibling hook's own `Independent`
 * fill policy — focus is clamped to the first empty slot here, so focus
 * derived from a stale three-card board would sit at slot 3 over a board
 * this hook is about to empty, and the next pick would land there,
 * leaving slots 0 to 2 empty behind it: exactly the gap the left-packed
 * policy exists to make unreachable. Adjusting during render instead
 * re-runs this hook before React renders any child or commits anything,
 * so no child ever observes the stale value.
 */
export function useBoardInput(
  visible: boolean,
  initialBoard?: Board,
): readonly [BoardSlots, Dispatch<SetStateAction<BoardSlots>>] {
  const [slots, setSlots] = useState<BoardSlots>(() => deriveBoardSlots(initialBoard));
  const [wasVisible, setWasVisible] = useState(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSlots(deriveBoardSlots(initialBoard));
    }
  }

  return [slots, setSlots];
}
