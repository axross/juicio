import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { SupportedLanguage } from '@/core/i18n';

import type { HistoryDateGroup } from '../../usecase/group-history-entries';
import { BoardGroup } from '../board-group/board-group';
import { resolveDateHeading } from './date-heading';

/**
 * one date group (`docs/specs/calculation-history.md`): a heading reading
 * "Today"/"Yesterday" for the two most recent local calendar days, or a
 * short calendar date for anything older (`./date-heading.ts`), followed
 * by every board group calculated on that day, most-recently-calculated
 * board first.
 */
export function DateGroup({
  group,
  language,
  now,
  onDeleteEntry,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  group: HistoryDateGroup;
  /** the app's current i18next language — `./date-heading.ts`'s own
   * `formatShortCalendarDate` reads it for an older date's month/day
   * order and abbreviation, per that module's own doc comment on why it
   * follows this project's own selected language rather than the device's
   * OS locale. */
  language: SupportedLanguage;
  /** the current moment "Today"/"Yesterday" is resolved against — a prop,
   * not read from `Date.now()` internally, so a re-render doesn't have to
   * race the real clock and a test can supply a fixed value; see
   * `./date-heading.ts`'s own doc comment. `../history-screen/
   * history-screen.tsx` is this component's one real caller, and supplies
   * one fresh `Date` per its own render — this component does not itself
   * decide how often that gets a new value. */
  now: Date;
  onDeleteEntry: (id: string) => void;
  testID?: string;
}) {
  const { t } = useTranslation('history');

  const heading = resolveDateHeading(group.calculatedAt, now, language);
  const headingText =
    heading.kind === 'today'
      ? t('dateHeading.today')
      : heading.kind === 'yesterday'
        ? t('dateHeading.yesterday')
        : heading.label;

  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      <Text style={styles.heading} testID={testID ? 'heading' : undefined}>
        {headingText}
      </Text>
      <View style={styles.boards}>
        {group.boards.map((boardGroup) => (
          <BoardGroup
            key={boardGroup.boardKey}
            group={boardGroup}
            onDeleteEntry={onDeleteEntry}
            // this board group's own natural key includes `group.dateKey`,
            // not only `boardGroup.boardKey` — never this component's own
            // received `testID` prop (per docs/conventions/
            // component-contracts.md's "A Non-Root Child Gets Its Own
            // Local testID"): two different date groups can otherwise
            // share the exact same board (a player recalculating the
            // identical board on two different days), which would collide
            // on `boardKey` alone once `../history-screen/
            // history-screen.tsx` renders more than one `DateGroup` at
            // once.
            testID={
              testID
                ? `board-group-${group.dateKey}-${boardGroup.boardKey || 'no-board'}`
                : undefined
            }
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    gap: theme.space.x16,
  },
  // this project's own "sectionHeading" role — the same size/face/line
  // height Analyze's own `Players` heading uses
  // (docs/conventions/design-system.md's Typography section) — reused for
  // this date heading rather than a new role: neither the Figma frame nor
  // any project doc binds a specific type role to this heading, and this
  // project already treats `sectionHeading` as its generic label role for
  // a section of a list, not something scoped to Analyze alone. Flagged in
  // this change's own receipt as an implementer's choice, not a
  // design-file reading.
  heading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
  },
  boards: {
    width: '100%',
    gap: theme.space.x24,
  },
}));
