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
    // `listHistoryEntries`'s own doc comment: a row whose stored column
    // fails to parse as JSON at all — reachable only by writing to the
    // SQLite file outside this app's own write path — throws out of its
    // `.all()` call and takes the whole list down; every other decode
    // failure is already isolated and reported one row at a time inside
    // that function itself. This is issue #180's own decided fallback for
    // that remaining, whole-list failure: log it the same way, and let
    // `../ui/history-screen/history-screen.tsx` fall back to the empty
    // state rather than crash the screen (issue #180's own plan, System
    // design).
    reportError(error, { tags: { feature: 'history' } });
    return { status: 'error' };
  }
}

/**
 * this feature's own React binding over `./history-entries-store.ts`'s
 * plain functions (issue #178's shipped, protected adapter) — a new call
 * site, not a change to that module's own exported contract. Loads once,
 * synchronously, on mount; `removeEntry` below both deletes from local
 * storage and updates this hook's own in-memory copy immediately, so
 * `../ui/history-screen/history-screen.tsx` never has to re-query the
 * database just to reflect a swipe-to-delete the player already watched
 * happen (issue #180's own plan: "removing the entry from local storage
 * and from the visible list immediately").
 *
 * does not re-load when another screen (Analyze) saves a fresh entry while
 * this hook's own screen stays mounted in the background — out of this
 * issue's own scope, which asks only that opening History, deleting the
 * last entry, or a failed read fall back to the empty state, not that this
 * hook track a change made from elsewhere in the app.
 */
export function useHistoryEntries(): {
  readonly state: HistoryEntriesState;
  /** deletes the entry `id` names — from local storage
   * (`deleteHistoryEntry`, issue #178's shipped operation) and from this
   * hook's own returned `state`, in one call — a no-op on `state` when the
   * current state is `'error'`, since there is no loaded list to remove
   * from. */
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
