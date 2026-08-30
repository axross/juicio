import { cardPair, type CardPair } from '@/shared/model/card-pair';
import type { Card } from '@/shared/model/card';
import type { RankPairKey } from '@/shared/model/rank-pair';

/**
 * the card/range input sheet's result contract (docs/specs/hand-ranges.md's
 * "The Card/Range Input Sheet"): a player's holding is either two specific
 * hole cards or a hand range, never both. `holeCards` is named for the game
 * concept it holds (docs/glossary.md's Hole Cards entry), not for its type
 * `CardPair` — the field name says which of the two concepts it
 * represents, not merely what shape it is.
 */
export type Holding =
  | { readonly kind: 'holeCards'; readonly holeCards: CardPair }
  | { readonly kind: 'handRange'; readonly rankPairs: ReadonlySet<RankPairKey> };

/**
 * why the sheet dismissed without a result — matches
 * docs/conventions/component-contracts.md's "A Reason Enum for the
 * Unsuccessful Path" worked example exactly.
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

function hasBothHoleCards(
  holeCards: HoldingInputState['holeCards'],
): holeCards is readonly [Card, Card] {
  return holeCards[0] !== null && holeCards[1] !== null;
}

/**
 * the sheet's own close-time decision, total over every reachable
 * `HoldingInputState`. the five rules below restate docs/specs/
 * hand-ranges.md's "Dismissing the sheet" in this module's terms, quoted so
 * the two can't drift apart silently:
 *
 * 1. both tabs keep their own state; the active tab at close decides the
 *    result. switching tabs never clears the inactive side.
 * 2. no selection on *either* tab → dismiss `NothingSelected`.
 * 3. otherwise, active tab `cards` with fewer than two cards → dismiss
 *    `IncompleteHoleCards`.
 * 4. otherwise, active tab `handRange` with no rank pairs → dismiss
 *    `EmptyHandRange`.
 * 5. otherwise → submit the active tab's holding.
 *
 * **the maintainer has confirmed rule 2's precedence over 3 and 4.** it
 * means a `handRange`-active close with an empty grid dismisses
 * `EmptyHandRange` even when the inactive `cards` tab holds a leftover,
 * unfinished pick: that pick counts as a selection, so rule 2 doesn't fire,
 * and rule 4 then decides off the active tab alone, discarding the
 * inactive tab's pick rather than promoting it. docs/specs/hand-ranges.md's
 * "Dismissing the sheet" states the same rule.
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
    // `cardPair()` throws on two copies of the same card — a precondition
    // this function assumes rather than enforces. the picker
    // (`../../../shared/ui/card-fan-geometry.ts`'s
    // `nearestSelectableCardIndex` skip
    // rule) is what actually prevents picking a card already in the other
    // slot.
    return {
      kind: 'submit',
      holding: { kind: 'holeCards', holeCards: cardPair(first, second) },
    };
  }

  if (!hasRankPairs) {
    return { kind: 'dismiss', reason: HoldingDismissReason.EmptyHandRange };
  }
  return { kind: 'submit', holding: { kind: 'handRange', rankPairs: state.rankPairs } };
}
