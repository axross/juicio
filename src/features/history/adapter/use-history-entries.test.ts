import { act, renderHook } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { historyEntries } from '@/core/db/schema';
import { reportError } from '@/core/instrumentation/report-error';
import type { Card } from '@/shared/model/card';

import type { HistoryEntryPlayer } from '../model/history-entry';
import { saveHistoryEntry } from './history-entries-store';
import { useHistoryEntries } from './use-history-entries';

jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedReportError = jest.mocked(reportError);

// `db` here is the in-memory client from `__mocks__/client.ts`
// (`jest.mock('@/core/db/client')` in jest.setup.ts) — a real SQLite
// database seeded through Drizzle primitives, per
// docs/conventions/testing.md's "Database-Backed Tests" section, never
// through this hook's own code path.

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const KING_DIAMONDS: Card = { rank: 'K', suit: 'd' };

const PLAYER: HistoryEntryPlayer = {
  holding: { kind: 'holeCards', holeCards: { first: ACE_HEARTS, second: KING_DIAMONDS } },
  result: { win: 0.6, tie: 0.02, equity: 0.61 },
  name: 'Player 1',
};

afterEach(() => {
  db.delete(historyEntries).run();
  mockedReportError.mockClear();
});

describe('useHistoryEntries()', () => {
  it('loads no entries as an empty, loaded list', () => {
    const { result } = renderHook(() => useHistoryEntries());

    expect(result.current.state).toEqual({ status: 'loaded', entries: [] });
  });

  it('loads every saved entry, most-recently-calculated first', () => {
    saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER] });
    saveHistoryEntry({ calculatedAt: 2000, board: [], players: [PLAYER] });

    const { result } = renderHook(() => useHistoryEntries());

    expect(result.current.state.status).toBe('loaded');
    expect(
      result.current.state.status === 'loaded'
        ? result.current.state.entries.map((entry) => entry.calculatedAt)
        : [],
    ).toEqual([2000, 1000]);
  });

  it('falls back to an error state and reports it when the underlying read throws', () => {
    // the one failure `listHistoryEntries` itself cannot isolate per row —
    // a stored column that is not even valid JSON, reachable only by
    // writing directly to the SQLite file outside this app's own write
    // path (see `history-entries-store.test.ts`'s own identical case).
    saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER] });
    db.run(
      sql`insert into history_entries (calculated_at, board, players) values (2000, '[]', 'not json')`,
    );

    const { result } = renderHook(() => useHistoryEntries());

    expect(result.current.state).toEqual({ status: 'error' });
    expect(mockedReportError).toHaveBeenCalledTimes(1);
  });

  it('removeEntry() deletes the entry from local storage and from the returned list, immediately', () => {
    saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER] });
    saveHistoryEntry({ calculatedAt: 2000, board: [], players: [PLAYER] });
    const { result } = renderHook(() => useHistoryEntries());
    const idToRemove =
      result.current.state.status === 'loaded' ? result.current.state.entries[0].id : '';

    act(() => {
      result.current.removeEntry(idToRemove);
    });

    expect(result.current.state.status).toBe('loaded');
    expect(
      result.current.state.status === 'loaded'
        ? result.current.state.entries.map((entry) => entry.id)
        : [],
    ).not.toContain(idToRemove);

    // a fresh hook instance, reading local storage again from scratch,
    // confirms the deletion reached storage and was not merely local
    // React state.
    const { result: freshResult } = renderHook(() => useHistoryEntries());
    expect(freshResult.current.state.status).toBe('loaded');
    expect(
      freshResult.current.state.status === 'loaded' ? freshResult.current.state.entries : [],
    ).toHaveLength(1);
  });

  it('removeEntry() is a no-op on the returned state when it is already "error"', () => {
    db.run(
      sql`insert into history_entries (calculated_at, board, players) values (1000, 'not json', '[]')`,
    );
    const { result } = renderHook(() => useHistoryEntries());
    expect(result.current.state).toEqual({ status: 'error' });

    act(() => {
      result.current.removeEntry('does-not-exist');
    });

    expect(result.current.state).toEqual({ status: 'error' });
  });
});
