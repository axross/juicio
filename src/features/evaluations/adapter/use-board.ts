import { create } from 'zustand';

import { boardsEqual, type Board } from '../model/board';

type BoardState = {
  board: Board;
};

/**
 * client state for the Analyze board — this feature's own store, following
 * `./use-players.ts` exactly (plain `create()`, a selector hook below, an
 * exported action function, no persist middleware): the board is in-memory
 * only for the app's own lifetime — see docs/specs/equity-analysis.md's The
 * Board section — nothing here is written to SQLite or `AsyncStorage`, and
 * the board is empty again after a cold start. exported (not just the hook
 * below) so a test can reset it between cases, the same reason
 * `usePlayersStore` is exported.
 */
export const useBoardStore = create<BoardState>(() => ({
  board: [],
}));

/** `../ui/analyze-screen/analyze-screen.tsx`'s own write path: called with
 * the board input sheet's submitted `Board` once it closes. skips the store
 * write entirely — not merely a same-value write — when `board` already
 * matches what's stored: `useBoardStore`'s plain vanilla `setState` notifies
 * every subscriber on every call regardless of whether the merged state
 * actually differs, so a caller resubmitting an unchanged board (closing the
 * sheet without editing anything) would otherwise still restart
 * `../adapter/use-equity-evaluation.ts`'s evaluation. */
export function setBoard(board: Board): void {
  if (boardsEqual(board, useBoardStore.getState().board)) {
    return;
  }
  useBoardStore.setState({ board });
}

/** the current board. */
export function useBoard(): Board {
  return useBoardStore((state) => state.board);
}
