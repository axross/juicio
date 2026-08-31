import { create } from 'zustand';

import type { Board } from '../model/board';

type BoardState = {
  board: Board;
};

/**
 * client state for the Analyze board — this feature's own store, following
 * `./use-players.ts` exactly (plain `create()`, a selector hook below, an
 * exported action function, no persist middleware): the board is in-memory
 * only for the app's own lifetime, per the plan's own assumption — nothing
 * here is written to SQLite or `AsyncStorage`, and the board is empty again
 * after a cold start. exported (not just the hook below) so a test can
 * reset it between cases, the same reason `usePlayersStore` is exported.
 */
export const useBoardStore = create<BoardState>(() => ({
  board: [],
}));

/** `../ui/analyze-screen/analyze-screen.tsx`'s own write path: called with
 * the board input sheet's submitted `Board` once it closes. */
export function setBoard(board: Board): void {
  useBoardStore.setState({ board });
}

/** the current board — read by `../ui/analyze-screen/analyze-screen.tsx` to
 * pass down to `../ui/board/board.tsx`'s own `cards` prop and to seed the
 * board input sheet's `initialBoard` on reopen. */
export function useBoard(): Board {
  return useBoardStore((state) => state.board);
}
