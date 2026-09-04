import type { Card } from '@/shared/model/card';

import {
  BOARD_SLOT_COUNT,
  boardsEqual,
  boardToSlots,
  BoardDismissReason,
  EMPTY_BOARD_SLOTS,
  resolveBoardOutcome,
  type BoardSlots,
} from './board';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };
const QUEEN_DIAMONDS: Card = { rank: 'Q', suit: 'd' };

const FLOP = [ACE_SPADES, KING_SPADES, ACE_HEARTS] as const;

/** a left-packed five-slot row holding `cards`, the shape the picker's own
 * left-packed fill policy produces. */
function slotsHolding(cards: readonly Card[]): BoardSlots {
  return Array.from({ length: BOARD_SLOT_COUNT }, (_, index) => cards[index] ?? null);
}

describe('resolveBoardOutcome()', () => {
  it('submits an empty board when no slot holds a card', () => {
    const outcome = resolveBoardOutcome({ slots: EMPTY_BOARD_SLOTS });

    // an empty board is a valid board — a preflop calculation runs against
    // one — so backing out having picked nothing submits rather than
    // dismissing. this is the rule most likely to be expected the other way
    // round; see `resolveBoardOutcome`'s own doc comment.
    expect(outcome).toEqual({ kind: 'submit', board: [] });
  });

  it('dismisses IncompleteBoard at one card', () => {
    const outcome = resolveBoardOutcome({ slots: slotsHolding([ACE_SPADES]) });

    expect(outcome).toEqual({
      kind: 'dismiss',
      reason: BoardDismissReason.IncompleteBoard,
    });
  });

  it('dismisses IncompleteBoard at two cards', () => {
    const outcome = resolveBoardOutcome({ slots: slotsHolding([ACE_SPADES, KING_SPADES]) });

    expect(outcome).toEqual({
      kind: 'dismiss',
      reason: BoardDismissReason.IncompleteBoard,
    });
  });

  it('submits a flop at three cards, in slot order', () => {
    const outcome = resolveBoardOutcome({ slots: slotsHolding(FLOP) });

    expect(outcome).toEqual({ kind: 'submit', board: [ACE_SPADES, KING_SPADES, ACE_HEARTS] });
  });

  it('submits a flop and turn at four cards', () => {
    const outcome = resolveBoardOutcome({ slots: slotsHolding([...FLOP, TWO_CLUBS]) });

    expect(outcome).toEqual({
      kind: 'submit',
      board: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS],
    });
  });

  it('submits a full board at five cards', () => {
    const outcome = resolveBoardOutcome({
      slots: slotsHolding([...FLOP, TWO_CLUBS, QUEEN_DIAMONDS]),
    });

    expect(outcome).toEqual({
      kind: 'submit',
      board: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, QUEEN_DIAMONDS],
    });
  });

  it('drops the empty slots rather than carrying them into the submitted board', () => {
    const outcome = resolveBoardOutcome({ slots: slotsHolding(FLOP) });

    // the slot row is always five long; a submitted board is only as long
    // as the cards actually on it, which is what lets a caller read the
    // street off the length alone.
    expect(outcome.kind === 'submit' && outcome.board).toHaveLength(3);
  });

  it('stays total over a gapped row, counting the cards rather than the slots', () => {
    // the picker's left-packed policy makes a gap unreachable, so this
    // state is not one the sheet can actually reach — asserted anyway
    // because this function promises to be total over every slot row, and
    // a close that threw would be worse than one that resolved oddly.
    const gapped: BoardSlots = [ACE_SPADES, null, KING_SPADES, null, ACE_HEARTS];

    expect(resolveBoardOutcome({ slots: gapped })).toEqual({
      kind: 'submit',
      board: [ACE_SPADES, KING_SPADES, ACE_HEARTS],
    });
  });
});

describe('EMPTY_BOARD_SLOTS', () => {
  it('is one empty slot per community card', () => {
    expect(EMPTY_BOARD_SLOTS).toEqual([null, null, null, null, null]);
    expect(EMPTY_BOARD_SLOTS).toHaveLength(BOARD_SLOT_COUNT);
  });
});

describe('boardToSlots()', () => {
  it('pads an empty board out to five empty slots', () => {
    expect(boardToSlots([])).toEqual(EMPTY_BOARD_SLOTS);
  });

  it('left-packs a flop into the first three slots, leaving the rest empty', () => {
    expect(boardToSlots(FLOP)).toEqual([ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null]);
  });

  it('fills every slot from a full board', () => {
    const fullBoard = [...FLOP, TWO_CLUBS, QUEEN_DIAMONDS];

    expect(boardToSlots(fullBoard)).toEqual(fullBoard);
  });

  it('is the exact inverse of resolveBoardOutcome’s own filter, round-tripping a submitted board', () => {
    const submitted = resolveBoardOutcome({ slots: slotsHolding(FLOP) });

    expect(submitted.kind === 'submit' && boardToSlots(submitted.board)).toEqual(
      slotsHolding(FLOP),
    );
  });
});

describe('boardsEqual()', () => {
  it('is true for two empty boards', () => {
    expect(boardsEqual([], [])).toBe(true);
  });

  it('is true for two boards holding the same cards in the same order, built as separate array literals', () => {
    const a: Card[] = [ACE_SPADES, KING_SPADES, ACE_HEARTS];
    const b: Card[] = [ACE_SPADES, KING_SPADES, ACE_HEARTS];

    expect(boardsEqual(a, b)).toBe(true);
  });

  it('is false when the same cards appear in a different order', () => {
    expect(boardsEqual([ACE_SPADES, KING_SPADES], [KING_SPADES, ACE_SPADES])).toBe(false);
  });

  it('is false when the lengths differ', () => {
    expect(boardsEqual([ACE_SPADES, KING_SPADES], [ACE_SPADES, KING_SPADES, ACE_HEARTS])).toBe(
      false,
    );
  });

  it('is false when one card differs', () => {
    expect(boardsEqual([ACE_SPADES, KING_SPADES], [ACE_SPADES, TWO_CLUBS])).toBe(false);
  });
});
