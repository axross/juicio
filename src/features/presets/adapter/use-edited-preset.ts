import { useEffect, useState } from 'react';

import { reportError } from '@/core/instrumentation/report-error';

import type { Preset } from '../model/preset';
import { getPreset } from './preset-storage';

/**
 * the Preset editor's own loading/loaded/load-failed status for the preset
 * being edited — the same status-shape convention `./use-preset-list.ts`'s
 * own `PresetListStatus` already takes, with `'skipped'` added for create
 * mode, which needs no fetch at all (issue #177's own System design). Named
 * `load-failed`, not `error` like `PresetListStatus`, matching the Preset
 * editor's own load-failed UI state name (issue #177's own UI design
 * section).
 */
export type EditedPresetStatus =
  | { status: 'skipped' }
  | { status: 'loading' }
  | { status: 'loaded'; preset: Preset }
  | { status: 'load-failed' };

/**
 * loads the preset being edited, given its id — or does nothing at all when
 * `presetId` is `undefined` (create mode), resolving `{ status: 'skipped' }`
 * immediately rather than never resolving. Called unconditionally from
 * `../ui/preset-editor-screen/preset-editor-screen.tsx` regardless of
 * `mode`, per the Rules of Hooks; `presetId` being `undefined` is what
 * actually decides whether a fetch runs, not a conditional call to this
 * hook itself.
 *
 * a rejection — including `PresetNotFoundError` for a since-deleted preset
 * (issue #177's own Assumptions) — is reported (`reportError`, this
 * project's vendor-neutral capture seam, mirroring `use-preset-list.ts`'s
 * own `listPresets` rejection handling) and resolves `{ status:
 * 'load-failed' }`; the editor screen's own load-failed state is what gives
 * the user a way back to the list (its nav bar's existing back action),
 * this hook exposes no retry of its own.
 *
 * **resets to `loading`/`skipped` the moment `presetId` itself changes,
 * during render rather than in a `useEffect`** — the same render-phase
 * reseed `./use-preset-editor-fields.ts`'s own `usePresetEditorFields` uses
 * for an analogous "adjust state when a prop changes" case. This is what
 * keeps the effect below free of any synchronous `setState` call
 * (`react-hooks/set-state-in-effect`): its own `setState` calls all run
 * inside `getPreset`'s `.then`/`.catch`, the async-callback shape that rule
 * expects. In practice `presetId` never actually changes across this
 * hook's own lifetime — a given `PresetEditorScreen` instance is fixed to
 * one `mode`/`presetId` pair for as long as it's mounted — so this is
 * defensive correctness for the general hook contract, not a path this
 * project's own router ever exercises.
 */
export function useEditedPreset(presetId: number | undefined): EditedPresetStatus {
  const [state, setState] = useState<EditedPresetStatus>(
    presetId === undefined ? { status: 'skipped' } : { status: 'loading' },
  );
  const [seenPresetId, setSeenPresetId] = useState(presetId);

  if (presetId !== seenPresetId) {
    setSeenPresetId(presetId);
    setState(presetId === undefined ? { status: 'skipped' } : { status: 'loading' });
  }

  useEffect(() => {
    if (presetId === undefined) {
      return;
    }

    let cancelled = false;

    getPreset(presetId)
      .then((preset) => {
        if (!cancelled) {
          setState({ status: 'loaded', preset });
        }
      })
      .catch((error: unknown) => {
        reportError(error, {
          tags: { feature: 'presets' },
          extra: { operation: 'getPreset', presetId },
        });
        if (!cancelled) {
          setState({ status: 'load-failed' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [presetId]);

  return state;
}
