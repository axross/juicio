import type { Card } from '@/shared/model/card';

import type { Board } from './board';
import type { Player } from './player';

/**
 * the two cards a `holeCards` player contributes to every *other* picker —
 * empty for a `handRange` player, per the plan's own assumption: a range is
 * a set of rank pairs, not specific cards, so it puts nothing out of
 * reach.
 */
function exactHoldingCards(player: Player): readonly Card[] {
  return player.holding.kind === 'holeCards'
    ? [player.holding.holeCards.first, player.holding.holeCards.second]
    : [];
}

/**
 * pure functions over `Board` and `readonly Player[]` deciding which cards a
 * given picker must exclude — a card can be in exactly one place, so a card
 * already spoken for elsewhere renders `unavailable` (`@/shared/ui/
 * cards-pane/`) in every *other* picker. no React, no I/O: both functions
 * below are total, and neither reads which sheet is actually open.
 *
 * **neither sheet excludes the cards it is itself editing.** the board's
 * own current cards never contribute to `unavailableCardsForBoard`'s own
 * result — they were never a *player's* cards to begin with, so there is
 * nothing here to exclude. `unavailableCardsForPlayer` below excludes the
 * edited player's own two cards explicitly, through `editingPlayerId`: both
 * cases matter, since a picker that locked out the cards sitting in its own
 * preview slots could never be cleared, making an edit impossible to
 * complete.
 */

/** the cards the board's own picker (`../ui/board-input-sheet/`) must
 * exclude: every card held by a player whose holding is an exact pair. */
export function unavailableCardsForBoard(players: readonly Player[]): readonly Card[] {
  return players.flatMap(exactHoldingCards);
}

/**
 * the cards a player's own picker (`@/features/hand-ranges/ui/
 * holding-input-sheet/`) must exclude: the board's own cards, plus every
 * *other* exact-holding player's cards. `editingPlayerId` is the id of the
 * player currently being edited, or `null` while adding a fresh one — the
 * edited player's own two cards are left out of the result (see this
 * module's own doc comment above), so they stay pickable and clearable in
 * that player's own reopened sheet.
 */
export function unavailableCardsForPlayer(
  board: Board,
  players: readonly Player[],
  editingPlayerId: string | null,
): readonly Card[] {
  const otherPlayersCards = players
    .filter((player) => player.id !== editingPlayerId)
    .flatMap(exactHoldingCards);
  return [...board, ...otherPlayersCards];
}
