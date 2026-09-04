import { startEquityJob } from './equity-job';
import { EspadaEquityJobStatus, type EspadaEquityPlayerResult } from './specs/espada-engine.nitro';

type ProgressCallback = (progress: number, players: EspadaEquityPlayerResult[] | undefined) => void;
type SettleCallback = (
  status: EspadaEquityJobStatus,
  results: EspadaEquityPlayerResult[] | undefined,
  message: string | undefined,
) => void;

// Jest's own module-factory hoisting forbids a `jest.mock` factory from
// closing over an ordinary outer variable — `mock`-prefixed names are the
// documented exception, since Jest hoists this call above the variable
// declarations below it.
const mockCreateHybridObject = jest.fn();

// `react-native-nitro-modules` cannot load in this environment (no
// Android/iOS runtime backs it) — every test mocks it, per this project's
// own testing convention for a native surface.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: (...args: unknown[]) => mockCreateHybridObject(...args),
  },
}));

/** a mock of `EspadaEngine` (the Nitro HybridObject) that captures the
 * callbacks passed to `startEquity` so a test can drive them directly,
 * standing in for what the real C++ layer would otherwise invoke
 * asynchronously from a worker thread. */
function createMockNative() {
  let onProgress: ProgressCallback | undefined;
  let onSettled: SettleCallback | undefined;

  const startEquity = jest.fn(
    (
      _board: string,
      _players: string[],
      _threadCount: number,
      progressCb: ProgressCallback,
      settleCb: SettleCallback,
    ) => {
      onProgress = progressCb;
      onSettled = settleCb;
    },
  );
  const cancelEquity = jest.fn();
  const releaseEquity = jest.fn();

  return {
    native: { startEquity, cancelEquity, releaseEquity },
    settle: (
      status: EspadaEquityJobStatus,
      results?: EspadaEquityPlayerResult[],
      message?: string,
    ) => onSettled?.(status, results, message),
    emitProgress: (progress: number, players?: EspadaEquityPlayerResult[]) =>
      onProgress?.(progress, players),
  };
}

// `distribution` is present only because `EspadaEquityPlayerResult` requires
// it — this file exercises job orchestration (progress/settle plumbing), not
// the distribution's own content, so an empty array stands in for it.
const TWO_PLAYER_RESULTS: EspadaEquityPlayerResult[] = [
  { win: 0.6, tie: 0.02, equity: 0.61, distribution: [] },
  { win: 0.38, tie: 0.02, equity: 0.39, distribution: [] },
];

beforeEach(() => {
  mockCreateHybridObject.mockReset();
});

describe('startEquityJob', () => {
  test('resolves with every player’s equity on a successful run, releasing the native handle exactly once', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h 7c 4d', ['JJ+', 'A2s+'], 2);
    settle(EspadaEquityJobStatus.Success, TWO_PLAYER_RESULTS, undefined);

    await expect(job.result).resolves.toEqual({ status: 'success', results: TWO_PLAYER_RESULTS });
    expect(native.releaseEquity).toHaveBeenCalledTimes(1);
  });

  test('resolves with a "cancelled" outcome, never rejecting, when the job settles as cancelled', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2);
    job.cancel();
    settle(EspadaEquityJobStatus.Cancelled, undefined, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'cancelled' });
    expect(native.cancelEquity).toHaveBeenCalledTimes(1);
    expect(native.releaseEquity).toHaveBeenCalledTimes(1);
  });

  test('resolves with a "no-valid-runout" outcome when native reports NoValidRunout', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['AA', 'AA', 'AA'], 0);
    settle(EspadaEquityJobStatus.NoValidRunout, undefined, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'no-valid-runout' });
  });

  test('resolves with an "unsupported-player-count" outcome when native reports UnsupportedPlayerCount', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ', 'AKo', '22', '33'], 0);
    settle(EspadaEquityJobStatus.UnsupportedPlayerCount, undefined, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'unsupported-player-count' });
  });

  test('resolves with an "internal" outcome carrying the native message on failure', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2);
    settle(EspadaEquityJobStatus.Error, undefined, 'boom');

    await expect(job.result).resolves.toEqual({ status: 'internal', message: 'boom' });
    expect(native.releaseEquity).toHaveBeenCalledTimes(1);
  });

  test('resolves with an "internal" outcome using a fallback message when native gives none', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2);
    settle(EspadaEquityJobStatus.Error, undefined, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'internal' });
  });

  test('resolves with an "internal" outcome for a non-finite or negative thread count, without ever calling native', async () => {
    await expect(
      startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], Number.NaN).result,
    ).resolves.toMatchObject({ status: 'internal' });
    await expect(startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], -1).result).resolves.toMatchObject({
      status: 'internal',
    });
    await expect(
      startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], Number.POSITIVE_INFINITY).result,
    ).resolves.toMatchObject({ status: 'internal' });
    expect(mockCreateHybridObject).not.toHaveBeenCalled();
  });

  test('treats a thread count of 0 as valid — it means "every available core", not invalid input', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 0);
    settle(EspadaEquityJobStatus.Success, TWO_PLAYER_RESULTS, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'success' });
    expect(native.startEquity).toHaveBeenCalledWith(
      'Qs 8d 2h',
      ['JJ+', 'AKo'],
      0,
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('does not itself reject a player count outside two or three — that is native’s call to make', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    startEquityJob('Qs 8d 2h', ['JJ'], 0);
    settle(EspadaEquityJobStatus.UnsupportedPlayerCount, undefined, undefined);

    expect(native.startEquity).toHaveBeenCalledWith(
      'Qs 8d 2h',
      ['JJ'],
      0,
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('forwards progress events, and their per-player payload, to the caller-supplied callback', () => {
    const { native, emitProgress } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);
    const onProgress = jest.fn();

    startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2, onProgress);
    emitProgress(0.5, TWO_PLAYER_RESULTS);

    expect(onProgress).toHaveBeenCalledWith(0.5, TWO_PLAYER_RESULTS);
  });

  test('forwards an undefined per-player payload unchanged — not every player has accumulated data yet', () => {
    const { native, emitProgress } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);
    const onProgress = jest.fn();

    startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2, onProgress);
    emitProgress(0.1);

    expect(onProgress).toHaveBeenCalledWith(0.1, undefined);
  });

  test('an explicit early release() releases exactly once, even if the job later settles', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Qs 8d 2h', ['JJ+', 'AKo'], 2);
    job.release();
    settle(EspadaEquityJobStatus.Success, TWO_PLAYER_RESULTS, undefined);

    await expect(job.result).resolves.toMatchObject({ status: 'success' });
    expect(native.releaseEquity).toHaveBeenCalledTimes(1);
  });

  test('a synchronous throw from native startEquity() resolves with "internal" and still releases the handle', async () => {
    const native = {
      startEquity: jest.fn(() => {
        throw new Error('native startEquity failed');
      }),
      cancelEquity: jest.fn(),
      releaseEquity: jest.fn(),
    };
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEquityJob('Zz 8d 2h', ['JJ+', 'AKo'], 2);

    await expect(job.result).resolves.toEqual({
      status: 'internal',
      message: 'native startEquity failed',
    });
    expect(native.releaseEquity).toHaveBeenCalledTimes(1);
  });
});
