import { HapticEvent } from '@/core/haptics/haptics';
import { cardsEqual, RANKS, type Card, type Suit } from '@/shared/model/card';

/**
 * the cards pane's own interaction rules, kept free of React and gestures
 * — `cards-pane.tsx` holds the state and renders it; this module decides
 * what a tap on a fan card, a drag's release, or a tap on a preview slot
 * does to that state. the same split `../selection-grid/painting.ts`
 * draws for the rank-pair grid's paint gesture, for the same
 * reason: these are the rules most likely to be got subtly wrong and the
 * least visible in a review of the gesture code itself, so they earn a
 * colocated test with no gesture, no render, and no layout involved.
 *
 * every function here assumes the pane has at least one slot. nothing
 * guards that: a pane with no slots renders nothing and has no touch to
 * resolve, so a caller that reached one of these with an empty array has
 * already gone wrong somewhere a defensive branch here would only hide.
 */

/**
 * the pane's preview slots, in render order, left to right. the length is
 * the caller's — two for a player's hole cards, five for the board's
 * community cards — and every rule below reads it from the array rather
 * than assuming either.
 */
export type CardsPaneSlots = readonly (Card | null)[];

/**
 * which of two rule sets governs where a card may land, where focus goes
 * after a pick, and what clearing a slot does to the slots right of it.
 * the two are genuinely different rules rather than one rule with a
 * parameter, because the two surfaces they serve mean different things by
 * a slot:
 *
 * - `Independent` — a player's two hole cards. which physical slot a card
 *   sits in has no game meaning, so either slot takes a card on its own
 *   and a gap between them is meaningless rather than wrong.
 * - `LeftPacked` — the board's five community cards. position *is* the
 *   meaning: the first three are the flop, the fourth the turn, the fifth
 *   the river, so a card can only ever extend the run from the left and
 *   clearing one pulls the rest back to close the hole it left.
 */
export enum SlotFillPolicy {
  Independent = 'independent',
  LeftPacked = 'left-packed',
}

export type CardsPaneState = {
  readonly slots: CardsPaneSlots;
  /**
   * the slot the next card chosen from the fan lands in. exactly one slot
   * always has focus — there's no "nothing focused" state (see
   * [decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md](../../../../docs/decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md)
   * for why). focus is a single value, not a per-slot flag: only one slot
   * can be "where the next pick lands" at a time, so moving focus to one
   * slot implicitly moves it away from every other with no extra rule
   * needed.
   */
  readonly focusedSlot: number;
};

/** the two-slot pane's own empty state — a player's untouched hole cards. */
export const EMPTY_CARDS_PANE_STATE: CardsPaneState = { slots: [null, null], focusedSlot: 0 };

/**
 * the index of the leftmost empty slot, or the slot count when every slot
 * is full. under `SlotFillPolicy.LeftPacked` this is also the number of
 * cards held, since that policy admits no gaps — see `tapSlot` below for
 * the shift that keeps it true.
 */
function firstEmptySlot(slots: CardsPaneSlots): number {
  const index = slots.findIndex((slot) => slot === null);
  return index === -1 ? slots.length : index;
}

/**
 * the slot focus actually lands on when something asks for `slotIndex` —
 * a slot tap, or a caller seeding a fresh mount. always inside the pane's
 * own bounds, and under `SlotFillPolicy.LeftPacked` never past the first
 * empty slot, which is what makes a gap unreachable: focus is the only
 * slot a pick can land in, so bounding focus at the first empty slot
 * bounds every fill to "extend the run, or replace something already in
 * it".
 */
export function clampFocusedSlot(
  slots: CardsPaneSlots,
  policy: SlotFillPolicy,
  slotIndex: number,
): number {
  const bounded = Math.min(Math.max(slotIndex, 0), slots.length - 1);
  return policy === SlotFillPolicy.LeftPacked ? Math.min(bounded, firstEmptySlot(slots)) : bounded;
}

/**
 * the focus a fresh `CardsPane` mount starts with when its caller names no
 * slot of its own, derived from `slots` as given rather than hard-coded to
 * `0` — a bug-avoidance reading of the maintainer's own intent, not a
 * maintainer-confirmed rule (see
 * [decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md](../../../../docs/decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md)
 * for why hard-coding `0` would be wrong, and for the general case this
 * guards against). `cards-pane.tsx`'s `HoldingInputSheet` caller does not
 * key the pane per tab — it carries no `key` prop at all, and switches its
 * two panes with `display: none` instead, keeping both permanently
 * mounted, so a tab switch never produces a fresh mount there — but this
 * guards the general case regardless.
 */
