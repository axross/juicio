/**
 * Distinguishes why a `startJuicioJob` result rejected, so a caller can
 * branch on the reason rather than parse a message string:
 *
 * - `invalid-argument` — raised by this wrapper itself, before native is
 *   ever called, for input the C ABI would otherwise silently clamp rather
 *   than reject (see `juicio_native.h`'s own `toU64`/`toU32` clamping
 *   comment on `JuicioNativeHybridObject.cpp`) — surfacing a caller's
 *   mistake here instead of letting it silently run a clamped job the
 *   caller never intended.
 * - `cancelled` — mirrors the native `JuicioStatus.Cancelled` outcome
 *   exactly (see `juicio-job.ts`).
 * - `internal` — every other native failure: `JuicioStatus.Error`, or a
 *   synchronous throw out of `start()` itself. The async settle callback
 *   carries only a message for that case, never Rust's own
 *   `JuicioErrorCode` (`JuicioNativeHybridObject.cpp`'s `handleSettle`
 *   passes `JuicioStatus` alone) — so this wrapper cannot distinguish an
 *   internal fault any further than that, and does not pretend to.
 */
export type JuicioNativeErrorCode = 'invalid-argument' | 'cancelled' | 'internal';

export class JuicioNativeError extends Error {
  readonly code: JuicioNativeErrorCode;

  constructor(code: JuicioNativeErrorCode, message: string) {
    super(message);
    this.name = 'JuicioNativeError';
    this.code = code;
  }
}
