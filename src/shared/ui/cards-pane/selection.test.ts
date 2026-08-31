import { HapticEvent } from '@/core/haptics/haptics';
import type { Card } from '@/shared/model/card';

import {
  clampFocusedSlot,
  EMPTY_CARDS_PANE_STATE,
  initialFocusedSlot,
  isCardTaken,
  isCardUnavailable,
  selectCard,
  SlotFillPolicy,
  takenRankIndicesForSuit,
  tapSlot,
  unavailableRankIndicesForSuit,
  type CardsPaneSlots,
  type CardsPaneState,
} from './selection';

// this module's `haptic` field is now `HapticEvent`, a real enum, so
// importing it pulls in the real `@/core/haptics/haptics` — which reaches
// `@/core/instrumentation/report-error` and `@sentry/react-native`,
// starting a real `setInterval` nothing here clears. mocking
// `report-error` alone — same reasoning as `settings-screen.test.tsx`'s
// comment — keeps the native SDK out; nothing here needs `triggerHaptic`
// itself, only the `HapticEvent` values these functions return.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_SPADES: Card = { rank: 'K', suit: 's' };
const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };
const QUEEN_DIAMONDS: Card = { rank: 'Q', suit: 'd' };
const JACK_CLUBS: Card = { rank: 'J', suit: 'c' };
const TEN_HEARTS: Card = { rank: 'T', suit: 'h' };
const NINE_SPADES: Card = { rank: '9', suit: 's' };
const EIGHT_DIAMONDS: Card = { rank: '8', suit: 'd' };

const INDEPENDENT = SlotFillPolicy.Independent;
const LEFT_PACKED = SlotFillPolicy.LeftPacked;

/** the board's own five empty slots, the shape `LEFT_PACKED` governs. */
const EMPTY_BOARD: CardsPaneState = {
  slots: [null, null, null, null, null],
  focusedSlot: 0,
};

