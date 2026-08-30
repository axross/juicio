import * as Sentry from '@sentry/react-native';

export type UserFeedbackParams = {
  message: string;
  name?: string;
  email?: string;
};

/**
 * whether Sentry can actually accept feedback right now. `false` on a build
 * with no client at all — this project's Development channel ships with no
 * `EXPO_PUBLIC_SENTRY_DSN` by default (see docs/operations/secrets.md), so
 * `Sentry.init` never runs one up — rather than a build where sending would
 * merely fail. `sendUserFeedback` does not check this itself; a caller
 * (`src/features/feedback/usecase/send-feedback.ts`) checks it first, so a
 * build with nothing listening reports `unavailable` instead of a false
 * `sent` or a raw thrown error.
 */
export function canSendUserFeedback(): boolean {
  return Sentry.getClient() !== undefined;
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
 * this module imports the Sentry SDK directly, so — like `report-error.ts`,
 * `sentry.ts`, and `apply-theme-instruction.ts` — it carries no unit test
 * of its own and must not be relied on to keep a module unit-testable
 * without a native runtime; see `src/core/theme/tokens.ts`'s header comment
 * for the same hazard applied to Unistyles.
 */
export function sendUserFeedback(params: UserFeedbackParams): void {
  Sentry.captureFeedback(params);
}