export function initialFocusedSlot(slots: CardsPaneSlots, policy: SlotFillPolicy): number {
  const firstEmpty = firstEmptySlot(slots);
  return clampFocusedSlot(slots, policy, firstEmpty === slots.length ? 0 : firstEmpty);
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

/** true when `card` already sits in any slot. */
export function isCardTaken(state: CardsPaneState, card: Card): boolean {
  return state.slots.some((slot) => slot !== null && cardsEqual(slot, card));
}

/**
 * true when `card` is spoken for elsewhere — on the board, or in another
 * player's own exact holding (`../../../features/evaluations/model/
 * unavailable-cards.ts`, this module's own caller) — and therefore cannot
 * be picked in *this* pane at all, distinct from `isCardTaken` above:
 * `unavailableCards` is a plain, caller-supplied list, not this pane's own
 * `slots`.
 */
export function isCardUnavailable(unavailableCards: readonly Card[], card: Card): boolean {
  return unavailableCards.some((unavailableCard) => cardsEqual(unavailableCard, card));
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
 * `takenRankIndicesForSuit`'s own sibling for `unavailableCards` — the
 * indices `../cards-pane.tsx`'s `FanArc` folds into the same skip set it
 * already feeds `nearestSelectableCardIndex`
 * (`../card-fan-geometry.ts`), so a drag never resolves onto an
 * unavailable card either. Kept separate from `takenRankIndicesForSuit`,
 * not merged into one function taking both a state and a list, because
 * `taken` and `unavailable` stay two distinct *rendered* states — see
 * `../cards-pane.tsx`'s own `FanArc` for where the two sets are read
 * independently before being unioned for the gesture's own skip rule.
 */
export function unavailableRankIndicesForSuit(
  unavailableCards: readonly Card[],
  suit: Suit,
): ReadonlySet<number> {
  const indices = new Set<number>();
  for (const card of unavailableCards) {
    if (card.suit === suit) {
      indices.add(RANKS.indexOf(card.rank));
    }
  }
  return indices;
}

/**
 * the touch this module's caller resolves a fan tap, or a drag's release,
 * into: whichever of the two docs/specs/hand-ranges.md is, the rule is
 * the same one — "the card under the finger" at the moment of commit.
 *
 * 1. a card already in any slot, or a card `unavailableCards` names, is a
 *    no-op: `nearestSelectableCardIndex` already keeps a drag from
 *    resolving onto either (its own skip-indices argument, folded from
 *    `takenRankIndicesForSuit` and `unavailableRankIndicesForSuit`
 *    together — see `../cards-pane.tsx`'s `FanArc`), and this guard gives
 *    a plain tap on either card's own face the same outcome, which is
 *    what keeps "no two slots hold the same card" and "an unavailable
 *    card can never be picked" true regardless of which gesture reached
 *    this function.
 * 2. otherwise: the card replaces `focusedSlot`'s card, and focus
 *    advances — the maintainer's own explicit call (see
 *    [decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md](../../../../docs/decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md)).
 *    this is always actionable, whichever slot is focused and whether or
 *    not it already held a card.
 *
 * where focus advances *to* is the policy's own call — see
 * `focusAfterSelect` below.
 *
 * fires `toggleOn` in the one branch that changes anything — filling an
 * empty focused slot and overwriting a filled one are both "a card became
 * selected," the same event `../selection-grid/painting.ts`'s
 * `beginPaint` fires for selecting a rank pair, per
 * docs/conventions/haptics.md's table.
 */
export function selectCard(
  state: CardsPaneState,
  card: Card,
  policy: SlotFillPolicy,
  /** the cards this pane's own caller has ruled out of reach — defaults to
   * none, so a caller that never passes this prop keeps behaving as if no
   * card is unavailable, without having to pass an empty array of their
   * own. */
  unavailableCards: readonly Card[] = [],
): CardsPaneUpdate {
  if (isCardTaken(state, card) || isCardUnavailable(unavailableCards, card)) {
    return { state, haptic: null };
  }

  const slots = replaceSlot(state.slots, state.focusedSlot, card);
  return {
    state: { slots, focusedSlot: focusAfterSelect(slots, state.focusedSlot, policy) },
    haptic: HapticEvent.ToggleOn,
  };
}

/**
 * - `Independent` wraps around, which at two slots is exactly the "focus
 *   advances to the other slot" rule
 *   decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md
 *   settled; that policy has no third slot for the wrap to mean anything
 *   else at.
 * - `LeftPacked` steps one right and stops at the last slot, so a pick on
 *   the last slot replaces it rather than wrapping back to the first — a
 *   wrap there would send the next pick to the flop's first card, which
 *   is never what a player finishing a river card meant.
 *
 * the fill this ran after already left focus no further right than the
 * first empty slot under `LeftPacked`: filling slot `f` makes every slot
 * up to and including `f` full, so the new first empty slot is at least
 * `f + 1` — which is the most this can return.
 */
function focusAfterSelect(
  slots: CardsPaneSlots,
  focusedSlot: number,
  policy: SlotFillPolicy,
): number {
  return policy === SlotFillPolicy.LeftPacked
    ? Math.min(focusedSlot + 1, slots.length - 1)
    : (focusedSlot + 1) % slots.length;
}

/**
 * a tap on preview slot `slotIndex` — the picker's second entry point,
 * distinct from `selectCard` above: this is a tap on a *slot*, not on a
 * fan card.
 *
 * 1. tapping a slot that isn't the focused one moves focus there, leaving
 *    every slot's card untouched. this works whether that slot is empty or
 *    filled: focus is explicit and always movable, unlike the arm model's
 *    own arm, which only a filled slot could take. fires
 *    `selectionChange` — moving focus is a choice of *which* slot the next
 *    fan pick targets, the same shape as docs/conventions/haptics.md's
 *    "picking a Settings radio option... including re-selecting the one
 *    already active" example: a choice among options, not a boolean
 *    flipping on or off (`toggleOn`/`toggleOff`) and not a bulk action of
 *    its own (`primaryAction`).
 * 2. tapping the focused slot while it holds a card clears that card,
 *    firing `toggleOff` — the same event a deselected hand-range cell
 *    fires, per docs/conventions/haptics.md's table. where focus lands
 *    afterwards is the policy's own call, and the two differ:
 *
 *    - `Independent` leaves focus on the slot just cleared. nothing else
 *      moved, so that slot is now the empty one, and keeping focus there
 *      lets the user pick a replacement for the slot they just emptied
 *      without a second tap to refocus it. this is that policy's one
 *      asymmetry — choosing a card advances focus (see `selectCard`
 *      above), clearing doesn't.
 *    - `LeftPacked` moves focus to the first empty slot, which after the
 *      shift is where the shortened run now ends. it has to: the shift
 *      refills the cleared slot with whatever card was to its right, so
 *      keeping focus there would point the next pick at a card the user
 *      never asked to replace, destroying it with nothing on screen to
 *      say so. focus therefore follows the run's end, and the next pick
 *      extends it.
 * 3. tapping the focused slot while it's already empty has nothing to
 *    clear — a no-op.
 *
 * the tapped index is clamped before any of that (`clampFocusedSlot`), so
 * under `SlotFillPolicy.LeftPacked` a tap past the first empty slot
 * resolves to the first empty slot instead. a tap that clamps onto the
 * already-focused slot therefore falls into rule 2 or 3 rather than rule 1
 * — tapping the fifth slot of an empty board resolves to the first slot,
 * which already has focus and holds nothing, so nothing happens.
 */
export function tapSlot(
  state: CardsPaneState,
  slotIndex: number,
  policy: SlotFillPolicy,
): CardsPaneUpdate {
  const target = clampFocusedSlot(state.slots, policy, slotIndex);

  if (target !== state.focusedSlot) {
    return {
      state: { slots: state.slots, focusedSlot: target },
      haptic: HapticEvent.SelectionChange,
    };
  }

  if (state.slots[target] === null) {
    return { state, haptic: null };
  }

  if (policy === SlotFillPolicy.LeftPacked) {
    const slots = removeSlot(state.slots, target);
    return {
      // `removeSlot` always leaves at least the far-end slot empty, so
      // this is in bounds without a clamp of its own.
      state: { slots, focusedSlot: firstEmptySlot(slots) },
      haptic: HapticEvent.ToggleOff,
    };
  }

  const slots = replaceSlot(state.slots, target, null);
  return { state: { slots, focusedSlot: target }, haptic: HapticEvent.ToggleOff };
}

function replaceSlot(slots: CardsPaneSlots, index: number, card: Card | null): CardsPaneSlots {
  const next = [...slots];
  next[index] = card;
  return next;
}

/**
 * drops `index`'s card and pulls every card right of it one place left,
 * leaving an empty slot at the far end so the pane keeps its slot count.
 * this is the whole of what makes a gap unreachable on a clear, the way
 * `clampFocusedSlot` is the whole of what makes one unreachable on a fill.
 */
function removeSlot(slots: CardsPaneSlots, index: number): CardsPaneSlots {
  const next: (Card | null)[] = slots.filter((_, slotIndex) => slotIndex !== index);
  next.push(null);
  return next;
}
