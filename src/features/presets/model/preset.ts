import type { HandRange } from '@/shared/model/hand-range';

/**
 * every `TagAxis`'s own fixed set of values, in the order
 * docs/specs/hand-ranges.md's Preset section table lists them — the 17
 * `(axis, value)` combinations `src/core/db/schema.ts`'s `tags` table is
 * pre-seeded with by this issue's own migration. The one place either an
 * axis or a value is spelled out; `TagAxis` and `PresetTags` below are both
 * derived from it rather than duplicating it.
 */
export const TAG_AXIS_VALUES = {
  position: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  players: ['Heads-up', '6max', '9max'],
  stack: ['200BB', '150BB', '100BB', '75BB'],
  action: ['Open', 'Call', '3bet', '4bet'],
} as const;

/**
 * the four fixed axes a Preset is tagged along — docs/specs/hand-ranges.md's
 * Preset section, docs/glossary.md's Tag Axis entry. Fixed by the spec;
 * introducing a new axis is out of this issue's scope (issue #175's own
 * Assumptions).
 */
export type TagAxis = keyof typeof TAG_AXIS_VALUES;

/**
 * a Preset's selected values across all four tag axes. each axis is
 * multi-select and may be left with no selected value at all (issue #175's
 * own Assumptions) — an empty array, never `undefined`, so every one of the
 * four axes is always present on a `Preset`.
 */
export type PresetTags = {
  readonly [Axis in TagAxis]: readonly (typeof TAG_AXIS_VALUES)[Axis][number][];
};

/**
 * a named, reusable hand range tagged along the four fixed axes
 * (docs/glossary.md's Preset entry). `handRange` reuses
 * `@/shared/model/hand-range`'s own `HandRange` representation as-is,
 * rather than introducing a second one.
 */
export type Preset = {
  readonly id: number;
  readonly name: string;
  readonly handRange: HandRange;
  readonly tags: PresetTags;
};

/** the fields a new Preset is created from — everything but its `id`, which the database assigns on create. */
export type PresetInput = Omit<Preset, 'id'>;

/**
 * thrown by `../adapter/preset-storage.ts`'s `getPreset` (and `updatePreset`,
 * which requires the Preset it replaces to already exist) for an `id` with
 * no matching stored Preset — issue #175's own Functional requirements: "an
 * id with no matching Preset raises an error" rather than a null/undefined
 * placeholder.
 */
export class PresetNotFoundError extends Error {
  readonly presetId: number;

  constructor(presetId: number) {
    super(`No preset found with id ${presetId}.`);
    this.name = 'PresetNotFoundError';
    this.presetId = presetId;
  }
}
