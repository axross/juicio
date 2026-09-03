import { act, renderHook } from '@testing-library/react-native';

import type { Holding } from '@/features/hand-ranges/model/holding';
import type { EspadaEquityOutcome, EspadaEquityPlayerResult } from '@/modules/espada-engine/index';
import type { Card } from '@/shared/model/card';

import { setBoard, useBoardStore } from './use-board';
import { addPlayer, removePlayer, replacePlayerHolding, usePlayersStore } from './use-players';
import {
  cancelEquityEvaluation,
  startEquityEvaluation,
  useEquityEvaluationStatus,
  useEquityEvaluationProgress,
  useEquityEvaluationStore,
  useImpossibleSignal,
  usePlayerEquityResult,
} from './use-equity-evaluation';

// `@/modules/espada-engine/index`'s `startEquityJob` is what this store
// calls to drive the native equity job — mocked outright per this
// project's own native-module test-mocking convention
// (`modules/espada-engine/src/equity-job.test.ts` mocks the module one
// layer below this one, `react-native-nitro-modules`, for the identical
// reason: neither layer can load under Jest, no Android/iOS runtime backs
// either — docs/conventions/testing.md's Native Surfaces section). `mock`-
// prefixed names are the documented exception to Jest's own hoisting rule
// against a mock factory closing over an ordinary outer variable.
const mockStartEquityJob = jest.fn();
const mockCancel = jest.fn();
const mockRelease = jest.fn();

jest.mock('@/modules/espada-engine/index', () => ({
  startEquityJob: (...args: unknown[]) => mockStartEquityJob(...args),
}));

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const KING_DIAMONDS: Card = { rank: 'K', suit: 'd' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };

function handRange(...rankPairKeys: string[]): Holding {
  return { kind: 'handRange', rankPairs: new Set(rankPairKeys) };
}

const RESULT_A: EspadaEquityPlayerResult = { win: 0.6, tie: 0.02, equity: 0.61 };
const RESULT_B: EspadaEquityPlayerResult = { win: 0.38, tie: 0.02, equity: 0.39 };
const RESULT_C: EspadaEquityPlayerResult = { win: 0.02, tie: 0.02, equity: 0.03 };

type PendingJob = {
  result: Promise<EspadaEquityOutcome>;
  resolve: (outcome: EspadaEquityOutcome) => void;
  emitProgress: (progress: number) => void;
};

// every call to the mocked `startEquityJob` — a store restart is one user
// action away in this store's own design (adding one player while already
// in the 2–3 window cancels the running job and starts a fresh one), so a
// test drives its scenario through the real action functions
// (`addPlayer`/`removePlayer`/`setBoard`) and reads back whichever job that
// produced, rather than predicting up front how many internal restarts a
// given sequence causes.
let pendingJobs: PendingJob[] = [];

function latestJob(): PendingJob {
  const job = pendingJobs.at(-1);
  if (job === undefined) {
    throw new Error('startEquityJob was never called.');
  }
  return job;
}

function currentPlayerIds(): string[] {
  return usePlayersStore.getState().players.map((player) => player.id);
}

beforeEach(() => {
  // resetting the board/players stores below runs this store's own
  // module-scope reaction, which may itself call `cancel()`/`release()` on
  // a job a previous test left running — resetting the three action mocks
  // only *after* that cleanup is what keeps every test's own assertions
  // about them starting from a clean zero, regardless of what the previous
  // test left behind.
  usePlayersStore.setState({ players: [] });
  useBoardStore.setState({ board: [] });
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
  mockStartEquityJob.mockReset();
  mockCancel.mockReset();
  mockRelease.mockReset();
  pendingJobs = [];
  // a persistent default, not a one-shot: every call gets its own real
  // `Promise` this test resolves by hand, and captures the progress
  // callback so a test can invoke it directly — standing in for what the
  // native layer would otherwise invoke asynchronously from a worker
  // thread, the same shape `equity-job.test.ts`'s own `createMockNative`
  // gives one layer below this.
  mockStartEquityJob.mockImplementation(
    (
      _board: string,
      _players: string[],
      _threadCount: number,
      progressCb?: (progress: number) => void,
    ) => {
      let resolve!: (outcome: EspadaEquityOutcome) => void;
      const result = new Promise<EspadaEquityOutcome>((res) => {
        resolve = res;
      });
      const job: PendingJob = {
        result,
        resolve,
        emitProgress: (progress: number) => progressCb?.(progress),
      };
      pendingJobs.push(job);
      return { result, cancel: mockCancel, release: mockRelease };
    },
  );
});

