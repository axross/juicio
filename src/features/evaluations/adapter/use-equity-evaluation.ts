import { create } from 'zustand';

import i18next from '@/core/i18n';
import { reportError } from '@/core/instrumentation/report-error';
import { saveHistoryEntry } from '@/features/history/adapter/history-entries-store';
import type { HistoryEntryPlayer } from '@/features/history/model/history-entry';
import {
  startEquityJob,
  type EspadaEquityJobHandle,
  type EspadaEquityPlayerResult,
} from '@/modules/espada-engine/index';

import {
  boardToEquityBoardString,
  equitySituationKey,
  holdingToEquityRangeString,
} from '../model/equity-request';
import { useBoardStore } from './use-board';
import { usePlayersStore } from './use-players';

/** the table sizes `espada-engine`'s evaluator supports today
 * (`modules/espada-engine/lib/espada-internal/src/evaluator/equity.rs`'s
 * `MAX_PLAYERS = 3`) — 0/1/4/5/6 players all resolve to the same `'idle'`
 * "no result" treatment, never an error. */
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
  /** each player's own result, keyed by `Player.id` — never by array index
   * or seat position, since `startEquity`'s `players: string[]` and the
   * `results: EspadaEquityPlayerResult[]` (settled) / `players:
   * EspadaEquityPlayerResult[] | undefined` (in-flight progress) it reports
   * are all positional/seat-order arrays with no id of their own (see
   * `startEquityEvaluation` below, which zips each one back against
   * `playerIds`). while `status` is `'calculating'`, this already carries
   * whatever live, still-updating numbers the native engine has reported so
   * far — a given player's own entry appears the moment the first progress
   * tick carries one for them, and keeps being replaced by every later
   * tick's own number, not merely inserted once. While `status` is
   * `'calculated'`, every entry is the job's own final, settled number.
   * Empty only before the first per-player progress tick of a fresh
   * evaluation, and
   * again once `status` reads `'idle'` (no evaluation in the 2–3 player
   * window, one restarting, or one cancelled). */
  results: Readonly<Record<string, EspadaEquityPlayerResult>>;
  /** a monotonically-incrementing counter, bumped every time a settle
   * reports `'no-valid-runout'` (three players each pinned to `AA`, for
   * instance) — lets a listener (the Analyze screen's toast) detect "an
   * impossible outcome just happened" as a one-shot event, by diffing this
   * plain number against its own previous value in a `useEffect`, rather
   * than a lingering boolean state flag a screen could re-read stale. */
  impossibleSignal: number;
};

/**
 * application-global equity-evaluation state: a Zustand
 * store in `features/evaluations/adapter/`, this project's own and only
 * client-state library for exactly this kind of state
 * (docs/conventions/directory-structure.md's "zustand is this project's
 * only client-state library" / "`core/` MUST NOT hold feature-specific
 * domain logic"), not a React Context — see
 * docs/decisions/2026-09-05-drive-the-equity-evaluation-store-as-a-plain-module-scope-store.md
 * for why. a module-scope store needs no
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
 * already starts, restarts, or cancels an evaluation on its own.
 * `startEquityEvaluation`/`cancelEquityEvaluation` are
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
 * never overwrite a newer job's state. */
let activeJob: EspadaEquityJobHandle | null = null;

/**
 * the `equitySituationKey` (`../model/equity-request.ts`) that the last call
 * to `startEquityEvaluation` processed — whether or not that call actually
 * started a job, since the 2–3 player window can turn that call into a
 * settle-to-`'idle'` instead — or `null` before this module has ever
 * processed one. this store's own reorder-skip gate: `startEquityEvaluation`
 * below compares the incoming board/players' own key against this before
 * doing anything else, and returns immediately, touching neither
 * `activeJob` nor `useEquityEvaluationStore`'s own state, when the two
 * match — a reorder alone never changes this key (`equitySituationKey`'s
 * own doc comment), so a drag that reshuffles the players list without
 * touching any id, holding, or the board leaves an in-flight job running
 * and a settled result exactly as they were. `cancelEquityEvaluation` below
 * resets this to `null`, since a cancelled evaluation, unlike a settled one,
 * has no result left standing to protect from being masked by a matching
 * key.
 */
let lastStartedKey: string | null = null;

