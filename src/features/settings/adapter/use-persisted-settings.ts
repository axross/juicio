import { useEffect, useState } from 'react';

import { normalizeError } from '@/core/instrumentation/normalize-error';
import { reportError } from '@/core/instrumentation/report-error';

import { applyPersistedSettings } from '../usecase/apply-persisted-settings';

export type PersistedSettingsState = {
  /** True once `applyPersistedSettings` has settled — successfully or not.
   * The root layout's readiness gate waits on this, never on `error` alone,
   * so a failed settings read can never leave the app stuck behind the
   * splash screen. */
  ready: boolean;
  error: Error | null;
};

/**
 * Applies the persisted language and theme once, on mount, and reports
 * whether that has finished. This is the root call site for
 * `applyPersistedSettings()`'s failure: a rejection is reported to the error
 * tracker here before `ready` is ever set, so a production failure is never
 * invisible. `ready: true` is still set regardless — the app already has a
 * working device-locale language and a `system` theme before this runs, so
 * there is nothing to override and no reason to block the launch over it.
 */
export function usePersistedSettings(): PersistedSettingsState {
  const [state, setState] = useState<PersistedSettingsState>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;

    applyPersistedSettings()
      .then(() => {
        if (!cancelled) {
          setState({ ready: true, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const normalizedError = normalizeError(error);
          reportError(normalizedError, {
            tags: { module: 'settings' },
            extra: { operation: 'applyPersistedSettings' },
          });
          setState({ ready: true, error: normalizedError });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