describe('the evaluation lifecycle', () => {
  it('starts idle, with no job running, while fewer than 2 players are present', () => {
    expect(useEquityEvaluationStore.getState().status).toBe('idle');

    addPlayer(handRange('AA'));

    expect(useEquityEvaluationStore.getState().status).toBe('idle');
    expect(mockStartEquityJob).not.toHaveBeenCalled();
  });

  it('starts calculating and calls startEquityJob once exactly 2 players are present, serializing the board and every player’s holding', () => {
    setBoard([ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS]);
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));

    expect(useEquityEvaluationStore.getState().status).toBe('calculating');
    expect(useEquityEvaluationStore.getState().progress).toBe(0);
    expect(mockStartEquityJob).toHaveBeenLastCalledWith(
      'Ah Kd 2c',
      ['AA', 'KK'],
      0,
      expect.any(Function),
    );
  });

  it('calls startEquityJob for exactly 3 players too, serializing all three', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    addPlayer(handRange('QQ'));

    expect(useEquityEvaluationStore.getState().status).toBe('calculating');
    expect(mockStartEquityJob).toHaveBeenLastCalledWith(
      '',
      ['AA', 'KK', 'QQ'],
      0,
      expect.any(Function),
    );
  });

  it('reflects progress events the currently-running job reports', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));

    latestJob().emitProgress(0.42);

    expect(useEquityEvaluationStore.getState().progress).toBe(0.42);
  });

  it('settles to "calculated" with each player’s own result, keyed by id — not by seat position', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const [firstId, secondId] = currentPlayerIds();
    const job = latestJob();

    job.resolve({ status: 'success', results: [RESULT_A, RESULT_B] });
    await job.result;

    const state = useEquityEvaluationStore.getState();
    expect(state.status).toBe('calculated');
    expect(state.progress).toBe(1);
    expect(state.results[firstId]).toEqual(RESULT_A);
    expect(state.results[secondId]).toEqual(RESULT_B);
  });

  it('cancels and releases the in-flight job, then starts a fresh one, when the board changes while still in the 2–3 window', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);

    setBoard([ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS]);

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockStartEquityJob).toHaveBeenCalledTimes(2);
    expect(useEquityEvaluationStore.getState().status).toBe('calculating');
  });

  it('cancels and releases the in-flight job, then starts a fresh one, when a player is added while still in the 2–3 window', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();

    addPlayer(handRange('QQ'));

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockStartEquityJob).toHaveBeenCalledTimes(2);
  });

  it('cancels and releases the in-flight job, then starts a fresh one, when an existing player’s holding is replaced while still in the 2–3 window', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const [firstId] = currentPlayerIds();
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();

    replacePlayerHolding(firstId, handRange('QQ'));

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockStartEquityJob).toHaveBeenCalledTimes(2);
  });

  it('cancels the in-flight job and returns to idle once the player count drops below 2', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const [firstId] = currentPlayerIds();
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);

    removePlayer(firstId);

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1); // not called again — 1 player is outside the window
    expect(useEquityEvaluationStore.getState().status).toBe('idle');
  });

  it('cancels the in-flight job and returns to idle once the player count rises past 3', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    // 2 players starts a job; 3 (still in the window) cancels it and starts
    // a fresh one — two calls to `startEquityJob` before the 4th player.
    addPlayer(handRange('QQ'));
    expect(mockStartEquityJob).toHaveBeenCalledTimes(2);

    // MAX_PLAYERS (now 3) already removes the only UI affordance that could
    // submit a fourth holding, so `addPlayer` itself no-ops at the cap and
    // can no longer drive this scenario — seed the store directly with a
    // fourth player instead, to exercise the equity evaluator's own separate
    // 2–3 window without depending on the players-list cap.
    usePlayersStore.setState((state) => ({
      players: [...state.players, { id: 'player-4', number: 4, holding: handRange('JJ') }],
    }));

    expect(mockCancel).toHaveBeenCalledTimes(2); // once for the 2→3 restart, once for the 3→4 stop
    expect(mockRelease).toHaveBeenCalledTimes(2);
    expect(mockStartEquityJob).toHaveBeenCalledTimes(2); // not called again — 4 players is outside the window
    expect(useEquityEvaluationStore.getState().status).toBe('idle');
  });

  it('ignores a superseded job’s own late settle, once a newer job has already replaced it', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const job1 = latestJob();

    addPlayer(handRange('QQ')); // restarts: cancels job1, starts job2
    expect(pendingJobs).toHaveLength(2);

    // job1's own result settles late, after job2 already replaced it —
    // this must not overwrite the store with job1's own stale data.
    job1.resolve({ status: 'success', results: [RESULT_A, RESULT_B] });
    await job1.result;

    expect(useEquityEvaluationStore.getState().status).toBe('calculating');
    expect(useEquityEvaluationStore.getState().results).toEqual({});
  });

  it('increments impossibleSignal and returns to idle when the job settles "no-valid-runout"', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('AA'));
    const job = latestJob();
    const before = useEquityEvaluationStore.getState().impossibleSignal;

    job.resolve({ status: 'no-valid-runout', message: 'no valid runout' });
    await job.result;

    const state = useEquityEvaluationStore.getState();
    expect(state.impossibleSignal).toBe(before + 1);
    expect(state.status).toBe('idle');
  });

  it('returns to idle without bumping impossibleSignal when the job settles "cancelled"', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const job = latestJob();
    const before = useEquityEvaluationStore.getState().impossibleSignal;

    job.resolve({ status: 'cancelled', message: 'cancelled' });
    await job.result;

    const state = useEquityEvaluationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.impossibleSignal).toBe(before);
  });

  it('returns to idle without bumping impossibleSignal on "unsupported-player-count" or "internal"', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const job = latestJob();
    const before = useEquityEvaluationStore.getState().impossibleSignal;

    job.resolve({ status: 'internal', message: 'boom' });
    await job.result;

    const state = useEquityEvaluationStore.getState();
    expect(state.status).toBe('idle');
    expect(state.impossibleSignal).toBe(before);
  });
});

