import { canSendUserFeedback, sendUserFeedback } from '@/core/instrumentation/user-feedback';

import { isBlankMessage, validateFeedbackDraft, type FeedbackDraft } from '../model/feedback-draft';

export type SendFeedbackResult =
  | { status: 'sent' }
  | { status: 'unavailable' }
  | { status: 'invalid'; reason: 'emptyMessage' | 'invalidEmail' }
  | { status: 'failed' };

/**
 * whether the Send button should be enabled for the given message — the
 * question `FeedbackForm` asks on every keystroke. a thin pass-through to
 * `model/`'s `isBlankMessage` so the UI layer never reaches into `model/`
 * for anything beyond the types it renders, per
 * docs/conventions/directory-structure.md; the blank-message rule itself
 * still lives only in `model/`.
 */
export function canSubmitFeedback(message: string): boolean {
  return !isBlankMessage(message);
}

/**
 * validates a draft, then checks whether Sentry can actually accept
 * feedback before calling it, in that order: a validation failure sends
 * nothing regardless of whether Sentry is reachable, and a build with no
 * Sentry client (`unavailable`) is reported distinctly from a client that
 * accepted the call and then threw (`failed`) — see docs/specs/settings.md.
 * `FeedbackForm` preserves the caller's draft on every non-`sent` result;
 * this function itself performs no state change beyond the one call to
 * `sendUserFeedback`.
 */
export function sendFeedback(draft: FeedbackDraft): SendFeedbackResult {
  const validation = validateFeedbackDraft(draft);
  if (!validation.valid) {
    return { status: 'invalid', reason: validation.reason };
  }

  if (!canSendUserFeedback()) {
    return { status: 'unavailable' };
  }

  try {
    sendUserFeedback(validation.feedback);
    return { status: 'sent' };
  } catch {
    return { status: 'failed' };
  }
}