describe('selectCard()', () => {
  describe('under the independent fill policy', () => {
    it('fills the focused slot 0 from the empty state and advances focus to slot 1', () => {
      const { state, haptic } = selectCard(EMPTY_CARDS_PANE_STATE, ACE_SPADES, INDEPENDENT);

      expect(state).toEqual({ slots: [ACE_SPADES, null], focusedSlot: 1 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('fills the now-focused slot 1 and advances focus back to slot 0', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 1 };

      const { state, haptic } = selectCard(start, KING_SPADES, INDEPENDENT);

      expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('overwrites the focused slot even when both slots are already full, and advances focus', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

      const { state, haptic } = selectCard(start, ACE_HEARTS, INDEPENDENT);

      expect(state).toEqual({ slots: [ACE_HEARTS, KING_SPADES], focusedSlot: 1 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('overwrites slot 1 and advances focus to slot 0 when slot 1 is the one focused', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

      const { state, haptic } = selectCard(start, TWO_CLUBS, INDEPENDENT);

      expect(state).toEqual({ slots: [ACE_SPADES, TWO_CLUBS], focusedSlot: 0 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('replaces the focused slot rather than filling an empty non-focused slot', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 0 };

      const { state, haptic } = selectCard(start, KING_SPADES, INDEPENDENT);

      // focus targets slot 0 specifically — an empty slot 1 exists, but
      // focus means "the next pick replaces slot 0," not "fill whichever is
      // open," so slot 0 is what changes.
      expect(state).toEqual({ slots: [KING_SPADES, null], focusedSlot: 1 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('is a no-op when the card is already in the other slot — the distinctness rule', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 1 };

      const result = selectCard(start, ACE_SPADES, INDEPENDENT);

      expect(result.state).toBe(start);
      expect(result.haptic).toBeNull();
    });

    it('is a no-op when the card is already taken, even when it sits in the focused slot itself', () => {
      // `isCardTaken` checks both slots, the focused one included, before
      // `focusedSlot` is ever consulted — so tapping the focused slot's own
      // card resolves as an ordinary taken-card no-op, same as any other
      // already-picked card, rather than as a replace-with-itself. focus
      // survives untouched: nothing here moves it.
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

      const result = selectCard(start, ACE_SPADES, INDEPENDENT);

      expect(result.state).toBe(start);
      expect(result.state.focusedSlot).toBe(0);
      expect(result.haptic).toBeNull();
    });

    it('is a no-op when the card is unavailable, even though no slot holds it — the same outcome a tap or a drag release resolves to', () => {
      const start: CardsPaneState = { slots: [null, null], focusedSlot: 0 };

      const result = selectCard(start, ACE_SPADES, INDEPENDENT, [ACE_SPADES]);

      expect(result.state).toBe(start);
      expect(result.haptic).toBeNull();
    });

    it('is a no-op for a card that is both taken and unavailable', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, null], focusedSlot: 1 };

      const result = selectCard(start, ACE_SPADES, INDEPENDENT, [ACE_SPADES]);

      expect(result.state).toBe(start);
      expect(result.haptic).toBeNull();
    });

    it('still picks a card that is neither taken nor unavailable, unaffected by an unrelated unavailable list', () => {
      const start: CardsPaneState = { slots: [null, null], focusedSlot: 0 };

      const { state, haptic } = selectCard(start, ACE_SPADES, INDEPENDENT, [KING_SPADES]);

      expect(state).toEqual({ slots: [ACE_SPADES, null], focusedSlot: 1 });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });
  });

  describe('under the left-packed fill policy', () => {
    it('fills the first empty slot and moves focus one place right', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, null, null, null],
        focusedSlot: 2,
      };

      const { state, haptic } = selectCard(start, ACE_HEARTS, LEFT_PACKED);

      expect(state).toEqual({
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null],
        focusedSlot: 3,
      });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('replaces the last slot and keeps focus there rather than wrapping to the first', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, QUEEN_DIAMONDS],
        focusedSlot: 4,
      };

      const { state, haptic } = selectCard(start, JACK_CLUBS, LEFT_PACKED);

      expect(state).toEqual({
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, JACK_CLUBS],
        focusedSlot: 4,
      });
      expect(haptic).toBe(HapticEvent.ToggleOn);
    });

    it('overwrites a card mid-run without disturbing the slots either side of it', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null],
        focusedSlot: 1,
      };

      const { state } = selectCard(start, TWO_CLUBS, LEFT_PACKED);

      expect(state.slots).toEqual([ACE_SPADES, TWO_CLUBS, ACE_HEARTS, null, null]);
      expect(state.focusedSlot).toBe(2);
    });

    it('is a no-op when the card already sits anywhere on the board', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, null, null, null],
        focusedSlot: 2,
      };

      const result = selectCard(start, ACE_SPADES, LEFT_PACKED);

      expect(result.state).toBe(start);
      expect(result.haptic).toBeNull();
    });
  });
});

