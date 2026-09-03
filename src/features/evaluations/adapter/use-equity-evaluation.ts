import { create } from 'zustand';

import {
  startEquityJob,
  type EspadaEquityJobHandle,
  type EspadaEquityPlayerResult,
} from '@/modules/espada-engine/index';

import { boardToEquityBoardString, holdingToEquityRangeString } from '../model/equity-request';
import { useBoardStore } from './use-board';
import { usePlayersStore } from './use-players';

/** the table sizes `espada-engine`'s evaluator supports today (the plan's
 * own Assumption, `modules/espada-engine/lib/espada-internal/src/evaluator/
 * equity.rs`'s `MAX_PLAYERS = 3`) — 0/1/4/5/6 players all resolve to the
 * same `'idle'` "no result" treatment, never an error. */
const MIN_SUPPORTED_PLAYERS = 2;
const MAX_SUPPORTED_PLAYERS = 3;

/** `0` = every available core, clamped rather than rejected — see
 * `startEquityJob`'s own comment (`@/modules/espada-engine/index`) and
 * `job::clamp_thread_count`/`host_available_parallelism()`. this store never
 * detects CPU cores itself; native already does. */
const AUTO_THREAD_COUNT = 0;

export type EquityEvaluationStatusName = 'idle' | 'calculating' | 'calculated';

type EquityEvaluationState = {
  status: EquityEvaluationStatusName;
  /** the in-flight job's own completion fraction, `[0, 1]` — meaningful
   * only while `status` is `'calculating'`; `0` otherwise. */
  progress: number;
  /** one settled result per player, keyed by `Player.id` — never by array
   * index or seat position, since `startEquity`'s `players: string[]` and
   * the `results: EspadaEquityPlayerResult[]` it settles with are both
   * positional/seat-order arrays with no id of their own (see
   * `startEquityEvaluation` below, which zips the two back
   * together). meaningful only while `status` is `'calculated'`; empty
   * otherwise. */
  results: Readonly<Record<string, EspadaEquityPlayerResult>>;
  /** a monotonically-incrementing counter, bumped every time a settle
   * reports `'no-valid-runout'` (the maintainer's own standing example:
   * three players each pinned to `AA`) — the maintainer's own required
   * mechanism for a listener (the Analyze screen's toast) to detect "an
   * impossible outcome just happened" as a one-shot event, by diffing this
   * plain number against its own previous value in a `useEffect`, rather
   * than a lingering boolean state flag a screen could re-read stale. */
  impossibleSignal: number;
};

/**
 * application-global equity-evaluation state (issue #103) — the maintainer's
 * own required mechanism, decided at the plan-approval gate: a Zustand
 * store in `features/evaluations/adapter/`, this project's own and only
 * client-state library for exactly this kind of state
 * (docs/conventions/directory-structure.md's "zustand is this project's
 * only client-state library" / "`core/` MUST NOT hold feature-specific
 * domain logic"), not a React Context — a module-scope store needs no
 * provider mounted anywhere to be reachable, which is what lets any part of
 * the app import this module and read or drive an evaluation, not only the
 * Analyze screen's own component tree (`use-equity-evaluation.test.ts`'s own
 * "callable with no component render and no provider" test is what proves
 * this holds). `create()` with no persist middleware, mirroring `./
 * use-board.ts`/`./use-players.ts` exactly — this state is derived from
 * those two stores' own contents (see the module-scope reaction below), so
 * it needs no persistence of its own either. exported (not just the
 * selector hooks below) so a test can reset it between cases, the same
 * reason `useBoardStore`/`usePlayersStore` are.
 *
 * this store's primary mechanism is the automatic reactive path below
 * (`startEquityEvaluation`, subscribed to `useBoardStore`/`usePlayersStore`
 * at module scope) — ordinary callers never need to invoke anything here
 * directly, since adding or removing a player, or changing the board,
 * already starts, restarts, or cancels an evaluation on its own. issue
 * #103's own acceptance criteria additionally require that this store's
 * "status, latest result, and start/cancel functions are readable and
 * callable" as part of its public surface, independent of that automatic
 * behaviour — so `startEquityEvaluation`/`cancelEquityEvaluation` are
 * exported below on top of (not instead of) the reactive path, specifically
 * so a caller outside the Analyze feature's own component tree can start or
 * cancel an evaluation directly, the same way `useEquityEvaluationStatus`/
 * `usePlayerEquityResult` already let one read it directly.
 */
