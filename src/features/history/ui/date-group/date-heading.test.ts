import { formatShortCalendarDate, resolveDateHeading } from './date-heading';

const NOW = new Date(2026, 8, 4, 15, 0, 0); // Sep 4, 2026, 3pm local

describe('resolveDateHeading', () => {
  it('reads "today" for a calculation earlier the same local day', () => {
    const earlierToday = new Date(2026, 8, 4, 6, 0, 0).getTime();

    expect(resolveDateHeading(earlierToday, NOW, 'en')).toEqual({ kind: 'today' });
  });

  it('reads "today" for a calculation later the same local day', () => {
    const laterToday = new Date(2026, 8, 4, 23, 59, 0).getTime();

    expect(resolveDateHeading(laterToday, NOW, 'en')).toEqual({ kind: 'today' });
  });

  it('reads "yesterday" for a calculation on the local calendar day before now', () => {
    const yesterday = new Date(2026, 8, 3, 23, 0, 0).getTime();

    expect(resolveDateHeading(yesterday, NOW, 'en')).toEqual({ kind: 'yesterday' });
  });

  it('does not read "yesterday" for a calculation under 24 hours ago that crossed a calendar day boundary the other way', () => {
    // 2026-09-04 00:30 — under 24h before NOW (2026-09-04 15:00), but the
    // *same* local day as NOW, not the day before it: this must still read
    // "today", proving the comparison is calendar-day-based, not a rolling
    // 24-hour window.
    const earlyThisMorning = new Date(2026, 8, 4, 0, 30, 0).getTime();

    expect(resolveDateHeading(earlyThisMorning, NOW, 'en')).toEqual({ kind: 'today' });
  });

  it('falls back to a formatted short calendar date for anything older than yesterday', () => {
    const twoDaysAgo = new Date(2026, 8, 2, 12, 0, 0).getTime();

    expect(resolveDateHeading(twoDaysAgo, NOW, 'en')).toEqual({ kind: 'date', label: 'Sep 2' });
  });

  it('formats the older-date fallback in Japanese when the app language is ja', () => {
    const twoDaysAgo = new Date(2026, 8, 2, 12, 0, 0).getTime();

    expect(resolveDateHeading(twoDaysAgo, NOW, 'ja')).toEqual({ kind: 'date', label: '9月2日' });
  });
});

describe('formatShortCalendarDate', () => {
  it('formats an English short calendar date as "Mon D"', () => {
    const date = new Date(2026, 11, 25, 0, 0, 0).getTime();

    expect(formatShortCalendarDate(date, 'en')).toBe('Dec 25');
  });
});
