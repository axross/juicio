import { HapticEvent } from '@/core/haptics/haptics';

import { cardsEqual, RANKS, type Card, type Suit } from '../../model/card';

/**
 * the cards pane's own interaction rules, kept free of React and gestures
 * — `cards-pane.tsx` holds the state and renders it; this module decides
 * what a tap on a fan card, a drag's release, or a tap on a preview slot
 * does to that state. the same split `../../shared/ui/selection-grid/
 * painting.ts` draws for the rank-pair grid's paint gesture, for the same
 * reason: these are the rules most likely to be got subtly wrong and the
 * least visible in a review of the gesture code itself, so they earn a
 * colocated test with no gesture, no render, and no layout involved.
 */

/**
 * the two preview slots, index 0 and 1 — which physical slot a card lands
 * in has no game meaning (docs/specs/hand-ranges.md's card picker feeds a
 * player's two hole cards, unordered), so nothing here or in
 * `cards-pane.tsx` treats slot 0 as "first" beyond "the one
 * `EMPTY_CARDS_PANE_STATE` starts focus on."
 */
export type CardsPaneSlots = readonly [Card | null, Card | null];

export type CardsPaneState = {
  readonly slots: CardsPaneSlots;
  /**
   * the slot the next card chosen from the fan lands in. one of the two
   * slots always has focus — there's no "nothing focused" state, unlike
   * this pane's earlier arm-for-overwrite model, whose `armedSlot: null`
   * state left both a plain fan tap and a slot tap with nothing to do once
   * both slots were full and neither was armed. focus is a single value,
   * not a per-slot flag, for the same reason arming was: only one slot can
   * be "where the next pick lands" at a time, so moving focus to one slot
   * implicitly moves it away from the other with no extra rule needed.
   */
  readonly focusedSlot: 0 | 1;
};

export const EMPTY_CARDS_PANE_STATE: CardsPaneState = { slots: [null, null], focusedSlot: 0 };

/**
 * the focus a fresh `CardsPane` mount starts with, derived from `slots` as
 * given rather than hard-coded to `0` — **this implementation's own
 * reading**, not something the maintainer's focus-model brief stated: the
 * brief settled what focus does once the pane is already mounted (a pick
 * advances it, a clear doesn't), not what it starts as. hard-coding `0`
 * regardless of `slots` would silently overwrite an already-picked card
 * the moment the pane remounts with one slot pre-filled — switching to the
 * `Hand Range` tab and back remounts `CardsPane` (`cards-pane.tsx`'s
 * `HoldingInputSheet` caller keys it per tab), so a user who had picked
 * one card, switched tabs, and switched back would have their next pick
 * land on the slot they already filled rather than the empty one —
 * silently, since nothing signals that a "second pick" just overwrote a
 * "first pick" rather than completing it.
 *
 * the same first-empty-slot-else-0 rule `selectCard` used before this
 * pane had a focus model at all: slot 0 empty → focus 0; slot 0 filled,
 * slot 1 empty → focus 1; both filled (or both empty) → focus 0.
 */
export function initialFocusedSlot(slots: CardsPaneSlots): 0 | 1 {
  if (slots[0] === null) {
    return 0;
  }
  return slots[1] === null ? 1 : 0;
}

/**
 * the haptic event one of this module's state transitions owes its
 * caller, per docs/conventions/haptics.md — `null` for a touch that
 * changed nothing, since "every touch gives feedback" doesn't extend to a
 * touch this module already treats as a no-op (a taken card, or a tap on
 * the focused slot while it's already empty). `dragTick`, the fan's own
 * per-crossing haptic during a drag, isn't this module's to fire: that
 * event fires on every candidate change a drag makes before release,
 * which `cards-pane.tsx` tracks itself against `../card-fan-geometry.ts`'s
 * `nearestSelectableCardIndex` — this module only decides the touch's own
 * *resolution* (a pick, a focus move, or a clear), each a single, discrete
 * state change with one haptic of its own, never a stream of them.
 */
export type CardsPaneHaptic =
  HapticEvent.ToggleOn | HapticEvent.ToggleOff | HapticEvent.SelectionChange;

export type CardsPaneUpdate = {
  readonly state: CardsPaneState;
  readonly haptic: CardsPaneHaptic | null;
};

/** true when `card` already sits in either slot. */
export function isCardTaken(state: CardsPaneState, card: Card): boolean {
  return state.slots.some((slot) => slot !== null && cardsEqual(slot, card));
}

