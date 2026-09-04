import { NitroModules } from 'react-native-nitro-modules';

import {
  EspadaEquityJobStatus,
  type EspadaEngine,
  type EspadaEquityPlayerResult,
} from './specs/espada-engine.nitro';

/**
 * the name Nitro registers the `EspadaEngine` HybridObject's constructor
 * under — see `espada-job.ts`'s own copy of this constant for why it is
 * repeated here rather than imported: this module has no other reason to
 * depend on that one, and the string itself comes from `nitro.json`'s
 * `autolinking` entry either way.
 */
const ESPADA_ENGINE_HYBRID_OBJECT_NAME = 'EspadaEngine';

/**
 * one player's aggregate equity, exactly as native reports it — see
 * `EspadaEquityPlayerResult` (`specs/espada-engine.nitro.ts`) for what each
 * field means. re-exported from here so a caller of this module never needs
 * its own import from `specs/`.
 */
export type { EspadaEquityPlayerResult };

/**
 * why an equity job settled without a result, mirroring the non-success
 * members of `EspadaEquityJobStatus` one for one:
 *
 * - `cancelled` — the job was cancelled before it could settle with a
 *   result (see `cancel()` below).
 * - `no-valid-runout` — every player's range and the board looked
 *   individually valid, but no single deal of the whole deck can give every
 *   player a live holding at once (three players each pinned to `AA` is the
 *   standing example — only four aces exist). this is a genuine finding
 *   about the input the caller gave, not a fault.
 * - `unsupported-player-count` — `players` named a count the native
 *   evaluator's own structural limit does not cover (today, anything other
 *   than two or three).
 * - `internal` — every other native failure.
 */
export type EspadaEquityOutcomeCode =
  'cancelled' | 'no-valid-runout' | 'unsupported-player-count' | 'internal';

/**
 * an equity job's outcome once it stops running: either every player's
 * aggregate equity, or why no result is available. modelled as a discriminated
 * union on `status` — narrower than throwing an `EspadaNativeError` for the
 * non-success cases, since `no-valid-runout` and `unsupported-player-count`
 * are findings about the input a caller is expected to branch on and
 * display, not exceptional failures a `try`/`catch` should be reaching for.
 * `cancelled` and `internal` still carry a `message` for the same
 * "something went wrong" surface `EspadaNativeError` gives the demo job.
 */
export type EspadaEquityOutcome =
  | { status: 'success'; results: EspadaEquityPlayerResult[] }
  | { status: EspadaEquityOutcomeCode; message: string };

