import type { Card } from '../model/card';
import {
  EMPTY_CARDS_PANE_STATE,
  initialFocusedSlot,
  isCardTaken,
  selectCard,
  takenRankIndicesForSuit,
  tapSlot,
  type CardsPaneState,
} from './cards-pane-selection';

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };

describe('selectCard()', () => {
  it('fills the focused slot 0 from the empty state and advances focus to slot 1', () => {
    const { state, haptic } = selectCard(EMPTY_CARDS_PANE_STATE, ACE_SPADES);

    expect(state).toEqual({ slots: [ACE_SPADES, null], focusedSlot: 1 });
    expect(haptic).toBe('toggleOn');
  });

  it('fills the now-focused slot 1 and advances focus back to slot 0', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 1 };

    const { state, haptic } = selectCard(start, KING_SPADES);

    expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 });
    expect(haptic).toBe('toggleOn');
  });

  it('overwrites the focused slot even when both slots are already full, and advances focus', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    const { state, haptic } = selectCard(start, ACE_HEARTS);

    expect(state).toEqual({ slots: [ACE_HEARTS, KING_SPADES], focusedSlot: 1 });
    expect(haptic).toBe('toggleOn');
  });

  it('overwrites slot 1 and advances focus to slot 0 when slot 1 is the one focused', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

    const { state, haptic } = selectCard(start, TWO_CLUBS);

    expect(state).toEqual({ slots: [ACE_SPADES, TWO_CLUBS], focusedSlot: 0 });
    expect(haptic).toBe('toggleOn');
  });

  it('replaces the focused slot rather than filling an empty non-focused slot', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 0 };

    const { state, haptic } = selectCard(start, KING_SPADES);

    // focus targets slot 0 specifically — an empty slot 1 exists, but
    // focus means "the next pick replaces slot 0," not "fill whichever is
    // open," so slot 0 is what changes.
    expect(state).toEqual({ slots: [KING_SPADES, null], focusedSlot: 1 });
    expect(haptic).toBe('toggleOn');
  });

  it('is a no-op when the card is already in the other slot — the distinctness rule', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 1 };

    const result = selectCard(start, ACE_SPADES);

    expect(result.state).toBe(start);
    expect(result.haptic).toBeNull();
  });

  it('is a no-op when the card is already taken, even when it sits in the focused slot itself', () => {
    // `isCardTaken` checks both slots, the focused one included, before
    // `focusedSlot` is ever consulted — so tapping the focused slot's own
    // card resolves as an ordinary taken-card no-op, same as any other
    // already-picked card, rather than as a replace-with-itself. Focus
    // survives untouched: nothing here moves it.
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    const result = selectCard(start, ACE_SPADES);

    expect(result.state).toBe(start);
    expect(result.state.focusedSlot).toBe(0);
    expect(result.haptic).toBeNull();
  });
});

describe('tapSlot()', () => {
  it('moves focus to the other slot when it is empty, firing selectionChange', () => {
    const result = tapSlot(EMPTY_CARDS_PANE_STATE, 1);

    expect(result.state).toEqual({ slots: [null, null], focusedSlot: 1 });
    expect(result.haptic).toBe('selectionChange');
  });

  it('moves focus to the other slot when it is filled, firing selectionChange', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    const { state, haptic } = tapSlot(start, 1);

    expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 });
    expect(haptic).toBe('selectionChange');
  });

  it('is a no-op when the focused slot is tapped and it is already empty', () => {
    const result = tapSlot(EMPTY_CARDS_PANE_STATE, 0);

    expect(result.state).toBe(EMPTY_CARDS_PANE_STATE);
    expect(result.haptic).toBeNull();
  });

  it('clears the focused slot when it holds a card and is tapped again, firing toggleOff', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    const { state, haptic } = tapSlot(start, 0);

    expect(state).toEqual({ slots: [null, KING_SPADES], focusedSlot: 0 });
    expect(haptic).toBe('toggleOff');
  });

  it('leaves focus on the slot it just cleared rather than advancing it — the deliberate asymmetry with selectCard', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

    const { state } = tapSlot(start, 1);

    expect(state.focusedSlot).toBe(1);
    expect(state.slots).toEqual([ACE_SPADES, null]);
  });

  it('clearing the focused slot never touches the other slot', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

    const { state } = tapSlot(start, 1);

    expect(state.slots[0]).toBe(ACE_SPADES);
  });
});

describe('initialFocusedSlot()', () => {
  it('focuses slot 0 when both slots are empty', () => {
    expect(initialFocusedSlot([null, null])).toBe(0);
  });

  it('focuses slot 1 — the empty one — when slot 0 alone is filled', () => {
    expect(initialFocusedSlot([ACE_SPADES, null])).toBe(1);
  });

  it('focuses slot 0 — the empty one — when slot 1 alone is filled', () => {
    expect(initialFocusedSlot([null, ACE_SPADES])).toBe(0);
  });

  it('falls back to slot 0 when both slots are already filled', () => {
    expect(initialFocusedSlot([ACE_SPADES, KING_SPADES])).toBe(0);
  });
});

describe('isCardTaken()', () => {
  it('is false against the empty state', () => {
    expect(isCardTaken(EMPTY_CARDS_PANE_STATE, ACE_SPADES)).toBe(false);
  });

  it('is true for a card sitting in either slot', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    expect(isCardTaken(state, ACE_SPADES)).toBe(true);
    expect(isCardTaken(state, KING_SPADES)).toBe(true);
    expect(isCardTaken(state, ACE_HEARTS)).toBe(false);
  });
});

describe('takenRankIndicesForSuit()', () => {
  it('returns an empty set against the empty state', () => {
    expect(takenRankIndicesForSuit(EMPTY_CARDS_PANE_STATE, 's')).toEqual(new Set());
  });

  it('includes only the rank indices of slots matching the given suit', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, ACE_HEARTS], focusedSlot: 0 };

    // RANKS is ascending 2..A, so 'A' is index 12.
    expect(takenRankIndicesForSuit(state, 's')).toEqual(new Set([12]));
    expect(takenRankIndicesForSuit(state, 'h')).toEqual(new Set([12]));
    expect(takenRankIndicesForSuit(state, 'c')).toEqual(new Set());
  });

  it('includes both indices when both slots share the given suit', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

    expect(takenRankIndicesForSuit(state, 's')).toEqual(new Set([12, 11]));
  });
});
