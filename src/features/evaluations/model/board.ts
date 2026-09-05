import { cardsEqual, type Card } from '@/shared/model/card';

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
 * true when `a` and `b` hold the same cards in the same dealing order — a
 * board is ordered (flop, turn, river), so this is a positional comparison,
 * not a set one. what a resubmission-guarding caller (`../adapter/
 * use-board.ts`'s `setBoard`) reaches for to tell a genuine edit from a
 * reopen-and-close-unchanged of the board input sheet.
 */
export function boardsEqual(a: Board, b: Board): boolean {
  return a.length === b.length && a.every((card, index) => cardsEqual(card, b[index]));
}

/**
 * why the board input sheet closed without submitting. one member today,
 * declared as an enum rather than as a bare `onDismiss()`, ahead of
 * docs/conventions/component-contracts.md's own multi-cause bar for a
 * reason enum — see
 * docs/decisions/2026-09-05-declare-boarddismissreason-as-a-one-member-enum.md
 * for why.
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
 *    dismissal, the one rule here a reader is most likely to expect the
 *    other way round; see
 *    docs/decisions/2026-09-05-submit-an-empty-board-instead-of-dismissing-it.md
 *    for why.
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