export type EspadaEquityJobHandle = {
  /** resolves with the job's outcome — see `EspadaEquityOutcome` — and never
   * rejects: every non-success case native or this wrapper itself can reach
   * (cancellation, an unsupported player count, a combinatorially
   * impossible situation, an internal native fault, or invalid input caught
   * before native was ever called) is a value of the union, not a thrown
   * error, so a caller always handles every case through one `switch` on
   * `status` rather than a `try`/`catch` plus a `switch`. settles exactly
   * once — `startEquityJob`'s own `onProgress` argument is what a caller
   * reads while the job is still running, not this promise. */
  result: Promise<EspadaEquityOutcome>;
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

/** the fallback message used when native settles a non-success outcome
 * without one of its own (`EspadaEquityJobStatus.Cancelled`,
 * `NoValidRunout`, and `UnsupportedPlayerCount` never carry a native
 * message — see the spec's own `onSettled` comment). */
const FALLBACK_MESSAGES: Record<EspadaEquityOutcomeCode, string> = {
  cancelled: 'The equity job was cancelled.',
  'no-valid-runout': 'No valid deal of the deck satisfies every player at once.',
  'unsupported-player-count': 'This table size is not supported.',
  internal: 'The equity job failed.',
};

function outcomeFor(
  status: EspadaEquityJobStatus,
  results: EspadaEquityPlayerResult[] | undefined,
  message: string | undefined,
): EspadaEquityOutcome {
  switch (status) {
    case EspadaEquityJobStatus.Success:
      // `results` is documented as present exactly when `status` is
      // `Success` (`specs/espada-engine.nitro.ts`'s own `onSettled`
      // comment) — defended with a fallback empty array rather than
      // trusted blindly, since nothing on this side of the native
      // boundary can enforce that contract at the type level.
      return { status: 'success', results: results ?? [] };
    case EspadaEquityJobStatus.Cancelled:
      return { status: 'cancelled', message: message ?? FALLBACK_MESSAGES.cancelled };
    case EspadaEquityJobStatus.NoValidRunout:
      return {
        status: 'no-valid-runout',
        message: message ?? FALLBACK_MESSAGES['no-valid-runout'],
      };
    case EspadaEquityJobStatus.UnsupportedPlayerCount:
      return {
        status: 'unsupported-player-count',
        message: message ?? FALLBACK_MESSAGES['unsupported-player-count'],
      };
    case EspadaEquityJobStatus.Error:
    default:
      return { status: 'internal', message: message ?? FALLBACK_MESSAGES.internal };
  }
}

/**
 * starts one `espada-engine` equity job: computing real equity for a table
 * of players, sharded across `threadCount` Rust-owned worker threads (`0` =
 * every available core — see the spec's own `startEquity` comment
 * (`specs/espada-engine.nitro.ts`); this wrapper passes it through
 * unchanged rather than special-casing it, since native already treats it
 * as meaningful input, not invalid input).
 *
 * `board` is a space-separated list of card codes (e.g. `"Ah Kd 2c"`); pass
 * `""` for preflop. `players` is one hand-range string per player (e.g.
 * `"AA"`, `"22+,A2s+,AJo+"`), in seat order — this wrapper does not itself
 * reject a count outside two or three, since whether a table of that size
 * is supported is the native evaluator's call to make, reported back as
 * `results.status === 'unsupported-player-count'` rather than pre-empted
 * here (see `EspadaEquityOutcomeCode`'s own doc comment).
 *
 * `onProgress`, if given, is invoked with the job's completion fraction in
 * `[0, 1]`, at whatever rate the native layer delivers it (bounded to
 * roughly ten times a second — see the spec's own comment), alongside each
 * player's own currently-accumulated result in the same seat order as
 * `players` above — `undefined` for a tick where native has nothing
 * accumulated yet for every player, never a partial array.
 *
 * a fresh `NitroModules.createHybridObject` call backs every job — matching
 * the C++ layer's own "starting a second equity job releases the previous
 * handle first" contract, rather than this wrapper reusing one instance
 * across calls and relying on that native behaviour implicitly.
 */
export function startEquityJob(
  board: string,
  players: string[],
  threadCount: number,
  onProgress?: (progress: number, players: EspadaEquityPlayerResult[] | undefined) => void,
): EspadaEquityJobHandle {
  if (!isValidNonNegativeNumber(threadCount)) {
    return {
      result: Promise.resolve({
        status: 'internal',
        message: `Invalid job arguments: threadCount=${threadCount}. Must be a finite number >= 0.`,
      }),
      cancel: () => {},
      release: () => {},
    };
  }

  const native = NitroModules.createHybridObject<EspadaEngine>(ESPADA_ENGINE_HYBRID_OBJECT_NAME);

  // guards `native.releaseEquity()` so it reaches native exactly once no
  // matter how many of this wrapper's own call sites reach for it — the
  // settle callback below always calls it, and a caller's own explicit
  // `release()` (e.g. a component's unmount cleanup) may also race it.
  let released = false;
  const release = (): void => {
    if (released) {
      return;
    }
    released = true;
    native.releaseEquity();
  };

  const result = new Promise<EspadaEquityOutcome>((resolve) => {
    try {
      native.startEquity(
        board,
        players,
        threadCount,
        (progress, playersProgress) => {
          onProgress?.(progress, playersProgress);
        },
        (status, results, message) => {
          release();
          resolve(outcomeFor(status, results, message));
        },
      );
    } catch (caught) {
      // `startEquity()` throws synchronously only on immediate native
      // failure — a `board` or range string that failed to parse, or a
      // null callback (see `equity_ffi.rs`'s own `espada_engine_equity_start`
      // comment for why that case alone cannot reach `onSettled`) — before
      // any worker thread exists, so there is nothing running to release,
      // but the handle this call already created still needs freeing.
      release();
      resolve({
        status: 'internal',
        message: caught instanceof Error ? caught.message : 'Failed to start the equity job.',
      });
    }
  });

  return {
    result,
    cancel: () => native.cancelEquity(),
    release,
  };
}
