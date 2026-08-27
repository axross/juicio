/**
 * Distinguishes why a `startEspadaJob` result rejected, so a caller can
 * branch on the reason rather than parse a message string:
 *
 * - `invalid-argument` — raised by this wrapper itself, before native is
 *   ever called, for input the C ABI would otherwise silently clamp rather
 *   than reject (see `espada_engine.h`'s own `toU64`/`toU32` clamping
 *   comment on `EspadaEngineHybridObject.cpp`) — surfacing a caller's
 *   mistake here instead of letting it silently run a clamped job the
 *   caller never intended.
 * - `cancelled` — mirrors the native `EspadaJobStatus.Cancelled` outcome
 *   exactly (see `espada-job.ts`).
 * - `internal` — every other native failure: `EspadaJobStatus.Error`, or a
 *   synchronous throw out of `start()` itself. The async settle callback
 *   carries only a message for that case, never Rust's own
 *   `EspadaErrorCode` (`EspadaEngineHybridObject.cpp`'s `handleSettle`
 *   passes `EspadaJobStatus` alone) — so this wrapper cannot distinguish an
 *   internal fault any further than that, and does not pretend to.
 */
export type EspadaNativeErrorCode = 'invalid-argument' | 'cancelled' | 'internal';

export class EspadaNativeError extends Error {
  readonly code: EspadaNativeErrorCode;

  constructor(code: EspadaNativeErrorCode, message: string) {
    super(message);
    this.name = 'EspadaNativeError';
    this.code = code;
  }
}
