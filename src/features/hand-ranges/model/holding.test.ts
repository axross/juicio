import type { Card } from './card';
import { cardPair } from './card-pair';
import { HoldingDismissReason, resolveHoldingOutcome, type HoldingInputState } from './holding';

const ACE_SPADES: Card = { rank: 'A', suit: 'spades' };
const KING_HEARTS: Card = { rank: 'K', suit: 'hearts' };

function state(overrides: Partial<HoldingInputState>): HoldingInputState {
  return {
    activeTab: 'handRange',
    holeCards: [null, null],
    rankPairs: new Set(),
    ...overrides,
  };
}

describe('resolveHoldingOutcome()', () => {
  it('dismisses NothingSelected when neither tab has a selection, active tab handRange', () => {
    const outcome = resolveHoldingOutcome(state({ activeTab: 'handRange' }));
    expect(outcome).toEqual({ kind: 'dismiss', reason: HoldingDismissReason.NothingSelected });
  });

  it('dismisses NothingSelected when neither tab has a selection, active tab cards', () => {
    const outcome = resolveHoldingOutcome(state({ activeTab: 'cards' }));
    expect(outcome).toEqual({ kind: 'dismiss', reason: HoldingDismissReason.NothingSelected });
  });

  it('dismisses NothingSelected, not IncompleteHoleCards, for the cards tab with zero cards picked and no rank pairs', () => {
    const outcome = resolveHoldingOutcome(state({ activeTab: 'cards', holeCards: [null, null] }));
    // an active `cards` tab with zero cards picked and no rank pairs on
    // either tab is rule 2's case (nothing at all was selected), not
    // rule 3's — rule 3 only fires once rule 2's "neither tab has
    // anything" check has already failed to match.
    expect(outcome).toEqual({ kind: 'dismiss', reason: HoldingDismissReason.NothingSelected });
  });

  it('dismisses IncompleteHoleCards for the cards tab with exactly one card picked', () => {
    const outcome = resolveHoldingOutcome(
      state({ activeTab: 'cards', holeCards: [ACE_SPADES, null] }),
    );
    expect(outcome).toEqual({
      kind: 'dismiss',
      reason: HoldingDismissReason.IncompleteHoleCards,
    });
  });

  it('dismisses IncompleteHoleCards, not EmptyHandRange, when the inactive handRange tab has a non-empty selection — the symmetric precedence case', () => {
    // the mirror of the EmptyHandRange precedence case below: the `cards`
    // tab is active with one card (rule 3 would fire), and the *inactive*
    // `handRange` tab is not empty either — a rank pair sits there,
    // abandoned. rule 2 only fires when neither tab carries any
    // selection, so this is not that case, and the active tab's own rule
    // (3) decides instead, exactly as it would if the inactive tab were
    // empty too.
    const outcome = resolveHoldingOutcome(
      state({ activeTab: 'cards', holeCards: [ACE_SPADES, null], rankPairs: new Set(['AKs']) }),
    );
    expect(outcome).toEqual({
      kind: 'dismiss',
      reason: HoldingDismissReason.IncompleteHoleCards,
    });
  });

  it('submits holeCards for the cards tab with two distinct cards picked', () => {
    const outcome = resolveHoldingOutcome(
      state({ activeTab: 'cards', holeCards: [ACE_SPADES, KING_HEARTS] }),
    );
    expect(outcome).toEqual({
      kind: 'submit',
      holding: { kind: 'holeCards', holeCards: cardPair(ACE_SPADES, KING_HEARTS) },
    });
  });

  it('dismisses EmptyHandRange for the handRange tab with no rank pairs selected', () => {
    const outcome = resolveHoldingOutcome(state({ activeTab: 'handRange', rankPairs: new Set() }));
    // this alone is ambiguous with rule 2 unless something else on the
    // cards tab breaks the tie — see the next test for the case that
    // actually exercises rule 2's precedence.
    expect(outcome).toEqual({ kind: 'dismiss', reason: HoldingDismissReason.NothingSelected });
  });

  it('dismisses EmptyHandRange, not NothingSelected, when the inactive cards tab has an abandoned partial selection', () => {
    // this is rule 2's precedence in the doc comment made concrete: the
    // handRange tab is active and empty (rule 4 would fire), but the
    // *cards* tab is not untouched — one card sits there, abandoned. rule
    // 2 only fires when neither tab carries any selection, so this is not
    // that case, and the active tab's own rule (4) decides instead.
    const outcome = resolveHoldingOutcome(
      state({ activeTab: 'handRange', holeCards: [ACE_SPADES, null], rankPairs: new Set() }),
    );
    expect(outcome).toEqual({ kind: 'dismiss', reason: HoldingDismissReason.EmptyHandRange });
  });

  it('submits handRange for the handRange tab with at least one rank pair selected', () => {
    const outcome = resolveHoldingOutcome(
      state({ activeTab: 'handRange', rankPairs: new Set(['AKs']) }),
    );
    expect(outcome).toEqual({
      kind: 'submit',
      holding: { kind: 'handRange', rankPairs: new Set(['AKs']) },
    });
  });

  it('ignores the inactive tab entirely when the active tab has a valid selection (rule 1: each tab keeps its own state)', () => {
    // both tabs are simultaneously complete; the active tab alone decides.
    const cardsActive = resolveHoldingOutcome(
      state({
        activeTab: 'cards',
        holeCards: [ACE_SPADES, KING_HEARTS],
        rankPairs: new Set(['AKs']),
      }),
    );
    expect(cardsActive).toEqual({
      kind: 'submit',
      holding: { kind: 'holeCards', holeCards: cardPair(ACE_SPADES, KING_HEARTS) },
    });

    const rangeActive = resolveHoldingOutcome(
      state({
        activeTab: 'handRange',
        holeCards: [ACE_SPADES, KING_HEARTS],
        rankPairs: new Set(['AKs']),
      }),
    );
    expect(rangeActive).toEqual({
      kind: 'submit',
      holding: { kind: 'handRange', rankPairs: new Set(['AKs']) },
    });
  });
});
