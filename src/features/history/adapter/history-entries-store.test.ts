import { sql } from 'drizzle-orm';

import { db } from '@/core/db/client';
import { historyEntries } from '@/core/db/schema';
import { reportError } from '@/core/instrumentation/report-error';
import type { Card } from '@/shared/model/card';

import type { HistoryEntryPlayer } from '../model/history-entry';
import { deleteHistoryEntry, listHistoryEntries, saveHistoryEntry } from './history-entries-store';

// mirrors `src/shared/ui/button/button.test.tsx`'s own mock: `reportError`
// reaches `@sentry/react-native` for real, which this suite has no native
// module to run against under Jest.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedReportError = jest.mocked(reportError);

// `db` here is the in-memory client from `__mocks__/client.ts`
// (`jest.mock('@/core/db/client')` in jest.setup.ts), so every assertion
// below runs against a real SQLite database that has replayed this
// project's committed migrations, this new one included — not a stub. per
// docs/conventions/testing.md's "Database-Backed Tests" section.

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const KING_DIAMONDS: Card = { rank: 'K', suit: 'd' };
const TWO_CLUBS: Card = { rank: '2', suit: 'c' };

const PLAYER_A: HistoryEntryPlayer = {
  holding: { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) },
  result: { win: 0.6, tie: 0.02, equity: 0.61 },
};

const PLAYER_B: HistoryEntryPlayer = {
  holding: { kind: 'holeCards', holeCards: { first: KING_DIAMONDS, second: TWO_CLUBS } },
  result: { win: 0.38, tie: 0.02, equity: 0.39 },
};

describe('history_entries', () => {
  afterEach(() => {
    // only `history_entries` — the one table this file writes to.
    db.delete(historyEntries).run();
  });

  it('creates history_entries with the columns the generated migration declares', () => {
    // reads SQLite's own catalog rather than going through `historyEntries`,
    // so this proves the *migration SQL* created the table with these
    // columns — a `schema.ts` typo that renamed or dropped a column would
    // still pass a test that only round-tripped through the schema object
    // below. mirrors `@/core/db/client.test.ts`'s own `app_meta` case.
    const columns = db.all<{ name: string }>(sql`pragma table_info('history_entries')`);

    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'calculated_at',
      'board',
      'players',
    ]);
  });

  describe('saveHistoryEntry() / listHistoryEntries()', () => {
    it('saves exactly one new History Entry, retrievable by listHistoryEntries()', () => {
      saveHistoryEntry({
        calculatedAt: 1000,
        board: [ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS],
        players: [PLAYER_A, PLAYER_B],
      });

      const entries = listHistoryEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        calculatedAt: 1000,
        board: [ACE_HEARTS, KING_DIAMONDS, TWO_CLUBS],
        players: [PLAYER_A, PLAYER_B],
      });
      expect(typeof entries[0].id).toBe('string');
      expect(entries[0].id.length).toBeGreaterThan(0);
    });

    it('saves a preflop entry with an empty board', () => {
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A, PLAYER_B] });

      expect(listHistoryEntries()[0].board).toEqual([]);
    });

    it('lists every previously saved entry, most-recently-calculated first', () => {
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A] });
      saveHistoryEntry({ calculatedAt: 3000, board: [], players: [PLAYER_B] });
      saveHistoryEntry({ calculatedAt: 2000, board: [], players: [PLAYER_A] });

      const entries = listHistoryEntries();

      expect(entries.map((entry) => entry.calculatedAt)).toEqual([3000, 2000, 1000]);
    });

    it('starts from an empty list, proving the afterEach truncation above works', () => {
      expect(listHistoryEntries()).toEqual([]);
    });

    it('skips a row whose stored columns fail schema validation, reporting it instead of including it', () => {
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A] });
      // a row no `saveHistoryEntry()` call could produce — a shape the
      // codec's own `storedPlayersSchema` rejects (a plain string in place
      // of the array `StoredPlayer[]` it expects), the kind of drift an
      // older bundle or a hand-edited row leaves behind (see
      // `history-entry-codec.ts`'s own doc comments on why decode returns a
      // failed `DecodeResult` for this). `historyEntries.board`/`.players`
      // are `{ mode: 'json' }` columns (`@/core/db/schema.ts`), so
      // `.values()` here still writes through Drizzle's own
      // `JSON.stringify` — this is a shape mismatch, not invalid JSON text,
      // and stays isolated to this one row exactly as `listHistoryEntries`'s
      // own doc comment describes.
      db.insert(historyEntries)
        .values({ calculatedAt: 2000, board: [], players: 'not an array' })
        .run();
      saveHistoryEntry({ calculatedAt: 3000, board: [], players: [PLAYER_B] });

      const entries = listHistoryEntries();

      expect(entries.map((entry) => entry.calculatedAt)).toEqual([3000, 1000]);
      expect(mockedReportError).toHaveBeenCalledTimes(1);
      expect(mockedReportError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: expect.objectContaining({ historyEntryId: expect.any(Number) }),
        }),
      );
    });

    it('throws for the whole list, rather than isolating one row, when a row is not even valid JSON', () => {
      // the narrower guarantee `listHistoryEntries`'s own doc comment now
      // documents: `board`/`players` are `{ mode: 'json' }` columns, so
      // Drizzle's own `JSON.parse` runs on every row inside `.all()` below,
      // before this function's own per-row decoding starts — reachable only
      // by writing directly to the SQLite file outside this app's own write
      // path (`saveHistoryEntry` always writes through Drizzle's own
      // `.values()`, which serializes any JS value it's given, so it can
      // never itself produce a raw column value that fails `JSON.parse`).
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A] });
      db.run(
        sql`insert into history_entries (calculated_at, board, players) values (2000, '[]', 'not json')`,
      );

      expect(() => listHistoryEntries()).toThrow();
    });
  });

  describe('deleteHistoryEntry()', () => {
    it('removes the entry with the given id, leaving every other saved entry unaffected', () => {
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A] });
      saveHistoryEntry({ calculatedAt: 2000, board: [], players: [PLAYER_B] });
      const [keep, remove] = listHistoryEntries();

      deleteHistoryEntry(remove.id);

      const remaining = listHistoryEntries();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(keep.id);
    });

    it('is a no-op when the given id is not found', () => {
      saveHistoryEntry({ calculatedAt: 1000, board: [], players: [PLAYER_A] });

      expect(() => deleteHistoryEntry('does-not-exist')).not.toThrow();
      expect(listHistoryEntries()).toHaveLength(1);
    });
  });
});
