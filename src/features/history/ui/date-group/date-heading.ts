import type { SupportedLanguage } from '@/core/i18n';

/**
 * a date group's own heading. `'today'`/`'yesterday'` carry no text of
 * their own — `./date-group.tsx` resolves those through
 * `useTranslation('history')`, per this project's own `t()`-at-the-call
 * -site split (the same one `../../../evaluations/ui/player-row-content/
 * player-row-content.tsx`'s own doc comment states: "the caller resolves
 * the string, the component only lays it out"); `'date'` already carries
 * its own locale-formatted label, since `formatShortCalendarDate` below has
 * nothing to translate — the month abbreviation and day order come from
 * `Intl.DateTimeFormat` itself.
 */
export type DateHeading =
  | { readonly kind: 'today' }
  | { readonly kind: 'yesterday' }
  | { readonly kind: 'date'; readonly label: string };

/**
 * resolved against `now` and the app's current `language` rather than read
 * from the system clock or device locale directly — the same "pass `now`
 * in" shape this project gives every other now-dependent pure function, so
 * a test can assert "Today"/"Yesterday" deterministically instead of
 * racing the real clock, and so a locale change in Settings' own
 * `Language` row (not necessarily the OS locale) is what the `'date'`
 * branch's month/day formatting actually follows.
 *
 * "Today"/"Yesterday" for the two most recent local calendar days, a short
 * calendar date for anything older — the issue's own plan draws this exact
 * line (its own Assumptions section: no design-file example beyond
 * "Today," so this fills in the plan's own undefined remainder, confirmed
 * with the maintainer). Compares local calendar days, not a rolling
 * 24/48-hour window, so a calculation from 11pm yesterday and one from 1am
 * today read as two different days even though under two hours apart —
 * the same "local calendar day" `../../usecase/group-history-entries.ts`'s
 * own bucketing already uses, so a date group's own heading and the group
 * boundary it labels never disagree.
 */
export function resolveDateHeading(
  calculatedAt: number,
  now: Date,
  language: SupportedLanguage,
): DateHeading {
  const calculated = new Date(calculatedAt);
  if (isSameLocalCalendarDay(calculated, now)) {
    return { kind: 'today' };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalCalendarDay(calculated, yesterday)) {
    return { kind: 'yesterday' };
  }

  return { kind: 'date', label: formatShortCalendarDate(calculatedAt, language) };
}

function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const INTL_LOCALE_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  en: 'en-US',
  ja: 'ja-JP',
};

/**
 * a short calendar date — `Sep 2` in English, `9月2日` in Japanese —
 * through `Intl.DateTimeFormat` rather than a hand-built month-name table:
 * the month abbreviation and day/month order are exactly what a reader's
 * own locale already expects, and neither language needs translated copy
 * of its own for this (unlike "Today"/"Yesterday" above, there is no fixed
 * string to add to `src/core/i18n/resources/`).
 */
export function formatShortCalendarDate(calculatedAt: number, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(INTL_LOCALE_BY_LANGUAGE[language], {
    month: 'short',
    day: 'numeric',
  }).format(new Date(calculatedAt));
}
