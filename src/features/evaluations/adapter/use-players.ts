import { create } from 'zustand';

import type { Holding } from '@/features/hand-ranges/model/holding';

import {
  addPlayer as addPlayerToList,
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
 * untouched — see `../model/player.ts`'s `replacePlayerHolding`. */
export function replacePlayerHolding(id: string, holding: Holding): void {
  usePlayersStore.setState((state) => ({
    players: replacePlayerHoldingInList(state.players, id, holding),
  }));
}

/** the current players list — read by `../ui/analyze-screen/
 * analyze-screen.tsx` to decide between the empty state and `PlayerList`. */
export function usePlayers(): readonly Player[] {
  return usePlayersStore((state) => state.players);
}
