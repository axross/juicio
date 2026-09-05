import { cardKey } from '@/shared/model/card';

import type { HistoryEntry } from '../model/history-entry';

/**
 * one board group within a date group: the board every entry in it was
 * calculated against, plus the entries themselves, most-recently-calculated
 * first (the same order `listHistoryEntries` already returns — see this
 * module's own doc comment on `groupHistoryEntries` below for why nothing
 * here re-sorts).
 */
export type HistoryBoardGroup = {
  /** a stable, order-preserving identity for `board` — `cardKey` joined in
   * dealing order, so two entries whose boards hold the same cards in the
   * same order land in the same group. never itself rendered; a caller's
   * own `key` for a `.map()`, and this module's own bucketing key. */
  readonly boardKey: string;
  readonly board: HistoryEntry['board'];
  readonly entries: readonly HistoryEntry[];
};

/** one date group: every board group calculated on the same local calendar
 * day, most-recently-calculated board first. */
export type HistoryDateGroup = {
  /** a stable local-calendar-day identity — `YYYY-M-D` in the device's own
   * timezone. never itself rendered; `../ui/date-group/date-heading.ts` is
   * what turns a group's own `calculatedAt` into on-screen text. */
  readonly dateKey: string;
  /** the most recent entry's own `calculatedAt` in this group — the first
   * entry `groupHistoryEntries` below sees for this date, since its input
   * is already most-recent-first. What the date heading is derived from. */
  readonly calculatedAt: number;
  readonly boards: readonly HistoryBoardGroup[];
};

/**
 * buckets `entries` — already `listHistoryEntries`'s own most-recent-first
 * order — first by the local calendar day each entry was calculated on,
 * then by the board it was calculated against, preserving that same
 * most-recent-first order both within and across every group. Issue #180's
 * own plan (System design) gives this exact shape as illustrative, not
 * binding on the module or file it becomes; this is that illustration
 * turned into a real, tested function.
 *
 * **placed under `usecase/`, not `model/`.** This is pure logic over the
 * `HistoryEntry` domain type — no I/O, no React — which
 * `docs/conventions/directory-structure.md` would ordinarily route to
 * `model/`. Issue #180's own task package protects
 * `src/features/history/model/**` outright (issue #178's own shipped
 * domain layer), so this lives in the next-most-fitting Clean Architecture
 * tier instead: an operation this feature exposes over its own model, read
 * by exactly one caller (`../ui/history-screen/history-screen.tsx`).
 *
 * **grouping is per saved `HistoryEntry`, not per player inside one.** A
 * `HistoryEntry` can hold two or three players (`docs/specs/
 * calculation-history.md`'s own "each history entry is a condensed row"),
 * and this issue's own plan states a board group's own row count is
 * "whatever the saved data contains… nothing in the domain model caps it
 * there" — explicitly not the 2-3-per-calculation cap a per-player reading
 * would impose. One `HistoryEntry` therefore becomes exactly one row
 * (`../ui/history-entry-row/history-entry-row.tsx`), never one row per
 * player.
 *
 * uses two `Map`s (keyed by `dateKey`/`boardKey`) rather than a
 * sort-and-chunk pass: a `Map` preserves insertion order, so the first
 * entry seen for a given date or board — always the most recent one, since
 * `entries` arrives pre-sorted — is what each group's own position, and a
 * date group's own `calculatedAt`, come from; every later entry for that
 * same key is appended to the existing group instead of starting a new
 * one, so a date or board that recurs later in the list (an unrelated
 * date or board sitting between two occurrences) still lands in one group
 * rather than two.
 */
export function groupHistoryEntries(entries: readonly HistoryEntry[]): readonly HistoryDateGroup[] {
  const dateGroups = new Map<
    string,
    {
      calculatedAt: number;
      boards: Map<string, { board: HistoryEntry['board']; entries: HistoryEntry[] }>;
    }
  >();

  for (const entry of entries) {
    const dateKey = localCalendarDayKey(new Date(entry.calculatedAt));
    let dateGroup = dateGroups.get(dateKey);
    if (!dateGroup) {
      dateGroup = { calculatedAt: entry.calculatedAt, boards: new Map() };
      dateGroups.set(dateKey, dateGroup);
    }

    const boardKey = entry.board.map(cardKey).join(',');
    let boardGroup = dateGroup.boards.get(boardKey);
    if (!boardGroup) {
      boardGroup = { board: entry.board, entries: [] };
      dateGroup.boards.set(boardKey, boardGroup);
    }
    boardGroup.entries.push(entry);
  }

  return Array.from(dateGroups.entries(), ([dateKey, dateGroup]) => ({
    dateKey,
    calculatedAt: dateGroup.calculatedAt,
    boards: Array.from(dateGroup.boards.entries(), ([boardKey, boardGroup]) => ({
      boardKey,
      board: boardGroup.board,
      entries: boardGroup.entries,
    })),
  }));
}

/** the device's own local calendar day for `date`, as a `Map` key — not
 * itself displayed; `../ui/date-group/date-heading.ts` derives on-screen
 * text from a group's own `calculatedAt` independently. Deliberately not
 * zero-padded (`2026-9-4`, not `2026-09-04`): nothing reads this key as a
 * sortable or parseable date string, only as an opaque bucketing identity,
 * so padding would add nothing but a mismatch risk against a hand-typed
 * test fixture. */
function localCalendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
