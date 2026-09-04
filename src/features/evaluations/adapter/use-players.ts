import { create } from 'zustand';

import type { Holding } from '@/features/hand-ranges/model/holding';

import {
  addPlayer as addPlayerToList,
  movePlayer as movePlayerInList,
  removePlayer as removePlayerFromList,
  replacePlayerHolding as replacePlayerHoldingInList,
  type Player,
} from '../model/player';

type PlayersState = {
  players: readonly Player[];
};

/**
 * client state for the Analyze players list — this feature's own store,
 * following `src/features/settings/adapter/use-theme-preference.ts` exactly
 * (plain `create()`, a selector hook below, exported action functions, no
 * persist middleware): the list is in-memory only for the app's own
 * lifetime, per the plan's own assumption — nothing here is written to
 * SQLite or `AsyncStorage`, and the list is empty again after a cold
 * start. exported (not just the hook below) so a test can reset it between
 * cases, the same reason `useThemePreferenceStore` is exported.
 */
export const usePlayersStore = create<PlayersState>(() => ({
  players: [],
}));

/** `../ui/analyze-screen/analyze-screen.tsx`'s own write path: called with
 * the sheet's submitted `Holding` once it closes. */
export function addPlayer(holding: Holding): void {
  usePlayersStore.setState((state) => ({ players: addPlayerToList(state.players, holding) }));
}

/** `../ui/player-row/player-row.tsx`'s own swipe-to-delete and
 * accessibility-action paths reach this only through `../ui/player-list/
 * player-list.tsx`'s callback — `PlayerRow` itself holds no store
 * reference, per its own doc comment. */
export function removePlayer(id: string): void {
  usePlayersStore.setState((state) => ({ players: removePlayerFromList(state.players, id) }));
}

/** `../ui/analyze-screen/analyze-screen.tsx`'s own write path for editing:
 * called with the player being edited's own `id` and the card/range input
 * sheet's re-submitted `Holding`, once that sheet closes. leaves every
 * other player, and the edited player's own `id`/`number`/position,
 * untouched — see `../model/player.ts`'s `replacePlayerHolding`. skips the
 * store write entirely — not merely a same-value write — when that model
 * function's result is the very same `players` reference it was called with
 * (a genuine no-op, whether because `id` isn't present or the holding is
 * unchanged): `usePlayersStore`'s plain vanilla `setState` notifies every
 * subscriber on every call regardless of whether the merged state actually
 * differs, so writing through a genuine no-op would otherwise still restart
 * `../adapter/use-equity-evaluation.ts`'s evaluation. */
export function replacePlayerHolding(id: string, holding: Holding): void {
  const players = usePlayersStore.getState().players;
  const next = replacePlayerHoldingInList(players, id, holding);
  if (next === players) {
    return;
  }
  usePlayersStore.setState({ players: next });
}

export function movePlayer(fromIndex: number, toIndex: number): void {
  usePlayersStore.setState((state) => ({
    players: movePlayerInList(state.players, fromIndex, toIndex),
  }));
}

/** `../ui/player-list/player-list.tsx`'s own wiring for `../ui/player-row/
 * player-row.tsx`'s own `onReorder` — called potentially several times
 * over one held drag, live, as it crosses further rows' own midpoints
 * (issue #153's own plan), not once at the very end. Each call resolves
 * `fromIndex` fresh from the store's own current state, by `id`, rather
 * than from a caller's own (potentially stale) closure over an index: a
 * live reorder can move a player between two calls faster than a caller
 * re-renders with a fresh index, and a stale index would then call
 * `movePlayer` against a position this player no longer holds. A no-op if
 * `id` no longer names a player in the list. */
export function movePlayerById(id: string, toIndex: number): void {
  const fromIndex = usePlayersStore.getState().players.findIndex((player) => player.id === id);
  if (fromIndex !== -1) {
    movePlayer(fromIndex, toIndex);
  }
}

/** the current players list — read by `../ui/analyze-screen/
 * analyze-screen.tsx` to decide between the empty state and `PlayerList`. */
export function usePlayers(): readonly Player[] {
  return usePlayersStore((state) => state.players);
}