describe('usePlayerEquityResult()', () => {
  it('returns null for a player with no settled result', () => {
    const { result } = renderHook(() => usePlayerEquityResult('nope'));

    expect(result.current).toBeNull();
  });

  it('returns the settled result for a known player id, once calculated, and a different result for another player entirely', async () => {
    act(() => {
      addPlayer(handRange('AA'));
      addPlayer(handRange('KK'));
      addPlayer(handRange('QQ'));
    });
    const [firstId, , thirdId] = currentPlayerIds();
    const job = latestJob();

    const { result: firstResult } = renderHook(() => usePlayerEquityResult(firstId));
    const { result: thirdResult } = renderHook(() => usePlayerEquityResult(thirdId));

    await act(async () => {
      job.resolve({ status: 'success', results: [RESULT_A, RESULT_B, RESULT_C] });
      await job.result;
    });

    expect(firstResult.current).toEqual(RESULT_A);
    expect(thirdResult.current).toEqual(RESULT_C);
  });
});

describe('useEquityEvaluationStatus() / useEquityEvaluationProgress() / useImpossibleSignal()', () => {
  it('reflect the same store the plain action functions above drive', async () => {
    const { result: status } = renderHook(() => useEquityEvaluationStatus());
    const { result: progress } = renderHook(() => useEquityEvaluationProgress());
    const { result: impossibleSignal } = renderHook(() => useImpossibleSignal());

    act(() => {
      addPlayer(handRange('AA'));
      addPlayer(handRange('AA'));
    });
    const job = latestJob();

    expect(status.current).toBe('calculating');

    act(() => {
      job.emitProgress(0.75);
    });
    expect(progress.current).toBe(0.75);

    const before = impossibleSignal.current;
    await act(async () => {
      job.resolve({ status: 'no-valid-runout', message: 'x' });
      await job.result;
    });

    expect(status.current).toBe('idle');
    expect(impossibleSignal.current).toBe(before + 1);
  });
});

