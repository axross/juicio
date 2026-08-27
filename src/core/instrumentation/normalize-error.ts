/**
 * Normalizes anything a `catch` clause might receive into an `Error`
 * instance. A thrown string, plain object, or other non-`Error` value has no
 * stack to walk, and forwarding it to the error tracker raw produces a poor,
 * hard-to-group issue (see the `sentry-instrumentation` capture-and-scopes
 * reference); wrapping it here, once, gives every caller a real exception
 * instead of repeating the wrapping at each capture site.
 *
 * Pure and dependency-free — no Sentry import — so it can be unit tested
 * without a native runtime. `report-error.ts` is what pairs this with an
 * actual report.
 */
export function normalizeError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  try {
    return new Error(JSON.stringify(value) ?? String(value));
  } catch {
    return new Error(String(value));
  }
}