describe('tapSlot()', () => {
  describe('under the independent fill policy', () => {
    it('moves focus to the other slot when it is empty, firing selectionChange', () => {
      const result = tapSlot(EMPTY_CARDS_PANE_STATE, 1, INDEPENDENT);

      expect(result.state).toEqual({ slots: [null, null], focusedSlot: 1 });
      expect(result.haptic).toBe(HapticEvent.SelectionChange);
    });

    it('moves focus to the other slot when it is filled, firing selectionChange', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

      const { state, haptic } = tapSlot(start, 1, INDEPENDENT);

      expect(state).toEqual({ slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 });
      expect(haptic).toBe(HapticEvent.SelectionChange);
    });

    it('is a no-op when the focused slot is tapped and it is already empty', () => {
      const result = tapSlot(EMPTY_CARDS_PANE_STATE, 0, INDEPENDENT);

      expect(result.state).toBe(EMPTY_CARDS_PANE_STATE);
      expect(result.haptic).toBeNull();
    });

    it('clears the focused slot when it holds a card and is tapped again, firing toggleOff', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 0 };

      const { state, haptic } = tapSlot(start, 0, INDEPENDENT);

      expect(state).toEqual({ slots: [null, KING_SPADES], focusedSlot: 0 });
      expect(haptic).toBe(HapticEvent.ToggleOff);
    });

    it('leaves focus on the slot it just cleared rather than advancing it — the deliberate asymmetry with selectCard', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

      const { state } = tapSlot(start, 1, INDEPENDENT);

      expect(state.focusedSlot).toBe(1);
      expect(state.slots).toEqual([ACE_SPADES, null]);
    });

    it('clearing the focused slot never touches the other slot', () => {
      const start: CardsPaneState = { slots: [ACE_SPADES, KING_SPADES], focusedSlot: 1 };

      const { state } = tapSlot(start, 1, INDEPENDENT);

      expect(state.slots[0]).toBe(ACE_SPADES);
    });
  });

  describe('under the left-packed fill policy', () => {
    it('moves focus to a tapped slot at or before the first empty one, firing selectionChange', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null],
        focusedSlot: 3,
      };

      const { state, haptic } = tapSlot(start, 1, LEFT_PACKED);

      expect(state.focusedSlot).toBe(1);
      expect(state.slots).toBe(start.slots);
      expect(haptic).toBe(HapticEvent.SelectionChange);
    });

    it('clamps a tap past the first empty slot back onto that first empty slot', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, null, null, null],
        focusedSlot: 0,
      };

      const { state, haptic } = tapSlot(start, 4, LEFT_PACKED);

      // slot 2 is the first empty one, so focus can travel no further
      // right than that — which is exactly what keeps the next pick from
      // landing in slot 4 and leaving 2 and 3 empty behind it.
      expect(state.focusedSlot).toBe(2);
      expect(haptic).toBe(HapticEvent.SelectionChange);
    });

    it('is a no-op when a tap clamps onto the already-focused, empty slot', () => {
      const result = tapSlot(EMPTY_BOARD, 4, LEFT_PACKED);

      expect(result.state).toBe(EMPTY_BOARD);
      expect(result.haptic).toBeNull();
    });

    it('clears the focused slot, shifts every card right of it one place left, and moves focus to the first empty slot', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, null],
        focusedSlot: 1,
      };

      const { state, haptic } = tapSlot(start, 1, LEFT_PACKED);

      // focus does *not* stay on slot 1 the way it does under the
      // independent policy: the shift has just moved the ace of hearts
      // into slot 1, so leaving focus there would aim the next pick at a
      // card the user never asked to replace. it goes to slot 3 instead,
      // where the shortened run now ends.
      expect(state.slots).toEqual([ACE_SPADES, ACE_HEARTS, TWO_CLUBS, null, null]);
      expect(state.focusedSlot).toBe(3);
      expect(haptic).toBe(HapticEvent.ToggleOff);
    });

    it('leaves the next pick extending the run rather than overwriting the card the clear shifted in', () => {
      // the composition the two rules used to make silently destructive:
      // clearing slot 0 of a three-card board pulls the four of diamonds
      // into slot 0, and a pick that landed there would have destroyed it
      // with nothing on screen to say so.
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, null, null],
        focusedSlot: 0,
      };

      const cleared = tapSlot(start, 0, LEFT_PACKED).state;
      const picked = selectCard(cleared, TWO_CLUBS, LEFT_PACKED).state;

      expect(cleared.slots).toEqual([KING_SPADES, ACE_HEARTS, null, null, null]);
      expect(picked.slots).toEqual([KING_SPADES, ACE_HEARTS, TWO_CLUBS, null, null]);
    });

    it('keeps the row five slots long when the last one is cleared', () => {
      const start: CardsPaneState = {
        slots: [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, QUEEN_DIAMONDS],
        focusedSlot: 4,
      };

      const { state } = tapSlot(start, 4, LEFT_PACKED);

      // nothing shifts when the cleared slot is the last one, so the
      // first empty slot focus moves to is the slot just cleared — the
      // one case where this policy and the independent one agree.
      expect(state.slots).toEqual([ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, null]);
      expect(state.focusedSlot).toBe(4);
    });
  });
});

