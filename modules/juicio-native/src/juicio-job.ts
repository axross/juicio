import { NitroModules } from 'react-native-nitro-modules';

import { JuicioNativeError } from './juicio-native-error';
import {
  JUICIO_NATIVE_HYBRID_OBJECT_NAME,
  NativeJobStatus,
  type JuicioNativeHybridObject,
} from './juicio-native-hybrid-object';

export type JuicioJobHandle = {
  /** Resolves with the job's prime count on success; rejects with a
   * `JuicioNativeError` for every other outcome (cancellation, an internal
   * native fault, or invalid input caught before native was ever called).
   * Settles exactly once. */
  result: Promise<number>;
  /** Requests cancellation of the running job. Does not block, does not
   * itself release the native handle (see `release`), and is a no-op once
   * the job has settled or `release` has already run. */
  cancel: () => void;
  /**
   * Releases the underlying native job handle. Safe to call more than
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
 * Starts one `juicio-native` job: counting primes below `limit`, sharded
 * across `threadCount` Rust-owned worker threads (`0` = every available
 * core — see `JuicioNativeHybridObject.hpp`'s own `start` comment; this
 * wrapper passes it through unchanged rather than special-casing it, since
 * native already treats it as meaningful input, not invalid input).
 *
 * `onProgress`, if given, is invoked with the job's completion fraction in
 * `[0, 1]`, at whatever rate the native layer delivers it (bounded to
 * roughly ten times a second — see `juicio_native.h`).
 *
 * A fresh `NitroModules.createHybridObject` call backs every job — matching
 * the C++ layer's own "starting a second job releases the previous handle
 * first" contract (`JuicioNativeHybridObject.cpp`'s `start`), rather than
 * this wrapper reusing one instance across calls and relying on that native
 * behaviour implicitly.
 */
export function startJuicioJob(
  limit: number,
  threadCount: number,
  onProgress?: (progress: number) => void,
): JuicioJobHandle {
  if (!isValidNonNegativeNumber(limit) || !isValidNonNegativeNumber(threadCount)) {
    return {
      result: Promise.reject(
        new JuicioNativeError(
          'invalid-argument',
          `Invalid job arguments: limit=${limit}, threadCount=${threadCount}. Both must be finite numbers >= 0.`,
        ),
      ),
      cancel: () => {},
      release: () => {},
    };
  }

  const native = NitroModules.createHybridObject<JuicioNativeHybridObject>(
    JUICIO_NATIVE_HYBRID_OBJECT_NAME,
  );

  // Guards `native.release()` so it reaches native exactly once no matter
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
            case NativeJobStatus.Success:
              resolve(value);
              return;
            case NativeJobStatus.Cancelled:
              reject(new JuicioNativeError('cancelled', message ?? 'The job was cancelled.'));
              return;
            case NativeJobStatus.Error:
            default:
              reject(new JuicioNativeError('internal', message ?? 'The job failed.'));
          }
        },
      );
    } catch (caught) {
      // `start()` throws synchronously only on immediate native failure
      // (`JuicioNativeHybridObject.cpp`'s own `start`) — before any worker
      // thread exists, so there is nothing running to release, but the
      // handle this call already created still needs freeing.
      release();
      reject(
        caught instanceof JuicioNativeError
          ? caught
          : new JuicioNativeError(
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
