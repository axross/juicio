import * as Sentry from '@sentry/react-native';

export type UserFeedbackParams = {
  message: string;
  name?: string;
  email?: string;
};

/**
 * whether Sentry can actually accept feedback right now. two things have to
 * hold, and checking only the first would report a false `sent`:
 *
 * - a client exists at all. this project's Development channel ships with no
 *   `EXPO_PUBLIC_SENTRY_DSN` by default (see docs/operations/secrets.md), so
 *   `Sentry.init` never runs and `getClient()` is `undefined`.
 * - that client is not disabled. `sentry.ts` passes `enabled: !__DEV__`, so a
 *   development build whose `.env.local` *does* carry a DSN gets a client that
 *   exists and drops everything handed to it. that is the case the client
 *   check alone misses.
 *
 * the second condition mirrors the SDK's own gate — `@sentry/core`'s
 * `Client._isEnabled()` is `this.getOptions().enabled !== false && this._transport
 * !== undefined`. only the first half of that is publicly reachable, so a
 * client whose transport failed to construct still reads as available here;
 * nothing in the SDK's public surface exposes that, and it is not a state
 * this project's own `Sentry.init` call can produce.
 *
 * `sendUserFeedback` does not check any of this itself; a caller
 * (`src/features/feedback/usecase/send-feedback.ts`) checks it first, so a
 * build with nothing listening reports `unavailable` instead of a false
 * `sent` or a raw thrown error.
 */
export function canSendUserFeedback(): boolean {
  const client = Sentry.getClient();

  return client !== undefined && client.getOptions().enabled !== false;
}

/**
 * sends one piece of user feedback to Sentry — the vendor-neutral seam
 * beside `report-error.ts`, with `sentry-instrumentation`'s user-feedback
 * reference owning the mechanics on the other side of it. callers are
 * expected to have already validated `params` and called
 * `canSendUserFeedback()` themselves
 * (`src/features/feedback/model/feedback-draft.ts` and
 * `src/features/feedback/usecase/send-feedback.ts`); this module does
 * neither.
 *
 * `Sentry.captureFeedback` returns an event id synchronously and reports no
 * delivery outcome, so this function returns nothing: there is no success
 * signal here worth handing a caller, and the id would read as one.
 *
 * this module imports the Sentry SDK directly, so — like `report-error.ts`,
 * `sentry.ts`, and `apply-theme-instruction.ts` — it carries no unit test
 * of its own and must not be relied on to keep a module unit-testable
 * without a native runtime; see `src/core/theme/tokens.ts`'s header comment
 * for the same hazard applied to Unistyles.
 */
export function sendUserFeedback(params: UserFeedbackParams): void {
  Sentry.captureFeedback(params);
}
