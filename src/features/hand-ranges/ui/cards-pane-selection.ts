import { cardsEqual, RANKS, type Card, type Suit } from '../model/card';

/**
 * the cards pane's own interaction rules, kept free of React and gestures
 * — `cards-pane.tsx` holds the state and renders it; this module decides
 * what a tap on a fan card, a drag's release, or a tap on a preview slot
 * does to that state. the same split `../../shared/ui/selection-grid/
 * selection-grid-paint.ts` draws for the rank-pair grid's own paint
 * gesture, for the same reason: these are the rules most likely to be got
 * subtly wrong and the least visible in a review of the gesture code
 * itself, so they earn a colocated test with no gesture, no render, and no
 * layout involved.
 */

/**
 * the two preview slots, index 0 and 1 — which physical slot a card lands
 * in has no game meaning (docs/specs/hand-ranges.md's card picker feeds a
 * player's two hole cards, unordered), so nothing here or in
 * `cards-pane.tsx` treats slot 0 as "first" in any sense beyond "the one
 * `selectCard` fills before slot 1 when both are empty."
 */
export type CardsPaneSlots = readonly [Card | null, Card | null];

export type CardsPaneState = {
  readonly slots: CardsPaneSlots;
  /**
   * the slot armed for overwrite by `tapSlot` below, or `null` when
   * neither is armed. armed is a single value, not a per-slot flag: only
   * one slot can be the target of "the next card chosen from the fan"
   * (docs/specs/hand-ranges.md, this run's own brief) at a time, so
   * arming one slot implicitly disarms the other with no extra rule
   * needed to say so.
   */
  readonly armedSlot: 0 | 1 | null;
};

export const EMPTY_CARDS_PANE_STATE: CardsPaneState = { slots: [null, null], armedSlot: null };

/**
 * the haptic event one of this module's own state transitions owes its
 * caller, per docs/conventions/haptics.md — `null` for a touch that
 * changed nothing, since "every touch gives feedback" does not extend to
 * a touch this module already treats as a no-op (a taken card, an empty
 * slot, or both slots full with neither armed). `dragTick`, the fan's own
 * per-crossing haptic during a drag, is not this module's to fire: that
 * event fires on every candidate change a drag makes before release,
 * which `cards-pane.tsx` tracks itself against `../ui/card-fan-geometry.ts`'s
 * `nearestSelectableCardIndex` — this module only ever decides the
 * touch's own *resolution* (a fill, an overwrite, an arm, or a clear),
 * each of which is a single, discrete state change with one haptic of its
 * own, never a stream of them.
 */
export type CardsPaneHaptic = 'toggleOn' | 'toggleOff' | 'selectionChange';

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
 * `../ui/card-fan-geometry.ts`'s `nearestSelectableCardIndex` already
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
 * into: whichever of the two docs/specs/hand-ranges.md itself is, the
 * rule is the same one — "the card under the finger" at the moment of
 * commit.
 *
 * 1. a card already in either slot is a no-op: `nearestSelectableCardIndex`
 *    already keeps a drag from resolving onto a taken card (its own
 *    `takenIndices` skip rule), and this guard gives a plain tap on the
 *    fan's own taken-styled card face the same outcome, which is what
 *    keeps "the two slots never hold the same card" true regardless of
 *    which gesture reached this function.
 * 2. armed (a filled slot was tapped first): the card replaces that
 *    slot's own card and disarms — "the next card chosen from the fan
 *    replaces that slot's card rather than filling the other one," this
 *    run's own brief, quoted here since it is this rule's whole
 *    justification.
 * 3. otherwise, an empty slot exists: the card fills the first one, index
 *    0 before index 1.
 * 4. otherwise (both slots full, nothing armed): a no-op — there is
 *    nothing for a plain fan tap to do once both slots already hold a
 *    card; overwriting needs `tapSlot` to arm one first.
 *
 * every reachable branch but the first fires `toggleOn` — filling an
 * empty slot and overwriting an armed one are both "a card became
 * selected," the same event `../../shared/ui/selection-grid/
 * selection-grid-paint.ts`'s own `beginPaint` fires for selecting a rank
 * pair, per docs/conventions/haptics.md's table.
 */
export function selectCard(state: CardsPaneState, card: Card): CardsPaneUpdate {
  if (isCardTaken(state, card)) {
    return { state, haptic: null };
  }

  if (state.armedSlot !== null) {
    const slots = replaceSlot(state.slots, state.armedSlot, card);
    return { state: { slots, armedSlot: null }, haptic: 'toggleOn' };
  }

  const emptyIndex = state.slots[0] === null ? 0 : state.slots[1] === null ? 1 : null;
  if (emptyIndex === null) {
    return { state, haptic: null };
  }

  const slots = replaceSlot(state.slots, emptyIndex, card);
  return { state: { slots, armedSlot: null }, haptic: 'toggleOn' };
}

/**
 * a tap on preview slot `slotIndex` — the picker's own second entry
 * point, distinct from `selectCard` above: this is a tap on a *slot*, not
 * on a fan card.
 *
 * 1. an empty slot has nothing to arm or clear — a no-op.
 * 2. tapping the already-armed slot again clears it, per this run's own
 *    brief ("Tap the armed slot again → clears that slot instead"),
 *    firing `toggleOff` — the same event a deselected hand-range cell
 *    fires, per docs/conventions/haptics.md's table.
 * 3. otherwise (a filled, unarmed slot — including the *other* slot while
 *    one is already armed) arms this slot, disarming whichever was armed
 *    before with no separate step: `CardsPaneState.armedSlot` is a single
 *    value, per that field's own doc comment. `selectionChange` is this
 *    touch's own haptic — arming a slot is a choice of *which* slot the
 *    next fan pick targets, the same shape as
 *    docs/conventions/haptics.md's own "picking a Settings radio
 *    option... including re-selecting the one already active" example:
 *    a choice among options, not a boolean flipping on or off (`toggleOn`/
 *    `toggleOff`) and not a bulk action of its own (`primaryAction`).
 */
export function tapSlot(state: CardsPaneState, slotIndex: 0 | 1): CardsPaneUpdate {
  if (state.slots[slotIndex] === null) {
    return { state, haptic: null };
  }

  if (state.armedSlot === slotIndex) {
    const slots = replaceSlot(state.slots, slotIndex, null);
    return { state: { slots, armedSlot: null }, haptic: 'toggleOff' };
  }

  return { state: { slots: state.slots, armedSlot: slotIndex }, haptic: 'selectionChange' };
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
