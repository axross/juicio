import type { HybridObject } from 'react-native-nitro-modules';

/**
 * A job's outcome, passed to `start`'s `onSettled` callback. Mirrors
 * `EspadaStatus` (`../../lib/espada-engine/src/ffi.rs`) and `EspadaStatus`
 * (`../../cpp/espada_engine.h`) value for value — this declaration is the one
 * place that numeric contract is authored; Nitrogen generates the matching
 * C++ `enum class` from it rather than it being mirrored by hand across
 * TypeScript, C++ and Rust.
 */
export enum EspadaJobStatus {
  Success = 0,
  Cancelled = 1,
  Error = 2,
}

/**
 * The Nitro `HybridObject` this module registers as `EspadaEngine`. Nitrogen
 * generates its C++ spec base class (`HybridEspadaEngineSpec`, under
 * `nitrogen/generated/shared/c++/`) from this interface, the registration for
 * both platforms, and the autolinking files the podspec, Gradle build and
 * CMake build consume — see `../../cpp/EspadaEngineHybridObject.hpp` for the
 * hand-written subclass that implements it and calls into the Rust C ABI.
 */
export interface EspadaEngine extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  /**
   * Starts a job counting primes below `limit` (clamped to
   * `[0, UINT64_MAX]`), sharded across `threadCount` Rust-owned worker
   * threads (`0` = every available core, clamped rather than rejected — see
   * `espada_engine.h`). Both numbers cross from JS as `double`, per this
   * project's own "numbers cross as f64" rule.
   *
   * `onProgress` fires at a bounded rate with a `[0, 1]` completion
   * fraction. `onSettled` fires exactly once with the job's outcome:
   * `result` is meaningful only when `status` is `EspadaJobStatus.Success`;
   * `message` is present only when `status` is `EspadaJobStatus.Error`.
   *
   * Starting a second job while one is already running releases the
   * previous handle first (see `release()`) rather than rejecting — the
   * previous job's worker threads keep running to their own completion
   * regardless, per the C ABI's own free-while-running contract.
   */
  start(
    limit: number,
    threadCount: number,
    onProgress: (progress: number) => void,
    onSettled: (status: EspadaJobStatus, result: number, message: string | undefined) => void,
  ): void;

  /**
   * Requests cancellation of the running job, if any. A no-op if no job is
   * running. Does not block; the job still settles through `onSettled`.
   */
  cancel(): void;

  /**
   * Releases the current job handle, if any. Safe to call more than once,
   * safe to call whether or not the job has settled.
   */
  release(): void;
}