/**
 * the rank indices, within one suit's own thirteen-card arc, that arc's
 * own fan must skip — the `takenIndices` argument
 * `../card-fan-geometry.ts`'s `nearestSelectableCardIndex` already
 * takes. only a slot whose card shares `suit` contributes an index here:
 * a card taken in the *other* three suits' own arcs never touches this
 * one.
 */
export function takenRankIndicesForSuit(state: CardsPaneState, suit: Suit): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const slot of state.slots) {
    if (slot !== null && slot.suit === suit) {
      indices.add(RANKS.indexOf(slot.rank));
    }
  }
  return indices;
}

/**
 * the touch this module's caller resolves a fan tap, or a drag's release,
 * into: whichever of the two docs/specs/hand-ranges.md is, the rule is
 * the same one — "the card under the finger" at the moment of commit.
 *
 * 1. a card already in either slot is a no-op: `nearestSelectableCardIndex`
 *    already keeps a drag from resolving onto a taken card (its own
 *    `takenIndices` skip rule), and this guard gives a plain tap on the
 *    fan's taken-styled card face the same outcome, which is what keeps
 *    "the two slots never hold the same card" true regardless of which
 *    gesture reached this function.
 * 2. otherwise: the card replaces `focusedSlot`'s card, and focus advances
 *    to the other slot — the maintainer's own explicit call: "choosing a
 *    card from the fan replaces the focused slot's card, and focus then
 *    advances to the other slot." this is always actionable, whichever
 *    slot is focused and whether or not it already held a card, closing
 *    the dead state the arm model had: with both slots full, a plain fan
 *    tap used to do nothing unless a slot had separately been armed
 *    first; here it always replaces whichever slot is focused.
 *
 * fires `toggleOn` in the one branch that changes anything — filling an
 * empty focused slot and overwriting a filled one are both "a card became
 * selected," the same event `../../shared/ui/selection-grid/painting.ts`'s
 * `beginPaint` fires for selecting a rank pair, per
 * docs/conventions/haptics.md's table.
 */
export function selectCard(state: CardsPaneState, card: Card): CardsPaneUpdate {
  if (isCardTaken(state, card)) {
    return { state, haptic: null };
  }

  const slots = replaceSlot(state.slots, state.focusedSlot, card);
  const otherSlot: 0 | 1 = state.focusedSlot === 0 ? 1 : 0;
  return { state: { slots, focusedSlot: otherSlot }, haptic: HapticEvent.ToggleOn };
}

/**
 * a tap on preview slot `slotIndex` — the picker's second entry point,
 * distinct from `selectCard` above: this is a tap on a *slot*, not on a
 * fan card.
 *
 * 1. tapping the *other* slot — the one that doesn't already have focus —
 *    moves focus there, leaving both slots' cards untouched. this works
 *    whether that slot is empty or filled: focus is explicit and always
 *    movable, unlike the arm model's own arm, which only a filled slot
 *    could take. fires `selectionChange` — moving focus is a choice of
 *    *which* slot the next fan pick targets, the same shape as
 *    docs/conventions/haptics.md's "picking a Settings radio option...
 *    including re-selecting the one already active" example: a choice
 *    among options, not a boolean flipping on or off (`toggleOn`/
 *    `toggleOff`) and not a bulk action of its own (`primaryAction`).
 * 2. tapping the *focused* slot while it holds a card clears that card,
 *    firing `toggleOff` — the same event a deselected hand-range cell
 *    fires, per docs/conventions/haptics.md's table. focus deliberately
 *    stays on the slot just cleared, rather than moving anywhere: this is
 *    the one asymmetry in the model — choosing a card advances focus (see
 *    `selectCard` above), clearing doesn't — so the user can immediately
 *    pick a replacement for the slot they just emptied without a second
 *    tap to refocus it.
 * 3. tapping the focused slot while it's already empty has nothing to
 *    clear — a no-op.
 */
export function tapSlot(state: CardsPaneState, slotIndex: 0 | 1): CardsPaneUpdate {
  if (slotIndex !== state.focusedSlot) {
    return {
      state: { slots: state.slots, focusedSlot: slotIndex },
      haptic: HapticEvent.SelectionChange,
    };
  }

  if (state.slots[slotIndex] === null) {
    return { state, haptic: null };
  }

  const slots = replaceSlot(state.slots, slotIndex, null);
  return { state: { slots, focusedSlot: slotIndex }, haptic: HapticEvent.ToggleOff };
}

function replaceSlot(
  slots: CardsPaneSlots,
  index: 0 | 1,
  card: Card | null,
): readonly [Card | null, Card | null] {
  const next: [Card | null, Card | null] = [slots[0], slots[1]];
  next[index] = card;
  return next;
}