export const useEquityEvaluationStore = create<EquityEvaluationState>(() => ({
  status: 'idle',
  progress: 0,
  results: {},
  impossibleSignal: 0,
}));

/** the job this store is currently driving, or `null` while idle or between
 * a cancel and its own settle — module scope, not store state, since
 * nothing outside this module ever needs to read a job handle directly; the
 * store's own `status`/`progress`/`results` are the public surface. also
 * this store's own stale-settle guard: a job's `result` promise settling
 * after a newer job has already replaced it here (`activeJob !== job` at
 * settle time) is ignored outright, so a slow-to-settle superseded job can
 * never overwrite a newer job's state — the maintainer's own required
 * mechanism. */
let activeJob: EspadaEquityJobHandle | null = null;

/**
 * the public entry point that both this store's own module-scope reaction
 * and any external caller use to (re)start an evaluation — the maintainer's
 * own required mechanism: subscribed directly below to
 * `useBoardStore`/`usePlayersStore` (`.subscribe(listener)`, zustand
 * 5.0.15's own vanilla `StoreApi` — `(state: T, prevState: T) => void`,
 * unused here since every call reads both stores' current state via
 * `.getState()` rather than diffing what changed) at module scope, not from
 * a React `useEffect` inside a component — this is what makes "starts when
 * the situation is ready," "restarts on every player or board change," and
 * "cancels outside the 2–3 window" all happen automatically the moment this
 * module is imported anywhere, with zero React tree involvement and zero
 * provider. exported under this name (rather than left as a private
 * `reactToBoardOrPlayersChange`) so it also stands as this store's own
 * public "start" function — issue #103's own acceptance criteria require
 * one, on top of the automatic reactive behaviour above; see this module's
 * own top-level doc comment on `useEquityEvaluationStore`.
 *
 * runs unconditionally whenever called — on every board or players change,
 * and equally on a direct external call: cancels and releases any in-flight
 * job first, no matter what the new situation turns out to be (the
 * maintainer's own required step), then either settles into `'idle'`
 * (outside the 2–3 player window) or serializes the current board and every
 * player's holding and starts a fresh job. contrast `cancelEquityEvaluation`
 * below, which cancels without this restart.
 */
export function startEquityEvaluation(): void {
  const previousJob = activeJob;
  activeJob = null;
  if (previousJob !== null) {
    previousJob.cancel();
    previousJob.release();
  }

  const players = usePlayersStore.getState().players;
  const board = useBoardStore.getState().board;

  if (players.length < MIN_SUPPORTED_PLAYERS || players.length > MAX_SUPPORTED_PLAYERS) {
    useEquityEvaluationStore.setState({ status: 'idle', progress: 0, results: {} });
    return;
  }

  useEquityEvaluationStore.setState({ status: 'calculating', progress: 0, results: {} });

  // seat order, zipped back against each player's own `id` once the job
  // settles below — `startEquity`'s own `players: string[]` and the
  // `results: EspadaEquityPlayerResult[]` it settles with are both
  // positional arrays with no id of their own.
  const playerIds = players.map((player) => player.id);
  const boardString = boardToEquityBoardString(board);
  const rangeStrings = players.map((player) => holdingToEquityRangeString(player.holding));

  const job = startEquityJob(boardString, rangeStrings, AUTO_THREAD_COUNT, (progress) => {
    if (activeJob !== job) {
      return; // a superseded job's own late progress event — ignore it.
    }
    useEquityEvaluationStore.setState({ progress });
  });
  activeJob = job;

  job.result.then((outcome) => {
    if (activeJob !== job) {
      return; // stale-settle guard — see this function's own doc comment.
    }
    activeJob = null;

    switch (outcome.status) {
      case 'success': {
        const results: Record<string, EspadaEquityPlayerResult> = {};
        outcome.results.forEach((result, index) => {
          const playerId = playerIds[index];
          if (playerId !== undefined) {
            results[playerId] = result;
          }
        });
        useEquityEvaluationStore.setState({ status: 'calculated', progress: 1, results });
        return;
      }
      case 'no-valid-runout':
        // a genuine finding about the input, not a fault (the standing
        // example: three players each pinned to `AA`) — reported through
        // `impossibleSignal` rather than left as a lingering error state;
        // `../ui/analyze-screen/analyze-screen.tsx` is what turns this into
        // a toast.
        useEquityEvaluationStore.setState((state) => ({
          status: 'idle',
          progress: 0,
          results: {},
          impossibleSignal: state.impossibleSignal + 1,
        }));
        return;
      case 'cancelled':
      case 'unsupported-player-count':
      case 'internal':
      default:
        // `cancelled` is expected here — this store's own restart logic
        // cancels its previous job on every change — and not an error to
        // surface. `unsupported-player-count` and `internal` reaching this
        // far would mean either this store's own 2–3 gating above or the
        // native layer itself misbehaved; the plan's own gating should make
        // both unreachable in normal operation, so neither is treated as
        // anything but the same idle "no result" state the below-2/above-3
        // case already uses.
        useEquityEvaluationStore.setState({ status: 'idle', progress: 0, results: {} });
    }
  });
}

