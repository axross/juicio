import * as Sentry from '@sentry/react-native';

import { normalizeError } from './normalize-error';

export type ReportErrorContext = {
  /** low-cardinality, searchable facets — e.g. the module or feature area a
   * failure came from. Sentry tags, per the `sentry-instrumentation`
   * capture-and-scopes reference's tag/context split. */
  tags?: Record<string, string>;
  /** higher-detail, non-indexed facts read while looking at one event. */
  extra?: Record<string, unknown>;
};

/**
 * reports an unexpected failure to Sentry — the vendor-neutral `reportError`
 * seam the `software-instrumentation` error-handling reference names, with
 * `sentry-instrumentation` owning the mechanics on the other side of it.
 * callers pass whatever a `catch` received; `normalizeError` (pure, tested
 * separately) turns a non-`Error` throw into a real exception first, per
 * capture-and-scopes.md's rule to wrap at the capture site rather than
 * forward a raw value.
 *
 * this module imports the Sentry SDK directly, so — like `sentry.ts` and
 * `apply-theme-instruction.ts` — it carries no unit test of its own and must
 * not be relied on to keep a module unit-testable without a native runtime;
 * see `src/core/theme/tokens.ts`'s header comment for the same hazard
 * applied to Unistyles. `normalize-error.ts` holds the part of this
 * behaviour that is pure and does have a test.
 */
export function reportError(error: unknown, context?: ReportErrorContext): void {
  const normalized = normalizeError(error);

  if (__DEV__) {
    console.error(normalized, context);
  }

  Sentry.captureException(normalized, context);
}