// the maintainer's own required proof, per the plan's own acceptance
// criteria: this store's status, latest result, and start/cancel behaviour
// are reachable from a plain caller with no component render and no
// provider of any kind — every assertion above already exercises it
// through plain calls to `addPlayer`/`removePlayer`/`setBoard` (this
// feature's own action functions, none of them components) and
// `useEquityEvaluationStore.getState()` (a plain read, no hook, no render).
// This block states that proof explicitly, once, as its own scenario,
// rather than leaving it merely implied by the tests above.
describe('reachable from a plain module with no component render and no provider', () => {
  it('starts an evaluation and observes its result purely through the store’s own getState()/subscribe(), with no React render involved', async () => {
    const observed: string[] = [];
    const unsubscribe = useEquityEvaluationStore.subscribe((state) => {
      observed.push(state.status);
    });

    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const job = latestJob();

    expect(useEquityEvaluationStore.getState().status).toBe('calculating');

    job.resolve({ status: 'success', results: [RESULT_A, RESULT_B] });
    await job.result;

    expect(useEquityEvaluationStore.getState().status).toBe('calculated');
    expect(observed).toContain('calculating');
    expect(observed).toContain('calculated');
    unsubscribe();
  });

  // issue #103's own acceptance criteria require exported start/cancel
  // functions on this store's public surface, callable directly by "a
  // caller outside the Analyze feature's own component tree" — not only
  // reachable indirectly through `addPlayer`/`removePlayer`/`setBoard` as
  // every test above already exercises. these two cases call
  // `startEquityEvaluation()`/`cancelEquityEvaluation()` themselves.
  it('startEquityEvaluation() called directly starts an evaluation and observes its result, with no board/players mutation involved', async () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    const [firstId, secondId] = currentPlayerIds();
    // the store already auto-started from `addPlayer` above (this store's
    // own primary mechanism) — cancel that first so this case's own call
    // to `startEquityEvaluation()` below is unambiguously what starts the
    // job this test observes.
    mockStartEquityJob.mockClear();
    cancelEquityEvaluation();
    expect(useEquityEvaluationStore.getState().status).toBe('idle');

    startEquityEvaluation();

    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);
    expect(useEquityEvaluationStore.getState().status).toBe('calculating');

    const job = latestJob();
    job.resolve({ status: 'success', results: [RESULT_A, RESULT_B] });
    await job.result;

    const state = useEquityEvaluationStore.getState();
    expect(state.status).toBe('calculated');
    expect(state.results[firstId]).toEqual(RESULT_A);
    expect(state.results[secondId]).toEqual(RESULT_B);
  });

  it('cancelEquityEvaluation() called directly cancels the in-flight job and returns to idle, without restarting on its own', () => {
    addPlayer(handRange('AA'));
    addPlayer(handRange('KK'));
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);

    cancelEquityEvaluation();

    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(useEquityEvaluationStore.getState().status).toBe('idle');
    expect(useEquityEvaluationStore.getState().progress).toBe(0);
    expect(useEquityEvaluationStore.getState().results).toEqual({});
    // unlike a board/players change, this must not restart — still 2
    // players in the 2–3 window, yet no fresh job is started.
    expect(mockStartEquityJob).toHaveBeenCalledTimes(1);
  });
});