useBoardStore.subscribe(startEquityEvaluation);
usePlayersStore.subscribe(startEquityEvaluation);
// syncs this store with whatever `useBoardStore`/`usePlayersStore` already
// hold at the moment this module is first imported — `.subscribe` alone
// only fires on a *future* change, and this module can be imported after
// either store already holds state (e.g. a hot reload, or a future caller
// that imports this module lazily), so this store must not start out
// stale relative to them.
startEquityEvaluation();

/**
 * cancels any in-flight evaluation and settles this store into `'idle'`
 * (progress `0`, empty results) — WITHOUT restarting, unlike
 * `startEquityEvaluation`/the reactive path above, which always tries to
 * restart based on the current board/players state right after cancelling.
 * this store stays `'idle'` until the next board/players change or the next
 * explicit `startEquityEvaluation()` call; nothing here resubscribes or
 * schedules one on its own. exported specifically as this store's own
 * public "cancel" function — see this module's own top-level doc comment on
 * `useEquityEvaluationStore` for why it exists on top of the automatic
 * reactive behaviour. reuses `activeJob`'s own cancel-and-release pattern
 * (see the top of `startEquityEvaluation` above) rather than a separate
 * cancellation path; a no-op, beyond settling `'idle'` again, when no job is
 * currently in flight.
 */
export function cancelEquityEvaluation(): void {
  const previousJob = activeJob;
  activeJob = null;
  if (previousJob !== null) {
    previousJob.cancel();
    previousJob.release();
  }

  useEquityEvaluationStore.setState({ status: 'idle', progress: 0, results: {} });
}

/** the whole evaluation status — for `../ui/analyze-screen/
 * analyze-screen.tsx`'s own progress bar, which needs to know only whether
 * a job is in flight. */
export function useEquityEvaluationStatus(): EquityEvaluationStatusName {
  return useEquityEvaluationStore((state) => state.status);
}

/** the in-flight job's own completion fraction, `[0, 1]` — meaningful only
 * while `useEquityEvaluationStatus()` reads `'calculating'`; `0` otherwise. */
export function useEquityEvaluationProgress(): number {
  return useEquityEvaluationStore((state) => state.progress);
}

/** the impossible-situation one-shot signal — see `impossibleSignal`'s own
 * doc comment on `EquityEvaluationState` above. `../ui/analyze-screen/
 * analyze-screen.tsx` diffs this against its own previous value to decide
 * whether to raise the toast. */
export function useImpossibleSignal(): number {
  return useEquityEvaluationStore((state) => state.impossibleSignal);
}

/**
 * one player's own settled result, by `Player.id` — `null` whenever no
 * result is currently available for that player (fewer than 2 players, more
 * than 3, an evaluation in flight, or none yet attempted), for
 * `../ui/player-row/player-row.tsx` and `../ui/equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` to read. a per-id selector via zustand's own
 * selector-argument overload — the natural way to read one player's own
 * slice without forcing every row to re-render on every other row's own
 * update — rather than a memoized map or a second store shape; this
 * codebase has no existing precedent for anything more elaborate than a
 * plain selector, and this needs nothing more.
 */
export function usePlayerEquityResult(playerId: string): EspadaEquityPlayerResult | null {
  return useEquityEvaluationStore((state) => state.results[playerId] ?? null);
}
