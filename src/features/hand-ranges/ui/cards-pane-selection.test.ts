import type { Card } from '../model/card';
import {
  EMPTY_CARDS_PANE_STATE,
  isCardTaken,
  selectCard,
  takenRankIndicesForSuit,
  tapSlot,
  type CardsPaneState,
} from './cards-pane-selection';

const ACE_SPADES: Card = { rank: 'A', suit: 'spades' };
const KING_SPADES: Card = { rank: 'K', suit: 'spades' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'hearts' };
const TWO_CLUBS: Card = { rank: '2', suit: 'clubs' };

describe('selectCard()', () => {
  it('fills slot 0 first when both slots are empty', () => {
    const { state, haptic } = selectCard(EMPTY_CARDS_PANE_STATE, ACE_SPADES);

    expect(state).toEqual({ slots: [ACE_SPADES, null], armedSlot: null });
    expect(haptic).toBe('toggleOn');
  });

  it('fills slot 1 when slot 0 is already taken', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], armedSlot: null };

    const { state, haptic } = selectCard(start, KING_SPADES);

    expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], armedSlot: null });
    expect(haptic).toBe('toggleOn');
  });

  it('is a no-op when both slots are already full and neither is armed', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: null };

    const result = selectCard(start, ACE_HEARTS);

    expect(result.state).toBe(start);
    expect(result.haptic).toBeNull();
  });

  it('is a no-op when the card is already in the other slot — the distinctness rule', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], armedSlot: null };

    const result = selectCard(start, ACE_SPADES);

    expect(result.state).toBe(start);
    expect(result.haptic).toBeNull();
  });

  it('is a no-op when the card is already taken, even while a (different) slot is armed', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 1 };

    const result = selectCard(start, ACE_SPADES);

    expect(result.state).toBe(start);
    expect(result.haptic).toBeNull();
  });

  it('is a no-op — and leaves the slot armed — when the tapped card is the one already sitting in the armed slot', () => {
    // `isCardTaken` checks both slots, the armed one included, before
    // `armedSlot` is ever consulted — so tapping the armed slot's own
    // card resolves as an ordinary taken-card no-op, same as any other
    // already-picked card, rather than as a replace-with-itself or a
    // disarm. the arm survives untouched: nothing here clears it.
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 0 };

    const result = selectCard(start, ACE_SPADES);

    expect(result.state).toBe(start);
    expect(result.state.armedSlot).toBe(0);
    expect(result.haptic).toBeNull();
  });

  it('replaces the armed slot’s own card and disarms, leaving the other slot untouched', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 0 };

    const { state, haptic } = selectCard(start, ACE_HEARTS);

    expect(state).toEqual({ slots: [ACE_HEARTS, KING_SPADES], armedSlot: null });
    expect(haptic).toBe('toggleOn');
  });

  it('replaces slot 1 when it, not slot 0, is armed', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 1 };

    const { state, haptic } = selectCard(start, TWO_CLUBS);

    expect(state).toEqual({ slots: [ACE_SPADES, TWO_CLUBS], armedSlot: null });
    expect(haptic).toBe('toggleOn');
  });

  it('fills an empty slot even while the other, filled slot is armed', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], armedSlot: 0 };

    const { state, haptic } = selectCard(start, KING_SPADES);

    // armed targets slot 0 specifically — an empty slot 1 still exists,
    // but arming means "the next pick replaces slot 0," not "fill
    // whichever is open," so slot 0 is what changes.
    expect(state).toEqual({ slots: [KING_SPADES, null], armedSlot: null });
    expect(haptic).toBe('toggleOn');
  });
});

describe('tapSlot()', () => {
  it('is a no-op on an empty slot', () => {
    const result = tapSlot(EMPTY_CARDS_PANE_STATE, 0);

    expect(result.state).toBe(EMPTY_CARDS_PANE_STATE);
    expect(result.haptic).toBeNull();
  });

  it('arms a filled, unarmed slot, firing selectionChange', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, null], armedSlot: null };

    const { state, haptic } = tapSlot(start, 0);

    expect(state).toEqual({ slots: [ACE_SPADES, null], armedSlot: 0 });
    expect(haptic).toBe('selectionChange');
  });

  it('clears the armed slot when it is tapped again, firing toggleOff', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 0 };

    const { state, haptic } = tapSlot(start, 0);

    expect(state).toEqual({ slots: [null, KING_SPADES], armedSlot: null });
    expect(haptic).toBe('toggleOff');
  });

  it('re-arms the other slot when it is tapped while one is already armed, disarming the first', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 0 };

    const { state, haptic } = tapSlot(start, 1);

    expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], armedSlot: 1 });
    expect(haptic).toBe('selectionChange');
  });

  it('tapping the armed slot a second time never clears the other slot', () => {
    const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: 1 };

    const { state } = tapSlot(start, 1);

    expect(state.slots[0]).toBe(ACE_SPADES);
  });
});

describe('isCardTaken()', () => {
  it('is false against the empty state', () => {
    expect(isCardTaken(EMPTY_CARDS_PANE_STATE, ACE_SPADES)).toBe(false);
  });

  it('is true for a card sitting in either slot', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: null };

    expect(isCardTaken(state, ACE_SPADES)).toBe(true);
    expect(isCardTaken(state, KING_SPADES)).toBe(true);
    expect(isCardTaken(state, ACE_HEARTS)).toBe(false);
  });
});

describe('takenRankIndicesForSuit()', () => {
  it('returns an empty set against the empty state', () => {
    expect(takenRankIndicesForSuit(EMPTY_CARDS_PANE_STATE, 'spades')).toEqual(new Set());
  });

  it('includes only the rank indices of slots matching the given suit', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, ACE_HEARTS], armedSlot: null };

    // RANKS is ascending 2..A, so 'A' is index 12.
    expect(takenRankIndicesForSuit(state, 'spades')).toEqual(new Set([12]));
    expect(takenRankIndicesForSuit(state, 'hearts')).toEqual(new Set([12]));
    expect(takenRankIndicesForSuit(state, 'clubs')).toEqual(new Set());
  });

  it('includes both indices when both slots share the given suit', () => {
    const state: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], armedSlot: null };

    expect(takenRankIndicesForSuit(state, 'spades')).toEqual(new Set([12, 11]));
  });
});