/**
 * the public entry point that both this store's own module-scope reaction
 * and any external caller use to (re)start an evaluation: subscribed
 * directly below to
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
 * public "start" function, on top of the automatic reactive behaviour
 * above; see this module's own top-level doc comment on
 * `useEquityEvaluationStore`.
 *
 * **A call that names the exact same board and the exact same set of
 * `{player id, holding}` pairs the currently active or most recently settled
 * calculation was already started for is a no-op** — checked first, against
 * `lastStartedKey` above, before anything else here
 * runs: neither `activeJob` nor `useEquityEvaluationStore`'s own state is
 * touched, so an in-flight job keeps running and a settled result keeps
 * showing exactly as it was. A players-list reorder alone never changes
 * that key (`equitySituationKey`'s own doc comment, `../model/
 * equity-request.ts`), which is what makes a drag-to-reorder skip a restart
 * here while every genuine change — a different holding, a different
 * board, a different set of ids — still reaches the rest of this function
 * and restarts exactly as before.
 *
 * beyond that check, this runs unconditionally whenever called — on every
 * board or players change, and equally on a direct external call: cancels
 * and releases any in-flight job first, no matter what the new situation
 * turns out to be, then either
 * settles into `'idle'` (outside the 2–3 player window) or serializes the
 * current board and every player's holding and starts a fresh job.
 * contrast `cancelEquityEvaluation` below, which cancels without this
 * restart.
 *
 * **the job's own `onProgress` callback also writes live
 * results, not only `progress`.** `startEquityJob`'s own `onProgress`
 * carries an optional per-player array alongside the completion fraction —
 * present only once the native engine has accumulated at least some data
 * for every player as of that tick, `undefined` otherwise (see
 * `modules/espada-engine/src/equity-job.ts`'s own comment). When it is
 * present, this zips it against the same `playerIds` the settle handler
 * below already zips its own final `results` against, and merges the
 * outcome into `results` — the exact same "positional array has no id of
 * its own" pattern, run early and repeatedly instead of once at the end.
 * When it is `undefined`, only `progress` is written: `results` is left
 * exactly as it was, so a number a row is already showing is never wiped
 * back to "no result" by a tick that simply has nothing new yet.
 */
