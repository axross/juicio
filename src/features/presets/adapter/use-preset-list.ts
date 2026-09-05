import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { reportError } from '@/core/instrumentation/report-error';

import type { Preset } from '../model/preset';
import { listPresets } from './preset-storage';

/**
 * this screen's own loading/loaded/error status — `listPresets()`'s result,
 * or the fact that it is still pending or failed. Modelled as a discriminated
 * union rather than a `presets`/`error`/`loading` triple of independent
 * flags, so `../ui/preset-list-screen/preset-list-screen.tsx` can render its
 * five states off one `switch`, with no simultaneously-true-and-false
 * combination to guard against.
 */
export type PresetListStatus =
  { status: 'loading' } | { status: 'loaded'; presets: readonly Preset[] } | { status: 'error' };

/**
 * loads every saved Preset whenever the Presets tab regains focus, not only
 * once on mount, so a preset saved or changed in the Preset editor is
 * visible on returning to this list without remounting the Presets tab.
 * `useFocusEffect` (from `expo-router`, which re-exports
 * `@react-navigation/native`'s own hook — this project carries no direct
 * `@react-navigation/native` dependency of its own) runs its effect
 * immediately on the first render if this screen is already focused (the
 * Presets tab is focused the moment it mounts) and again on every
 * subsequent focus.
 *
 * a rejection is reported (`reportError`, this project's vendor-neutral
 * capture seam) and resolves `{ status: 'error' }` — this error presentation
 * carries no retry action, so this hook exposes no way to re-run the load
 * either beyond navigating away from and back to the Presets tab, which now
 * reloads through this same focus effect rather than needing a remount.
 *
 * **does not reset to `loading` on a refocus reload** — a returning user
 * keeps seeing the list they already had until the fresh one resolves,
 * rather than a spinner flashing over already-loaded content on every tab
 * switch.
 */
export function usePresetList(): PresetListStatus {
  const [state, setState] = useState<PresetListStatus>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
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
    }, []),
  );

  return state;
}
