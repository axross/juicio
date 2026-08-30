import { z } from 'zod';

/**
 * feedback exactly as typed into the Feedback screen's three fields, before
 * validation trims it and drops an empty optional field. `name` and `email`
 * are plain strings here (never `undefined`) because that is what a
 * controlled `TextInput`'s own `value` needs to stay controlled.
 */
export type FeedbackDraft = {
  message: string;
  name: string;
  email: string;
};

/**
 * the shape `sendFeedback` hands to the Sentry seam: trimmed, with `name`
 * and `email` dropped rather than sent as `''` when the field was left
 * empty.
 */
export type ValidatedFeedback = {
  message: string;
  name?: string;
  email?: string;
};

export type FeedbackDraftValidation =
  | { valid: true; feedback: ValidatedFeedback }
  | { valid: false; reason: 'emptyMessage' | 'invalidEmail' };

// hoisted to module scope per the zod-schema capability's schema-module
// convention: built once, not once per `validateFeedbackDraft` call.
const emailSchema = z.email();

/**
 * whether `message` is empty once leading/trailing whitespace is trimmed —
 * a whitespace-only message counts as empty. shared between the Send
 * button's enabled state, which reads this on every keystroke, and
 * `validateFeedbackDraft`'s own submit-time check below, so the two rules
 * cannot drift apart.
 */
export function isBlankMessage(message: string): boolean {
  return message.trim().length === 0;
}

/**
 * validates a feedback draft on submit — never per keystroke, per
 * docs/specs/settings.md's Feedback section: the message is required after
 * trimming, and a non-empty email must parse as one. `name` has no format
 * to fail; it is only trimmed.
 */
export function validateFeedbackDraft(draft: FeedbackDraft): FeedbackDraftValidation {
  if (isBlankMessage(draft.message)) {
    return { valid: false, reason: 'emptyMessage' };
  }

  const email = draft.email.trim();
  if (email.length > 0 && !emailSchema.safeParse(email).success) {
    return { valid: false, reason: 'invalidEmail' };
  }

  const name = draft.name.trim();

  return {
    valid: true,
    feedback: {
      message: draft.message.trim(),
      ...(name.length > 0 ? { name } : {}),
      ...(email.length > 0 ? { email } : {}),
    },
  };
}
