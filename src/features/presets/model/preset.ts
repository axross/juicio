import type { HandRange } from '@/shared/model/hand-range';

/**
 * the four fixed axes a Preset is tagged along — docs/specs/hand-ranges.md's
 * Preset section, docs/glossary.md's Tag Axis entry. Fixed by the spec;
 * introducing a new axis is out of this issue's scope (issue #175's own
 * Assumptions). A plain literal union, not derived from a values catalog —
 * the canonical `(axis, value)` catalog itself moved to
 * `@/features/presets/adapter/seed-tag-catalog` (the one place it is
 * spelled out) per issue #175's revised plan, and this type only fixes the
 * four axis *keys*, which stay structurally fixed by the spec regardless.
 */
export type TagAxis = 'position' | 'players' | 'stack' | 'action';

/**
 * a Preset's selected values across all four tag axes. each axis is
 * multi-select and may be left with no selected value at all (issue #175's
 * own Assumptions) — an empty array, never `undefined`, so every one of the
 * four axes is always present on a `Preset`. a value is `string`, not a
 * compile-time literal union of the 17 known values: only the axis names
 * themselves are structurally fixed (`TagAxis` above), while their
 * individual values are bootstrap-seeded data the persistence layer
 * validates against at runtime, not the type system — a maintainer-directed
 * revision to issue #175's own plan (see its "Alternatives considered").
 */
export type PresetTags = {
  readonly [Axis in TagAxis]: readonly string[];
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
