import { useCallback, useState } from 'react';

import { reportError } from '@/core/instrumentation/report-error';

import type { HistoryEntry } from '../model/history-entry';
import { deleteHistoryEntry, listHistoryEntries } from './history-entries-store';

/**
 * `useHistoryEntries` below's own result — `'loaded'` (possibly empty) or
 * `'error'`, never a separate `'loading'` state: `listHistoryEntries` is a
 * synchronous SQLite read (Drizzle's own `.all()`, the same footing every
 * other read in this codebase's on-device SQLite already runs on), so
 * there is no async gap for a loading state to cover — the very first
 * render already has a real result.
 */
export type HistoryEntriesState =
  | { readonly status: 'loaded'; readonly entries: readonly HistoryEntry[] }
  | { readonly status: 'error' };

function loadHistoryEntries(): HistoryEntriesState {
  try {
    return { status: 'loaded', entries: listHistoryEntries() };
  } catch (error) {
    // logs this whole-list failure the same way `listHistoryEntries`'s own
    // doc comment already covers for its per-row failures, and falls back
    // to the empty state so `../ui/history-screen/history-screen.tsx`
    // never crashes.
    reportError(error, { tags: { feature: 'history' } });
    return { status: 'error' };
  }
}

/**
 * this feature's own React binding over `./history-entries-store.ts`'s
 * plain functions — a new call site, not a change to that module's own
 * exported contract. loads once, synchronously, on mount; `removeEntry`
 * below both deletes from local storage and updates this hook's own
 * in-memory copy immediately, so `../ui/history-screen/history-screen.tsx`
 * never has to re-query the database just to reflect a swipe-to-delete the
 * player already watched happen.
 *
 * does not re-load when another screen (Analyze) saves a fresh entry while
 * this hook's own screen stays mounted in the background: opening History,
 * deleting the last entry, or a failed read all fall back to the empty
 * state, but this hook does not track a change made from elsewhere in the
 * app.
 */
export function useHistoryEntries(): {
  readonly state: HistoryEntriesState;
  /** deletes the entry `id` names — from local storage
   * (`deleteHistoryEntry`) and from this hook's own returned `state`, in
   * one call — a no-op on `state` when the current state is `'error'`,
   * since there is no loaded list to remove from. */
  readonly removeEntry: (id: string) => void;
} {
  const [state, setState] = useState<HistoryEntriesState>(loadHistoryEntries);

  const removeEntry = useCallback((id: string) => {
    deleteHistoryEntry(id);
    setState((previous) =>
      previous.status === 'loaded'
        ? { status: 'loaded', entries: previous.entries.filter((entry) => entry.id !== id) }
        : previous,
    );
  }, []);

  return { state, removeEntry };
}
