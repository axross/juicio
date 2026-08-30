import type { Holding } from '@/features/hand-ranges/model/holding';

/**
 * one row of the Analyze players list (docs/specs/equity-analysis.md): a
 * submitted `Holding` plus a stable identifier of its own. the identifier
 * exists because a `Holding` alone can't serve as a list key — two players
 * may submit the identical two hole cards, or the identical hand range, and
 * both still have to render as two distinct, independently deletable rows.
 */
export type Player = {
  readonly id: string;
  readonly holding: Holding;
};

/**
 * the players list's own cap — a product rule this change introduces (the
 * maintainer's own call at the plan gate; no document before this one
 * states a maximum), not a design-file measurement. `docs/specs/
 * equity-analysis.md` records it.
 */
export const MAX_PLAYERS = 6;

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
 * appends a new player holding `holding` to `players`, in submission order
 * — "a new player is appended to the end of the list," the plan's own
 * assumption. a no-op, returning `players` unchanged, once the list is
 * already at `MAX_PLAYERS`: the screen's own affordances already remove
 * every way to reach this function at the cap (`../ui/player-list/
 * player-list.tsx` stops rendering the `New Player` row there), so this is
 * a defensive backstop, not the mechanism the cap actually relies on.
 */
export function addPlayer(players: readonly Player[], holding: Holding): readonly Player[] {
  if (players.length >= MAX_PLAYERS) {
    return players;
  }
  return [...players, { id: createPlayerId(), holding }];
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
