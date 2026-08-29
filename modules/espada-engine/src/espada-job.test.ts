import { startEspadaJob } from './espada-job';
import { EspadaJobStatus } from './specs/espada-engine.nitro';

type ProgressCallback = (progress: number) => void;
type SettleCallback = (
  status: EspadaJobStatus,
  result: number,
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
 * callbacks passed to `start` so a test can drive them directly, standing
 * in for what the real C++ layer would otherwise invoke asynchronously from
 * a worker thread. */
function createMockNative() {
  let onProgress: ProgressCallback | undefined;
  let onSettled: SettleCallback | undefined;

  const start = jest.fn(
    (
      _limit: number,
      _threadCount: number,
      progressCb: ProgressCallback,
      settleCb: SettleCallback,
    ) => {
      onProgress = progressCb;
      onSettled = settleCb;
    },
  );
  const cancel = jest.fn();
  const release = jest.fn();

  return {
    native: { start, cancel, release },
    settle: (status: EspadaJobStatus, result: number, message?: string) =>
      onSettled?.(status, result, message),
    emitProgress: (progress: number) => onProgress?.(progress),
  };
}

beforeEach(() => {
  mockCreateHybridObject.mockReset();
});

describe('startEspadaJob', () => {
  test('resolves with the prime count on a successful run, releasing the native handle exactly once', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);
    settle(EspadaJobStatus.Success, 168, undefined);

    await expect(job.result).resolves.toBe(168);
    expect(native.release).toHaveBeenCalledTimes(1);
  });

  test('rejects with a "cancelled" error when the job settles as cancelled', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);
    job.cancel();
    settle(EspadaJobStatus.Cancelled, 0, undefined);

    await expect(job.result).rejects.toMatchObject({ code: 'cancelled' });
    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(native.release).toHaveBeenCalledTimes(1);
  });

  test('rejects with an "internal" error carrying the native message on failure', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);
    settle(EspadaJobStatus.Error, 0, 'boom');

    await expect(job.result).rejects.toMatchObject({ code: 'internal', message: 'boom' });
    expect(native.release).toHaveBeenCalledTimes(1);
  });

  test('rejects with an "internal" error using a fallback message when native gives none', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);
    settle(EspadaJobStatus.Error, 0, undefined);

    await expect(job.result).rejects.toMatchObject({ code: 'internal' });
  });

  test('rejects with "invalid-argument" for negative or non-finite input, without ever calling native', async () => {
    await expect(startEspadaJob(Number.NaN, 2).result).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(startEspadaJob(-1, 2).result).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(startEspadaJob(1000, Number.POSITIVE_INFINITY).result).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(mockCreateHybridObject).not.toHaveBeenCalled();
  });

  test('treats a thread count of 0 as valid — it means "every available core", not invalid input', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 0);
    settle(EspadaJobStatus.Success, 168, undefined);

    await expect(job.result).resolves.toBe(168);
    expect(native.start).toHaveBeenCalledWith(1000, 0, expect.any(Function), expect.any(Function));
  });

  test('forwards progress events to the caller-supplied callback', () => {
    const { native, emitProgress } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);
    const onProgress = jest.fn();

    startEspadaJob(1000, 2, onProgress);
    emitProgress(0.5);

    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  test('an explicit early release() releases exactly once, even if the job later settles', async () => {
    const { native, settle } = createMockNative();
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);
    job.release();
    settle(EspadaJobStatus.Success, 168, undefined);

    await expect(job.result).resolves.toBe(168);
    expect(native.release).toHaveBeenCalledTimes(1);
  });

  test('a synchronous throw from native start() rejects and still releases the handle', async () => {
    const native = {
      start: jest.fn(() => {
        throw new Error('native start failed');
      }),
      cancel: jest.fn(),
      release: jest.fn(),
    };
    mockCreateHybridObject.mockReturnValue(native);

    const job = startEspadaJob(1000, 2);

    await expect(job.result).rejects.toMatchObject({
      code: 'internal',
      message: 'native start failed',
    });
    expect(native.release).toHaveBeenCalledTimes(1);
  });
});
