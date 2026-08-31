import type { Card } from '@/shared/model/card';

/**
 * the five community cards a Texas hold'em board holds — the flop's three,
 * the turn, and the river (docs/glossary.md's Board entry). fixed by the
 * game, not by any layout: `Board` (`../ui/board/board.tsx`) draws five
 * slots and the board input sheet picks into five because a board *is*
 * five, so both read this rather than each spelling out a `5`.
 */
export const BOARD_SLOT_COUNT = 5;

/**
 * a board as the input sheet holds it mid-edit: one entry per slot, in
 * dealing order, `null` for a slot with no card yet. always
 * `BOARD_SLOT_COUNT` long, and — while the picker's own left-packed fill
 * policy governs it (`@/shared/ui/cards-pane/selection.ts`'s
 * `SlotFillPolicy.LeftPacked`) — always a gap-free run from slot 0.
 */
export type BoardSlots = readonly (Card | null)[];

export const EMPTY_BOARD_SLOTS: BoardSlots = Array.from({ length: BOARD_SLOT_COUNT }, () => null);

/**
 * a board the sheet actually submitted: the cards it holds, in dealing
 * order, with no placeholder for a slot left empty. a length of 0, 3, 4,
 * or 5 — the only counts a hold'em board is ever legally at, which is what
 * `resolveBoardOutcome` below enforces — so a reader can tell a preflop
 * board from a flop, a turn, and a river by the length alone.
 */
export type Board = readonly Card[];

/**
 * the inverse of `resolveBoardOutcome`'s own filter: pads a submitted
 * `Board` back out to a `BoardSlots` row — `BOARD_SLOT_COUNT` long,
 * left-packed, `null` for every slot past what `board` actually holds.
 * `../ui/board/board.tsx` mounts its `PlayingCard`s against this, and
 * `../adapter/use-board-input.ts` seeds a reopened sheet's own picker state
 * from it — the same "pad a submitted value back into slot shape" role
 * `use-holding-input.ts`'s `deriveHoldingInputState` plays for a player's
 * holding.
 */
export function boardToSlots(board: Board): BoardSlots {
  return Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => board[index] ?? null);
}

/**
 * why the board input sheet closed without submitting. one member today,
 * declared as an enum rather than as a bare `onDismiss()` because the
 * sibling sheet's callers already read a reason of their own
 * (`HoldingDismissReason`), and adding a second reason later should not be
 * a breaking change for this one. docs/conventions/component-contracts.md
 * requires the enum only where the unsuccessful path has more than one
 * cause; this is above that bar deliberately, and the maintainer approved
 * it at the plan gate.
 */
export enum BoardDismissReason {
  IncompleteBoard = 'incomplete-board',
}

export type BoardInputState = {
  readonly slots: BoardSlots;
};

export type BoardOutcome =
  | { readonly kind: 'submit'; readonly board: Board }
  | { readonly kind: 'dismiss'; readonly reason: BoardDismissReason };

/**
 * the board input sheet's own close-time decision, total over every
 * reachable slot state — the same shape `resolveHoldingOutcome` already
 * has for the player sheet, and the one place the 0/3/4/5 rule lives:
 *
 * 1. no cards → submit an empty board. an empty board is a valid board —
 *    a preflop equity calculation runs against one — so backing out of the
 *    sheet without picking anything is a submitted board rather than a
 *    dismissal. this is the maintainer's own call, settled at the plan
 *    gate, and the one rule here a reader is most likely to expect the
 *    other way round.
 * 2. three, four, or five cards → submit a flop, a flop and turn, or a
 *    full board.
 * 3. one or two cards → dismiss `IncompleteBoard`. neither count is a
 *    street: a flop deals three cards at once, so a board can never
 *    legally stop at one or two, and there is nothing to submit.
 *
 * the picker's left-packed fill policy is what keeps the cards contiguous
 * and distinct; this function assumes neither. it reads the cards out in
 * slot order and counts them, so a hypothetical gapped state still
 * resolves to exactly one outcome rather than throwing — the same shape of
 * precondition `resolveHoldingOutcome` documents around `cardPair()`.
 */
export function resolveBoardOutcome(state: BoardInputState): BoardOutcome {
  const board: Board = state.slots.filter((slot): slot is Card => slot !== null);

  if (board.length === 1 || board.length === 2) {
    return { kind: 'dismiss', reason: BoardDismissReason.IncompleteBoard };
  }
  return { kind: 'submit', board };
}