export function startEquityEvaluation(): void {
  const players = usePlayersStore.getState().players;
  const board = useBoardStore.getState().board;

  const situationKey = equitySituationKey(board, players);
  if (situationKey === lastStartedKey) {
    return; // a reorder-only change — see this function's own doc comment.
  }
  lastStartedKey = situationKey;

  const previousJob = activeJob;
  activeJob = null;
  if (previousJob !== null) {
    previousJob.cancel();
    previousJob.release();
  }

  if (players.length < MIN_SUPPORTED_PLAYERS || players.length > MAX_SUPPORTED_PLAYERS) {
    useEquityEvaluationStore.setState({ status: 'idle', progress: 0, results: {} });
    return;
  }

  useEquityEvaluationStore.setState({ status: 'calculating', progress: 0, results: {} });

  // seat order, zipped back against each player's own `id` both by every
  // live progress tick below and once the job settles further down —
  // `startEquity`'s own `players: string[]` and the `results`/`players`
  // arrays it reports (settled and in-flight alike) are all positional
  // arrays with no id of their own.
  const playerIds = players.map((player) => player.id);
  const boardString = boardToEquityBoardString(board);
  const rangeStrings = players.map((player) => holdingToEquityRangeString(player.holding));

  const job = startEquityJob(
    boardString,
    rangeStrings,
    AUTO_THREAD_COUNT,
    (progress, playerResults) => {
      if (activeJob !== job) {
        return; // a superseded job's own late progress event — ignore it.
      }
      // `playerResults` is `undefined` on a tick with nothing new yet (see
      // this function's own doc comment) — `progress` alone is written then,
      // leaving `results` exactly as it was rather than wiping a
      // still-showing number back to empty. named apart from the outer
      // `players` (this function's own `Player[]` from `usePlayersStore`,
      // captured above into `playerIds`) so the two are never confused.
      if (playerResults === undefined) {
        useEquityEvaluationStore.setState({ progress });
        return;
      }
      useEquityEvaluationStore.setState((state) => {
        const results = { ...state.results };
        playerResults.forEach((result, index) => {
          const playerId = playerIds[index];
          if (playerId !== undefined) {
            results[playerId] = result;
          }
        });
        return { progress, results };
      });
    },
  );
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

        // saves a new History Entry the instant this evaluation's result
        // becomes available — automatic, no explicit
        // save action, and reached only through this one branch: every
        // other outcome below falls back to `'idle'` without ever getting
        // here, and the stale-settle guard above (`activeJob !== job`)
        // already discarded a superseded job's own settle before this
        // point, so neither can ever produce a History Entry. built from
        // `usePlayersStore`'s own *current* players, read fresh here, rather
        // than this function's own `players` closure captured before the job
        // started: a players-list reorder alone never restarts a running
        // job (this store's own reorder-skip gate above), so by the time a
        // job started before such a reorder settles, that closure's own seat
        // order can already disagree with what the screen the entry is meant
        // to describe is actually showing — reading current order here is
        // what keeps a saved entry's seat order matching the screen
        // regardless of a reorder mid-flight. each current player's own
        // result is looked up from `results` (the same id-keyed map built
        // just above) by `id` rather than by position — `.flatMap` skips a
        // player whose id isn't in that map, which the reorder-skip gate
        // guarantees never actually happens: a genuine id/holding-set change
        // would already have replaced `activeJob` before this callback runs,
        // tripping the stale-settle guard above first. `player.holding`
        // (`Holding`, `@/features/hand-ranges/model/holding.ts`) is assigned
        // into a field typed `HistoryEntryHolding` (`@/features/history/
        // model/history-entry.ts`) with no cast: the two types are
        // structurally identical by design, so this feature never imports
        // `Holding` (see that module's own doc comment).
        const historyPlayers: readonly HistoryEntryPlayer[] = usePlayersStore
          .getState()
          .players.flatMap((player) => {
            const result = results[player.id];
            if (result === undefined) {
              return [];
            }
            return [
              {
                holding: player.holding,
                result,
                // the exact rendered "Player N" display string `../ui/
                // player-row/player-row.tsx` shows for this player, frozen
                // at save time — `i18next.t(...)` rather than
                // `useTranslation()`'s own `t`, since this module is not a
                // React component and has no hook to call; the explicit
                // `analyze:` namespace prefix is required because this
                // instance's own `defaultNS` is `navigation` (`@/core/i18n`'s
                // own config), not `analyze`.
                name: i18next.t('analyze:playerRow.title', { number: player.number }),
              },
            ];
          });
        try {
          saveHistoryEntry({ calculatedAt: Date.now(), board, players: historyPlayers });
        } catch (error) {
          reportError(error, {
            tags: { feature: 'history' },
            extra: { playerCount: players.length },
          });
        }
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
        // native layer itself misbehaved; that same 2–3 gating should
        // already make both unreachable in normal operation, so neither is
        // treated as anything but the same idle "no result" state the
        // below-2/above-3 case already uses.
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
 * (progress `0`, empty results), with no restart — unlike
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
 * currently in flight. also resets `lastStartedKey` to `null` — a cancelled
 * evaluation leaves no result standing that a matching key should protect,
 * so the very next `startEquityEvaluation()` call must restart even if the
 * board and players are still exactly what the cancelled job was started
 * for, rather than reading as a reorder-only no-op against a calculation
 * that no longer exists.
 */
export function cancelEquityEvaluation(): void {
  const previousJob = activeJob;
  activeJob = null;
  if (previousJob !== null) {
    previousJob.cancel();
    previousJob.release();
  }
  lastStartedKey = null;

  useEquityEvaluationStore.setState({ status: 'idle', progress: 0, results: {} });
}

/** the whole evaluation status — for `../ui/analyze-screen/
 * analyze-screen.tsx`'s own progress bar, which needs to know only whether
 * a job is in flight. */
export function useEquityEvaluationStatus(): EquityEvaluationStatusName {
  return useEquityEvaluationStore((state) => state.status);
}

/** the impossible-situation one-shot signal — see `impossibleSignal`'s own
 * doc comment on `EquityEvaluationState` above. `../ui/analyze-screen/
 * analyze-screen.tsx` diffs this against its own previous value to decide
 * whether to raise the toast. */
export function useImpossibleSignal(): number {
  return useEquityEvaluationStore((state) => state.impossibleSignal);
}

/**
 * one player's own result, by `Player.id` — `null` whenever no result is
 * currently available for that player (fewer than 2 players, more than 3,
 * or an evaluation not yet far enough along to have reported one), for
 * `../ui/player-row/player-row.tsx` and `../ui/equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` to read. **returns non-`null` before the
 * evaluation settles**: this already returns non-`null` while the
 * evaluation is still `'calculating'`, the moment the first progress tick
 * reports a number for
 * this player, and keeps returning whatever the latest tick reported —
 * still live and still subject to change — right up until the job settles
 * into the same final number. a caller reading this has no way to tell a
 * live, still-updating number from a settled one from the value alone; see
 * `useEquityEvaluationStatus()` if that distinction matters. a per-id
 * selector via zustand's own selector-argument overload — the natural way
 * to read one player's own slice without forcing every row to re-render on
 * every other row's own update — rather than a memoized map or a second
 * store shape; this codebase has no existing precedent for anything more
 * elaborate than a plain selector, and this needs nothing more.
 */
export function usePlayerEquityResult(playerId: string): EspadaEquityPlayerResult | null {
  return useEquityEvaluationStore((state) => state.results[playerId] ?? null);
}
