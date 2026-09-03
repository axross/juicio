import type { Holding } from '@/features/hand-ranges/model/holding';

/**
 * one row of the Analyze players list (docs/specs/equity-analysis.md): a
 * submitted `Holding` plus a stable identifier and a fixed, sequential
 * `number` of its own. the identifier exists because a `Holding` alone
 * can't serve as a list key — two players may submit the identical two
 * hole cards, or the identical hand range, and both still have to render
 * as two distinct, independently deletable rows. `number` is what
 * `../ui/player-row/player-row.tsx` shows as the row's own title
 * (`Player {{number}}`) — assigned once, by `nextPlayerNumber` below, at
 * the moment `addPlayer` creates this player, never recomputed from the
 * player's own position in the list: a row's title must not change just
 * because a player earlier in the list was deleted.
 */
export type Player = {
  readonly id: string;
  readonly number: number;
  readonly holding: Holding;
};

/**
 * the players list's own cap — a product rule the maintainer introduced at
 * six (issue #87's plan gate) and later lowered to three (issue #140), not a
 * design-file measurement. `docs/specs/equity-analysis.md` records it.
 */
export const MAX_PLAYERS = 3;

// a plain incrementing counter, not `crypto.randomUUID()`: this project
// bundles no polyfill for it (`expo-crypto` isn't a dependency, and
// neither Hermes nor Expo SDK 57 ships one this file could rely on without
// checking first), and the players list is in-memory only for the app's
// own lifetime (see `../adapter/use-players.ts`) — a counter reset on
// every fresh JS context is exactly as unique as this list ever needs an
// id to be, with no dependency to add for it. module-scope, not a
// parameter threaded through `addPlayer` below, so every caller gets a
// fresh id without having to supply one itself — the same reason this
// project's other id-less constructors (`../../../shared/model/
// card-pair.ts`'s `cardPair`, say) don't take one either.
let nextPlayerId = 0;

function createPlayerId(): string {
  nextPlayerId += 1;
  return `player-${nextPlayerId}`;
}

/**
 * the next player's own row number — `max(existing player numbers) + 1`,
 * which is `1` for an empty list. **derived, never a second counter**: a
 * module-scope counter alongside `nextPlayerId` above would drift from what
 * the list actually shows the moment a player is deleted and another added
 * after it (the counter keeps counting up while the visible numbers no
 * longer would), and would also renumber nothing back to `1` once the list
 * empties — `players.reduce` below reads the *current* list every time
 * instead, so removing every player and adding a fresh one always restarts
 * at `1`, and removing a player never renumbers the players around it,
 * since none of their own `number`s are touched.
 */
function nextPlayerNumber(players: readonly Player[]): number {
  return players.reduce((max, player) => Math.max(max, player.number), 0) + 1;
}

/**
 * appends a new player holding `holding` to `players`, in submission order
 * — "a new player is appended to the end of the list," the plan's own
 * assumption — numbered by `nextPlayerNumber` above. a no-op, returning
 * `players` unchanged, once the list is already at `MAX_PLAYERS`: the
 * screen's own affordances already remove every way to reach this function
 * at the cap (`../ui/analyze-screen/analyze-screen.tsx` stops rendering
 * the add-player FAB there — issue #155, `../ui/new-player-fab/
 * new-player-fab.tsx`), so this is a defensive backstop, not the mechanism
 * the cap actually relies on.
 */
export function addPlayer(players: readonly Player[], holding: Holding): readonly Player[] {
  if (players.length >= MAX_PLAYERS) {
    return players;
  }
  return [...players, { id: createPlayerId(), number: nextPlayerNumber(players), holding }];
}

/**
 * replaces the holding of the player identified by `id`, leaving its `id`,
 * its `number`, and its position in `players` all untouched — editing a
 * player (the maintainer's own on-device pass over PR #93: tapping a row's
 * preview reopens the card/range input sheet, seeded with that player's
 * current holding, and confirming it calls this) is a holding substitution
 * in place, never a delete-then-append. a no-op, returning `players` itself
 * unchanged, when `id` isn't present — the same reference-preserving
 * convention `removePlayer` below already follows, for the same reason: a
 * memoized reader downstream can rely on the reference moving only when the
 * list genuinely did. every *other* player in the returned list is the same
 * object reference as in `players`, not merely an equal one — only the
 * matched player's own entry is a new object.
 */
export function replacePlayerHolding(
  players: readonly Player[],
  id: string,
  holding: Holding,
): readonly Player[] {
  let replaced = false;
  const next = players.map((player) => {
    if (player.id !== id) {
      return player;
    }
    replaced = true;
    return { ...player, holding };
  });
  return replaced ? next : players;
}

/**
 * removes the player with the given `id` from `players`, leaving every
 * other player — including one holding an identical `Holding` — untouched.
 * returns `players` itself, the same reference, when `id` isn't present:
 * `filter` allocates unconditionally, so the length comparison is what
 * makes the no-op actually a no-op rather than merely an equal value. this
 * matches `addPlayer` above, which returns its own input unchanged at the
 * cap, and it means a memoized reader downstream can rely on the reference
 * moving only when the list genuinely did.
 */
export function removePlayer(players: readonly Player[], id: string): readonly Player[] {
  const remaining = players.filter((player) => player.id !== id);
  return remaining.length === players.length ? players : remaining;
}
