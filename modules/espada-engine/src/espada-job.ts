import { NitroModules } from 'react-native-nitro-modules';

import { EspadaNativeError } from './espada-native-error';
import { EspadaJobStatus, type EspadaEngine } from './specs/espada-engine.nitro';

/**
 * the name Nitro registers the `EspadaEngine` HybridObject's constructor
 * under (via the Nitrogen-generated registration — see
 * `nitrogen/generated/android/EspadaEngineOnLoad.cpp` and
 * `nitrogen/generated/ios/EspadaEngineAutolinking.mm`), and the exact string
 * this module passes to `NitroModules.createHybridObject`. the two must
 * match verbatim; Nitrogen generates both ends from `nitro.json`'s
 * `autolinking` entry, so there is nothing left to keep in sync by hand.
 */
const ESPADA_ENGINE_HYBRID_OBJECT_NAME = 'EspadaEngine';

export type EspadaJobHandle = {
  /** resolves with the job's prime count on success; rejects with an
   * `EspadaNativeError` for every other outcome (cancellation, an internal
   * native fault, or invalid input caught before native was ever called).
   * settles exactly once. */
  result: Promise<number>;
  /** requests cancellation of the running job. does not block, does not
   * itself release the native handle (see `release`), and is a no-op once
   * the job has settled or `release` has already run. */
  cancel: () => void;
  /**
   * releases the underlying native job handle. safe to call more than
   * once and safe to call before or after the job settles — this wrapper
   * already calls it itself the moment the job settles, so a caller only
   * needs this to force an *early* release, e.g. from a component's
   * unmount cleanup, so a job started and then abandoned mid-run does not
   * wait for its own natural completion before its handle is freed.
   */
  release: () => void;
};

function isValidNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * starts one `espada-engine` job: counting primes below `limit`, sharded
 * across `threadCount` Rust-owned worker threads (`0` = every available
 * core — see the spec's own `start` comment
 * (`specs/espada-engine.nitro.ts`); this wrapper passes it through unchanged
 * rather than special-casing it, since native already treats it as
 * meaningful input, not invalid input).
 *
 * `onProgress`, if given, is invoked with the job's completion fraction in
 * `[0, 1]`, at whatever rate the native layer delivers it (bounded to
 * roughly ten times a second — see the spec's own comment).
 *
 * a fresh `NitroModules.createHybridObject` call backs every job — matching
 * the C++ layer's own "starting a second job releases the previous handle
 * first" contract (`EspadaEngineHybridObject.cpp`'s `start`), rather than
 * this wrapper reusing one instance across calls and relying on that native
 * behaviour implicitly.
 */
export function startEspadaJob(
  limit: number,
  threadCount: number,
  onProgress?: (progress: number) => void,
): EspadaJobHandle {
  if (!isValidNonNegativeNumber(limit) || !isValidNonNegativeNumber(threadCount)) {
    return {
      result: Promise.reject(
        new EspadaNativeError(
          'invalid-argument',
          `Invalid job arguments: limit=${limit}, threadCount=${threadCount}. Both must be finite numbers >= 0.`,
        ),
      ),
      cancel: () => {},
      release: () => {},
    };
  }

  const native = NitroModules.createHybridObject<EspadaEngine>(ESPADA_ENGINE_HYBRID_OBJECT_NAME);

  // guards `native.release()` so it reaches native exactly once no matter
  // how many of this wrapper's own call sites reach for it — the settle
  // callback below always calls it, and a caller's own explicit `release()`
  // (e.g. a component's unmount cleanup) may also race it.
  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    native.release();
  };

  const result = new Promise<number>((resolve, reject) => {
    try {
      native.start(
        limit,
        threadCount,
        (progress) => {
          onProgress?.(progress);
        },
        (status, value, message) => {
          release();

          switch (status) {
            case EspadaJobStatus.Success:
              resolve(value);
              return;
            case EspadaJobStatus.Cancelled:
              reject(new EspadaNativeError('cancelled', message ?? 'The job was cancelled.'));
              return;
            case EspadaJobStatus.Error:
            default:
              reject(new EspadaNativeError('internal', message ?? 'The job failed.'));
          }
        },
      );
    } catch (caught) {
      // `start()` throws synchronously only on immediate native failure
      // (`EspadaEngineHybridObject.cpp`'s own `start`) — before any worker
      // thread exists, so there is nothing running to release, but the
      // handle this call already created still needs freeing.
      release();
      reject(
        caught instanceof EspadaNativeError
          ? caught
          : new EspadaNativeError(
              'internal',
              caught instanceof Error ? caught.message : 'Failed to start the job.',
            ),
      );
    }
  });

  return {
    result,
    cancel: () => native.cancel(),
    release,
  };
}
