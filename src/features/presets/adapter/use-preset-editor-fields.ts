import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { useHandRangeSelection } from '@/features/hand-ranges/adapter/use-hand-range-selection';
import type { HandRange } from '@/shared/model/hand-range';
import type { RankPairKey } from '@/shared/model/rank-pair';

import { toggleAppliedTagValue, EMPTY_APPLIED_TAG_FILTERS } from './filter-presets';
import type { Preset, PresetTags, TagAxis } from '../model/preset';

export type UsePresetEditorFieldsResult = {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  handRange: HandRange;
  setHandRange: Dispatch<SetStateAction<ReadonlySet<RankPairKey>>>;
  tags: PresetTags;
  /** toggles one `(axis, value)` pair on or off — `../adapter/
   * filter-presets.ts`'s own `toggleAppliedTagValue`, reused here since
   * `PresetTags` and `AppliedTagFilters` are the identical shape (issue
   * #177's own System design). */
  toggleTagValue: (axis: TagAxis, value: string) => void;
};

/**
 * the composing hook for the Preset editor's whole field state — name,
 * hand-range selection, and a per-axis tag selection — mirroring
 * `@/features/hand-ranges/adapter/use-holding-input.ts`'s own "one hook
 * owns the sheet's whole state" shape (issue #177's own System design cites
 * it directly). `../ui/preset-editor-screen/preset-editor-screen.tsx`
 * consumes this hook alone for its field state, rather than three separate
 * `useState` calls of its own.
 *
 * **`initialPreset` seeds the fields once, the moment it first becomes
 * available — a render-phase state adjustment, not a `useEffect`**, the
 * same pattern `useHoldingInput`'s own doc comment cites (React's
 * "Adjusting some state when a prop changes"). This hook is called
 * unconditionally on every render of the editor screen, in both create and
 * edit mode; in edit mode, `initialPreset` starts `undefined` while
 * `useEditedPreset` (`./use-edited-preset.ts`) is still fetching, and only
 * becomes defined once that fetch resolves — a transition this hook's own
 * body reseeds `name`/`handRange`/`tags` from, exactly once per preset id
 * (tracked via `seededPresetId` below), so a later render passing the same
 * `initialPreset` again never re-seeds and silently discards whatever the
 * user has since typed. Create mode passes no `initialPreset` at all, ever,
 * so its fields stay exactly as initialized: empty.
 */
export function usePresetEditorFields(initialPreset?: Preset): UsePresetEditorFieldsResult {
  const [name, setName] = useState(initialPreset?.name ?? '');
  const [handRange, setHandRange] = useHandRangeSelection(initialPreset?.handRange);
  const [tags, setTags] = useState<PresetTags>(initialPreset?.tags ?? EMPTY_APPLIED_TAG_FILTERS);

  const [seededPresetId, setSeededPresetId] = useState(initialPreset?.id);
  if (initialPreset !== undefined && initialPreset.id !== seededPresetId) {
    setSeededPresetId(initialPreset.id);
    setName(initialPreset.name);
    setHandRange(initialPreset.handRange);
    setTags(initialPreset.tags);
  }

  const toggleTagValue = useCallback((axis: TagAxis, value: string) => {
    setTags((current) => toggleAppliedTagValue(current, axis, value));
  }, []);

  return { name, setName, handRange, setHandRange, tags, toggleTagValue };
}