/** the leftmost empty slot, or the slot count when every slot is full —
 * `./selection.ts`'s own `firstEmptySlot`, restated here rather than
 * exported, so these tests check the invariant against their own reading
 * of it instead of against the implementation's. */
function firstEmptySlot(slots: CardsPaneSlots): number {
  const index = slots.findIndex((slot) => slot === null);
  return index === -1 ? slots.length : index;
}

/** true when any filled slot sits to the right of an empty one — the
 * state the left-packed policy exists to make unreachable. */
function hasGap(slots: CardsPaneSlots): boolean {
  return slots.slice(firstEmptySlot(slots)).some((slot) => slot !== null);
}

/**
 * the guarantee the board's whole fill policy exists for, driven over a
 * sequence rather than asserted on one transition: no ordering of picks,
 * slot taps, and clears reaches a state with an empty slot to the left of
 * a filled one. a per-transition test can only show that one step
 * preserves the property; only a sequence shows that the steps compose.
 */
describe('the left-packed policy over a sequence of operations', () => {
  type Operation =
    | { readonly kind: 'pick'; readonly card: Card }
    | { readonly kind: 'tap'; readonly slotIndex: number };

  const OPERATIONS: readonly Operation[] = [
    { kind: 'tap', slotIndex: 4 }, // the far right of an empty board
    { kind: 'pick', card: ACE_SPADES },
    { kind: 'pick', card: KING_SPADES },
    { kind: 'tap', slotIndex: 3 }, // past the first empty slot
    { kind: 'pick', card: ACE_HEARTS },
    { kind: 'tap', slotIndex: 0 }, // back to the run's first card
    // clear it: the two behind shift left, and focus follows them to the
    // run's new end rather than staying on the slot just cleared
    { kind: 'tap', slotIndex: 0 },
    { kind: 'tap', slotIndex: 0 }, // back to the run's first card again
    { kind: 'pick', card: TWO_CLUBS }, // replaces it, mid-run
    { kind: 'pick', card: QUEEN_DIAMONDS },
    { kind: 'pick', card: JACK_CLUBS },
    { kind: 'pick', card: TEN_HEARTS },
    { kind: 'pick', card: NINE_SPADES }, // fills the last slot
    { kind: 'pick', card: EIGHT_DIAMONDS }, // replaces it, focus stays
    { kind: 'tap', slotIndex: 2 },
    { kind: 'tap', slotIndex: 2 }, // clear a card mid-run — focus jumps to slot 4
    { kind: 'tap', slotIndex: 4 }, // already the first empty slot, and already focused
  ];

  it('never leaves an empty slot to the left of a filled one, at any point in the sequence', () => {
    let state = EMPTY_BOARD;

    for (const operation of OPERATIONS) {
      state =
        operation.kind === 'pick'
          ? selectCard(state, operation.card, LEFT_PACKED).state
          : tapSlot(state, operation.slotIndex, LEFT_PACKED).state;

      expect(hasGap(state.slots)).toBe(false);
      expect(state.slots).toHaveLength(5);
    }
  });

  it('never leaves focus beyond the first empty slot, at any point in the sequence', () => {
    // the companion to the invariant above, and what actually enforces it:
    // focus is the only slot a pick can land in, so focus never travelling
    // past the first empty slot is what makes a gap unreachable in the
    // first place.
    let state = EMPTY_BOARD;

    for (const operation of OPERATIONS) {
      state =
        operation.kind === 'pick'
          ? selectCard(state, operation.card, LEFT_PACKED).state
          : tapSlot(state, operation.slotIndex, LEFT_PACKED).state;

      expect(state.focusedSlot).toBeLessThanOrEqual(firstEmptySlot(state.slots));
      expect(state.focusedSlot).toBeLessThanOrEqual(4);
      expect(state.focusedSlot).toBeGreaterThanOrEqual(0);
    }
  });

  it('ends the sequence on the state each step above adds up to', () => {
    // pins the sequence itself, so a rule change that still satisfies both
    // invariants above but reorders or drops a card cannot pass unnoticed.
    let state = EMPTY_BOARD;

    for (const operation of OPERATIONS) {
      state =
        operation.kind === 'pick'
          ? selectCard(state, operation.card, LEFT_PACKED).state
          : tapSlot(state, operation.slotIndex, LEFT_PACKED).state;
    }

    expect(state).toEqual({
      slots: [TWO_CLUBS, QUEEN_DIAMONDS, TEN_HEARTS, EIGHT_DIAMONDS, null],
      focusedSlot: 4,
    });
  });
});

