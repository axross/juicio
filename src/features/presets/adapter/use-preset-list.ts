import { useEffect, useState } from 'react';

import { reportError } from '@/core/instrumentation/report-error';

import type { Preset } from '../model/preset';
import { listPresets } from './preset-storage';

/**
 * this screen's own loading/loaded/error status — `listPresets()`'s result,
 * or the fact that it is still pending or failed. Modelled as a discriminated
 * union rather than a `presets`/`error`/`loading` triple of independent
 * flags, so `../ui/preset-list-screen/preset-list-screen.tsx` can render its
 * five states (issue #176's own plan) off one `switch`, with no
 * simultaneously-true-and-false combination to guard against.
 */
export type PresetListStatus =
  { status: 'loading' } | { status: 'loaded'; presets: readonly Preset[] } | { status: 'error' };

/**
 * loads every saved Preset once, on mount — `listPresets()` (`./preset-storage.ts`)
 * has no filter or sort query of its own to call again later, and nothing in
 * this app can create or edit a Preset yet (the Preset editor, issue #177, is
 * still a field-less stub), so there is no later moment this screen's own
 * result could go stale while it stays mounted.
 *
 * a rejection is reported (`reportError`, this project's vendor-neutral
 * capture seam) and resolves `{ status: 'error' }` — issue #176's own
 * Option A error presentation carries no retry action, so this hook exposes
 * no way to re-run the load either; the only way back to a loaded list is
 * leaving and returning to the Presets tab, which remounts this hook.
 */
export function usePresetList(): PresetListStatus {
  const [state, setState] = useState<PresetListStatus>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    listPresets()
      .then((presets) => {
        if (!cancelled) {
          setState({ status: 'loaded', presets });
        }
      })
      .catch((error: unknown) => {
        reportError(error, { tags: { feature: 'presets' }, extra: { operation: 'listPresets' } });
        if (!cancelled) {
          setState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
