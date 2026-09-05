import type { HandRange } from '@/shared/model/hand-range';

import type { PresetInput, PresetTags } from './preset';

/**
 * a Preset editor's own field state, exactly as typed/picked before
 * validation — the same "before validation trims/checks it" role
 * `@/features/feedback/model/feedback-draft.ts`'s `FeedbackDraft` already
 * plays for that screen's own draft.
 */
export type PresetDraft = {
  name: string;
  handRange: HandRange;
  tags: PresetTags;
};

/**
 * `false` once `name` is empty after trimming leading/trailing whitespace —
 * a whitespace-only name counts as empty, the same rule
 * `feedback-draft.ts`'s own `isBlankMessage` already applies to that
 * screen's Message field. `validatePresetDraft` below is the sole caller,
 * on Save press.
 */
export function isBlankName(name: string): boolean {
  return name.trim().length === 0;
}

/**
 * both invalid reasons at once, not a single reason enum — issue #177's own
 * plan: "Pressing Save while the name is empty or the hand range is empty
 * blocks the save, flags the offending field (or both, if both are
 * invalid)". Unlike `feedback-draft.ts`'s own `FeedbackDraftValidation`
 * (whose two failure reasons are mutually exclusive — a message and an
 * email can't both be the one thing wrong with one submit), a Preset
 * draft's two checks are independent, so both booleans can be `true` on the
 * same failed validation.
 */
export type PresetDraftValidation =
  | { valid: true; preset: PresetInput }
  | { valid: false; nameInvalid: boolean; handRangeInvalid: boolean };

/**
 * validates a Preset draft on Save press — never per keystroke, matching
 * `feedback-draft.ts`'s own `validateFeedbackDraft` and issue #177's own UI
 * design section ("Both check on a Save press, not on every keystroke").
 * The name is required, trimmed, after trimming (`isBlankName` above); the
 * hand range is required to hold at least one rank pair; every tag axis may
 * be left empty (issue #177's own Assumptions) so `tags` is carried through
 * unchecked. On success, `preset` is already the exact `PresetInput` shape
 * `createPreset`/`updatePreset` (`../adapter/preset-storage.ts`) take, with
 * `name` trimmed.
 */
export function validatePresetDraft(draft: PresetDraft): PresetDraftValidation {
  const nameInvalid = isBlankName(draft.name);
  const handRangeInvalid = draft.handRange.size === 0;

  if (nameInvalid || handRangeInvalid) {
    return { valid: false, nameInvalid, handRangeInvalid };
  }

  return {
    valid: true,
    preset: { name: draft.name.trim(), handRange: draft.handRange, tags: draft.tags },
  };
}
