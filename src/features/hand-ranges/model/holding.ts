import { cardKey, cardsEqual, type Card } from './card';
import type { RankPairKey } from './rank-pair';

/**
 * the card/range input sheet's result contract
 * (docs/specs/hand-ranges.md's "The Card/Range Input Sheet"): a player's
 * holding is either two specific hole cards or a hand range, never both.
 */
export type Holding =
  | { readonly kind: 'holeCards'; readonly cards: readonly [Card, Card] }
  | { readonly kind: 'handRange'; readonly rankPairs: ReadonlySet<RankPairKey> };

/**
 * why the sheet dismissed without a result — see
 * docs/conventions/component-contracts.md's "A Reason Enum for the
 * Unsuccessful Path", which reproduces this exact enum as its own worked
 * example, written before this module existed.
 */
export enum HoldingDismissReason {
  NothingSelected = 'nothing-selected',
  IncompleteHoleCards = 'incomplete-hole-cards',
  EmptyHandRange = 'empty-hand-range',
}

export type HoldingInputState = {
  readonly activeTab: 'handRange' | 'cards';
  readonly holeCards: readonly [Card | null, Card | null];
  readonly rankPairs: ReadonlySet<RankPairKey>;
};

export type HoldingOutcome =
  | { readonly kind: 'submit'; readonly holding: Holding }
  | { readonly kind: 'dismiss'; readonly reason: HoldingDismissReason };

/**
 * builds a `holeCards` holding's own tuple, enforcing the one invariant
 * `Holding`'s type cannot: the two cards must be different. every
 * `holeCards` holding in this feature is built through this function
 * rather than a bare tuple literal, so a duplicate never reaches the type
 * silently.
 *
 * throws rather than returning an error value: a duplicate reaching here
 * is a precondition violation from further up the sheet, not a state
 * this function is meant to recover from — the wired-up picker that fills
 * `HoldingInputState.holeCards` (via `../ui/card-fan-geometry.ts`'s
 * `nearestSelectableCardIndex` skip rule, resolving a touch to a card
 * already in the other slot) is what is actually responsible for never
 * letting the same card be picked twice. that gesture wiring is run 4's,
 * not this one's — this function only assumes it will hold.
 */
export function createHoleCards(first: Card, second: Card): readonly [Card, Card] {
  if (cardsEqual(first, second)) {
    throw new Error(`hole cards must be distinct, got two copies of ${cardKey(first)}`);
  }
  return [first, second];
}

function hasBothHoleCards(
  holeCards: HoldingInputState['holeCards'],
): holeCards is readonly [Card, Card] {
  return holeCards[0] !== null && holeCards[1] !== null;
}

/**
 * the sheet's own close-time decision, total over every reachable
 * `HoldingInputState`. the five rules below are this run's brief, quoted
 * to keep this doc comment and that brief from drifting apart silently:
 *
 * 1. both tabs keep their own state, and the active tab at close decides
 *    the result. switching tabs does not clear the other side — nothing
 *    here clears `rankPairs` or `holeCards` for the *inactive* tab, since
 *    `HoldingInputState` already carries both independently of
 *    `activeTab`; this function only ever reads whichever the active tab
 *    names.
 * 2. if no selection exists on *either* tab → dismiss `NothingSelected`.
 * 3. otherwise, active tab `cards` with fewer than two cards → dismiss
 *    `IncompleteHoleCards`.
 * 4. otherwise, active tab `handRange` with no rank pairs → dismiss
 *    `EmptyHandRange`.
 * 5. otherwise → submit the active tab's holding.
 *
 * **rule 2's precedence over 3 and 4 is this implementation's own reading
 * of the maintainer's intent for issue #66, not something the maintainer
 * stated in those exact words.** it means: a `handRange`-active close
 * with an empty grid dismisses `EmptyHandRange` even if the *inactive*
 * `cards` tab was also never touched (rule 2 only fires when *neither*
 * tab carries a selection, and rule 4 already establishes the active
 * `handRange` tab has none — but the inactive `cards` tab being equally
 * empty does not promote that to `NothingSelected`, because the active
 * tab is what the user was actually looking at). flagged for the
 * maintainer to confirm rather than assumed silently — see this run's
 * own report.
 */
export function resolveHoldingOutcome(state: HoldingInputState): HoldingOutcome {
  const hasAnyHoleCard = state.holeCards[0] !== null || state.holeCards[1] !== null;
  const hasRankPairs = state.rankPairs.size > 0;

  if (!hasAnyHoleCard && !hasRankPairs) {
    return { kind: 'dismiss', reason: HoldingDismissReason.NothingSelected };
  }

  if (state.activeTab === 'cards') {
    if (!hasBothHoleCards(state.holeCards)) {
      return { kind: 'dismiss', reason: HoldingDismissReason.IncompleteHoleCards };
    }
    const [first, second] = state.holeCards;
    return {
      kind: 'submit',
      holding: { kind: 'holeCards', cards: createHoleCards(first, second) },
    };
  }

  if (!hasRankPairs) {
    return { kind: 'dismiss', reason: HoldingDismissReason.EmptyHandRange };
  }
  return { kind: 'submit', holding: { kind: 'handRange', rankPairs: state.rankPairs } };
}
