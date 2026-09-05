import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { HoldingInputState } from '../model/holding';

/**
 * a hole-card pair — read off `HoldingInputState['holeCards']`
 * (`../model/holding.ts`) rather than imported from `ui/`, so this
 * adapter-layer hook depends on the model layer only, per
 * docs/conventions/directory-structure.md's import direction: `ui/` reads
 * from `adapter/`, not the other way around.
 *
 * this is a fixed pair, `readonly [Card | null, Card | null]`, and is
 * *not* the same type as `CardsPaneSlots` in
 * `../../../shared/ui/cards-pane/selection.ts`, which is a row of any
 * length serving the board's five slots too. the pair still assigns to
 * it, so `<CardsPane slots={...} />` needs no cast — but not the other way
 * round, which is why `HoldingInputSheet` narrows the row the pane reports
 * back before storing it here. the local name is kept for this file's own
 * readers rather than to claim the two are one type.
 */
type CardsPaneSlots = HoldingInputState['holeCards'];

const EMPTY_SLOTS: CardsPaneSlots = [null, null];

/**
 * dedicated state-management hook for the two hole-card preview slots —
 * `HandRangePane`'s sibling leaf hook (see
 * `./use-hand-range-selection.ts`'s doc comment for the shared reasoning):
 * takes the `defaultValue` the caller starts from and hands back the
 * current pair and its setter, exactly `useState`'s shape, so this state
 * is reusable across whatever screen wants a hole-card selection of its
 * own, independent of any other caller's instance.
 *
 * this hook owns only `slots` — the pair itself — never which slot is
 * focused. `focusedSlot` stays exactly where it already was, as
 * `CardsPane`'s own local state (`../../../shared/ui/cards-pane/selection.ts`'s
 * `initialFocusedSlot`, read as a lazy initializer on that component's own
 * mount): focus is transient UI state scoped to one mounted `CardsPane`
 * instance, not part of the value this hook's caller controls, and
 * lifting it up here would duplicate `initialFocusedSlot`'s derivation
 * rather than reuse it.
 */
export function useHoleCardsSelection(
  defaultValue: CardsPaneSlots = EMPTY_SLOTS,
): readonly [CardsPaneSlots, Dispatch<SetStateAction<CardsPaneSlots>>] {
  return useState<CardsPaneSlots>(defaultValue);
}