/**
 * the same two invariants as the sequence above, but over every state the
 * rules can actually reach rather than over one hand-chosen story. the
 * sequence pins one concrete journey and can only show that *those* steps
 * compose; the property it checks could break at any state neither it nor
 * the per-transition tests happen to visit. these are pure functions with
 * a tiny reachable state space, so the whole of it can simply be searched.
 */
describe('the left-packed policy over every state reachable in six operations', () => {
  // five distinct cards — enough to fill the board — and every slot tap.
  // widening the deck past five buys nothing: the rules never read a
  // card's rank or suit beyond `isCardTaken`'s own equality, so a sixth
  // card would only relabel states this already reaches.
  const DECK: readonly Card[] = [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, QUEEN_DIAMONDS];
  const SEARCH_DEPTH = 6;

  const OPERATIONS: readonly ((state: CardsPaneState) => CardsPaneState)[] = [
    ...DECK.map((card) => (state: CardsPaneState) => selectCard(state, card, LEFT_PACKED).state),
    ...[0, 1, 2, 3, 4].map(
      (slotIndex) => (state: CardsPaneState) => tapSlot(state, slotIndex, LEFT_PACKED).state,
    ),
  ];

  function stateKey(state: CardsPaneState): string {
    const slots = state.slots.map((slot) => (slot === null ? '--' : `${slot.rank}${slot.suit}`));
    return `${slots.join(',')}|${state.focusedSlot}`;
  }

  it('reaches no state with a gap, and none with focus past the first empty slot', () => {
    // breadth-first, deduplicating on the state itself: every state is
    // expanded once however many ways there are to arrive at it, which is
    // what keeps a ten-way branching factor over six levels down to a few
    // hundred states and a few milliseconds.
    const seen = new Set<string>([stateKey(EMPTY_BOARD)]);
    let frontier: readonly CardsPaneState[] = [EMPTY_BOARD];

    for (let depth = 0; depth < SEARCH_DEPTH; depth += 1) {
      const next: CardsPaneState[] = [];

      for (const state of frontier) {
        for (const operation of OPERATIONS) {
          const candidate = operation(state);
          const key = stateKey(candidate);
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

          expect(hasGap(candidate.slots)).toBe(false);
          expect(candidate.slots).toHaveLength(5);
          expect(candidate.focusedSlot).toBeGreaterThanOrEqual(0);
          expect(candidate.focusedSlot).toBeLessThanOrEqual(4);
          expect(candidate.focusedSlot).toBeLessThanOrEqual(firstEmptySlot(candidate.slots));
          next.push(candidate);
        }
      }

      frontier = next;
    }

    // a search that explored almost nothing would pass every assertion
    // above vacuously, so the count itself is asserted: a board this deck
    // can fill is reachable well inside six operations, and the run that
    // established this rule visited 1511 states.
    expect(seen.size).toBeGreaterThan(500);
  });
});

