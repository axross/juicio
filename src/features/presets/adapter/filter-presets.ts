import type { Preset, PresetTags, TagAxis } from '../model/preset';
import { TAG_CATALOG } from './seed-tag-catalog';

/**
 * the four tag axes, in the fixed display order
 * docs/conventions/design-system.md's App-Wide Copy Conventions section and
 * docs/specs/hand-ranges.md's Preset section both fix: `Position`,
 * `# of Players`, `Depth`, `Action`. Reused for both the filter chip row's
 * own left-to-right order and `presetTagSummary`'s join order
 * (`../ui/preset-row/preset-row.tsx`), so the two can never disagree about
 * which axis comes first.
 */
export const TAG_AXIS_ORDER: readonly TagAxis[] = ['position', 'players', 'stack', 'action'];

/**
 * every value a given axis's filter picker offers — `TAG_CATALOG`
 * (`./seed-tag-catalog.ts`) read back through this feature's own adapter
 * surface, rather than every caller importing that module directly.
 */
export function tagAxisValues(axis: TagAxis): readonly string[] {
  return TAG_CATALOG[axis];
}

/**
 * the filter selection this screen holds: zero or more applied values per
 * axis, the same shape a `Preset`'s own `tags` field takes
 * (`../model/preset.ts`'s `PresetTags`) — an axis with nothing applied is an
 * empty array, never left out, so all four axes are always present.
 */
export type AppliedTagFilters = PresetTags;

/** every axis with no filter applied — the list's own unfiltered starting state. */
export const EMPTY_APPLIED_TAG_FILTERS: AppliedTagFilters = {
  position: [],
  players: [],
  stack: [],
  action: [],
};

/** `true` once at least one axis carries an applied value — gates whether
 * the applied-filter pill row renders at all
 * (`../ui/preset-filter-pill-row/preset-filter-pill-row.tsx`). */
export function hasAnyAppliedTagFilter(applied: AppliedTagFilters): boolean {
  return TAG_AXIS_ORDER.some((axis) => applied[axis].length > 0);
}

/**
 * narrows `presets` against `applied`: OR within one axis (a preset matches
 * that axis if it carries *any* one of the axis's applied values), AND
 * across axes (a preset must match *every* axis that has an applied value),
 * and an axis with nothing applied is skipped entirely — it never excludes a
 * preset, matching or not. read by
 * `../ui/preset-list-screen/preset-list-screen.tsx` and asserted directly by
 * this file's own test.
 */
export function filterPresetsByTags(
  presets: readonly Preset[],
  applied: AppliedTagFilters,
): readonly Preset[] {
  return presets.filter((preset) =>
    TAG_AXIS_ORDER.every((axis) => {
      const appliedValues = applied[axis];
      if (appliedValues.length === 0) {
        return true;
      }
      return preset.tags[axis].some((value) => appliedValues.includes(value));
    }),
  );
}

/** applies (or, pressed a second time, un-applies) one `(axis, value)` pair
 * against `applied`, returning a new `AppliedTagFilters` — every other axis
 * untouched. Used by a per-axis picker's own value chip
 * (`../ui/preset-tag-picker-sheet/preset-tag-picker-sheet.tsx`). */
export function toggleAppliedTagValue(
  applied: AppliedTagFilters,
  axis: TagAxis,
  value: string,
): AppliedTagFilters {
  const current = applied[axis];
  const next = current.includes(value)
    ? current.filter((existing) => existing !== value)
    : [...current, value];
  return { ...applied, [axis]: next };
}

/** removes one applied `(axis, value)` pair, restoring whatever presets that
 * value alone had excluded — every other applied value, on this axis and
 * every other, stays in effect. Used by the applied-filter pill row's own
 * removable pill (`../ui/preset-filter-pill-row/preset-filter-pill-row.tsx`). */
export function removeAppliedTagValue(
  applied: AppliedTagFilters,
  axis: TagAxis,
  value: string,
): AppliedTagFilters {
  return { ...applied, [axis]: applied[axis].filter((existing) => existing !== value) };
}
