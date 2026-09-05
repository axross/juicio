import { holdingsEqual, type Holding } from '@/features/hand-ranges/model/holding';

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
 * the players list's own cap — not a design-file measurement; see
 * docs/specs/equity-analysis.md's The Players List section for the current
 * rule.
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
// fresh id without having to supply one itself.
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
 * appends a new player holding `holding` to `players`, in submission order,
 * numbered by `nextPlayerNumber` above. a no-op, returning `players`
 * unchanged, once the list is already at `MAX_PLAYERS`: the screen's own
 * affordances already remove every way to reach this function at the cap
 * (`../ui/analyze-screen/analyze-screen.tsx` stops rendering the add-player
 * FAB there, `../ui/new-player-fab/new-player-fab.tsx`), so this is a
 * defensive backstop, not the mechanism the cap actually relies on.
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
 * player is a holding substitution in place, never a delete-then-append. a
 * no-op, returning `players` itself
 * unchanged, when `id` isn't present — the same reference-preserving
 * convention `removePlayer` below already follows, for the same reason: a
 * memoized reader downstream can rely on the reference moving only when the
 * list genuinely did. every *other* player in the returned list is the same
 * object reference as in `players`, not merely an equal one — only the
 * matched player's own entry is a new object.
 *
 * also a no-op, returning `players` itself unchanged, when the matched
 * player's own `holding` already equals `holding` (`holdingsEqual`, `@/
 * features/hand-ranges/model/holding`) — resubmitting an unchanged holding
 * (reopening the card/range input sheet and closing it again without
 * editing anything) is not an edit, and the reference-preserving contract
 * above is what a subscriber elsewhere (`../adapter/use-players.ts`'s own
 * write path) relies on to skip notifying its own store's subscribers for a
 * write that changed nothing.
 */
export function replacePlayerHolding(
  players: readonly Player[],
  id: string,
  holding: Holding,
): readonly Player[] {
  let replaced = false;
  const next = players.map((player) => {
    if (player.id !== id || holdingsEqual(player.holding, holding)) {
      return player;
    }
    replaced = true;
    return { ...player, holding };
  });
  return replaced ? next : players;
}

/**
 * moves the player at `fromIndex` to `toIndex`, leaving every other
 * player's own relative order unchanged — manual drag-to-reorder, not a
 * sort by any computed criterion: there is
 * nothing to sort *by* yet, since the equity engine that would produce a
 * rankable value doesn't exist. Neither a player's own `id` nor its
 * `number` label is touched by a move — `number` stays tied to identity
 * through a reorder exactly as it already does through a deletion (see
 * `nextPlayerNumber` above); only position changes.
 *
 * a no-op, returning `players` itself unchanged, when `fromIndex ===
 * toIndex` or when either index falls outside `players`' own bounds
 * (negative, or at or past its length, an empty list included) — the same
 * reference-preserving no-op convention `addPlayer`/`removePlayer` above
 * already follow. `../ui/player-row/player-row.tsx`'s own drag gesture
 * already clamps the index it reports to the list's own bounds before
 * this is ever called, so an out-of-range index reaching here is a
 * defensive backstop, the same status `addPlayer`'s own `MAX_PLAYERS`
 * check carries, not the mechanism this project's own clamping actually
 * relies on.
 */
export function movePlayer(
  players: readonly Player[],
  fromIndex: number,
  toIndex: number,
): readonly Player[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= players.length ||
    toIndex < 0 ||
    toIndex >= players.length
  ) {
    return players;
  }

  const next = [...players];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
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