describe('clampFocusedSlot()', () => {
  it('leaves any in-bounds slot alone under the independent policy, filled or not', () => {
    expect(clampFocusedSlot([ACE_SPADES, null], INDEPENDENT, 1)).toBe(1);
    expect(clampFocusedSlot([null, null], INDEPENDENT, 1)).toBe(1);
  });

  it('bounds an out-of-range index into the row under either policy', () => {
    expect(clampFocusedSlot([null, null], INDEPENDENT, 7)).toBe(1);
    expect(clampFocusedSlot(EMPTY_BOARD.slots, LEFT_PACKED, -3)).toBe(0);
  });

  it('bounds at the first empty slot under the left-packed policy', () => {
    expect(clampFocusedSlot([ACE_SPADES, KING_SPADES, null, null, null], LEFT_PACKED, 4)).toBe(2);
  });

  it('bounds at the last slot when the left-packed row is full', () => {
    const full: CardsPaneSlots = [ACE_SPADES, KING_SPADES, ACE_HEARTS, TWO_CLUBS, QUEEN_DIAMONDS];

    expect(clampFocusedSlot(full, LEFT_PACKED, 4)).toBe(4);
  });
});

describe('initialFocusedSlot()', () => {
  it('focuses slot 0 when both slots are empty', () => {
    expect(initialFocusedSlot([null, null], INDEPENDENT)).toBe(0);
  });

  it('focuses slot 1 — the empty one — when slot 0 alone is filled', () => {
    expect(initialFocusedSlot([ACE_SPADES, null], INDEPENDENT)).toBe(1);
  });

  it('focuses slot 0 — the empty one — when slot 1 alone is filled', () => {
    expect(initialFocusedSlot([null, ACE_SPADES], INDEPENDENT)).toBe(0);
  });

  it('falls back to slot 0 when both slots are already filled', () => {
    expect(initialFocusedSlot([ACE_SPADES, KING_SPADES], INDEPENDENT)).toBe(0);
  });

  it('focuses the first empty slot of a partly-filled left-packed row', () => {
    expect(initialFocusedSlot([ACE_SPADES, KING_SPADES, null, null, null], LEFT_PACKED)).toBe(2);
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

  it('reaches every slot of a five-slot row, not only the first two', () => {
    const state: CardsPaneState = {
      slots: [null, null, null, null, QUEEN_DIAMONDS],
      focusedSlot: 0,
    };

    expect(isCardTaken(state, QUEEN_DIAMONDS)).toBe(true);
  });
});

describe('isCardUnavailable()', () => {
  it('is false against an empty list', () => {
    expect(isCardUnavailable([], ACE_SPADES)).toBe(false);
  });

  it('is true for a card the list names, false for one it does not', () => {
    const unavailableCards = [ACE_SPADES, KING_SPADES];

    expect(isCardUnavailable(unavailableCards, ACE_SPADES)).toBe(true);
    expect(isCardUnavailable(unavailableCards, KING_SPADES)).toBe(true);
    expect(isCardUnavailable(unavailableCards, ACE_HEARTS)).toBe(false);
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

  it('collects every matching suit across a five-slot row', () => {
    const state: CardsPaneState = {
      slots: [ACE_SPADES, ACE_HEARTS, KING_SPADES, null, NINE_SPADES],
      focusedSlot: 3,
    };

    // 'A' is 12, 'K' is 11, '9' is 7.
    expect(takenRankIndicesForSuit(state, 's')).toEqual(new Set([12, 11, 7]));
  });
});

describe('unavailableRankIndicesForSuit()', () => {
  it('returns an empty set against an empty list', () => {
    expect(unavailableRankIndicesForSuit([], 's')).toEqual(new Set());
  });

  it('includes only the rank indices of unavailable cards matching the given suit', () => {
    const unavailableCards = [ACE_SPADES, ACE_HEARTS];

    // RANKS is ascending 2..A, so 'A' is index 12.
    expect(unavailableRankIndicesForSuit(unavailableCards, 's')).toEqual(new Set([12]));
    expect(unavailableRankIndicesForSuit(unavailableCards, 'h')).toEqual(new Set([12]));
    expect(unavailableRankIndicesForSuit(unavailableCards, 'c')).toEqual(new Set());
  });

  it('collects every matching suit across the whole list', () => {
    const unavailableCards = [ACE_SPADES, KING_SPADES, NINE_SPADES];

    // 'A' is 12, 'K' is 11, '9' is 7.
    expect(unavailableRankIndicesForSuit(unavailableCards, 's')).toEqual(new Set([12, 11, 7]));
  });
});
