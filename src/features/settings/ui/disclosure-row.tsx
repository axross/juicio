import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ChevronRightIcon } from '@/core/icons/chevron-right-icon';

import { SettingsRow } from './settings-row';

/**
 * a row that opens a child screen: a label, an optional current value, then
 * a chevron. Built on `SettingsRow` with `accessibilityRole="button"`, not
 * `radio` — this row selects nothing itself. The Settings screen's
 * `Language` and `Theme` rows are its two uses (issue #76, option A).
 *
 * `value` takes `flex: 1` and `numberOfLines={1}`, so a long value —
 * `English (United States)` is the longest — shrinks and ellipsizes rather
 * than pushing the chevron off the row; `label` keeps its own natural
 * width alongside it.
 */
export function DisclosureRow({
  label,
  value,
  accessibilityLabel,
  testID,
  ...props
}: Omit<
  ComponentProps<typeof SettingsRow>,
  'children' | 'accessibilityRole' | 'accessibilityChecked' | 'accessibilityLabel'
> & {
  label: string;
  /** the current value shown on the right, before the chevron — the active
   * language's or theme preference's own label. Omitted where the row
   * carries no value of its own, like `Feedback`, which uses this row's
   * sibling `FeedbackRow` instead. */
  value?: string;
  /** names the destination and, where `value` is set, includes it — e.g.
   * "Language, 日本語" — so the current value is announced without opening
   * the screen. */
  accessibilityLabel: string;
}) {
  const { theme } = useUnistyles();

  return (
    // every rest prop — `position`, `onPress`, and `style` (this row's
    // caller-`style` reaches `SettingsRow`, which merges it onto its own
    // root `Pressable`) included — spreads last (default ordering), letting
    // a caller override an explicit default; `testID` is consumed rather
    // than left in `props`, since it is also needed below for the value
    // `Text`'s own local testID, so it is threaded through to `SettingsRow`
    // explicitly instead.
    <SettingsRow
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      {...props}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={styles.value} numberOfLines={1} testID={`${testID}-value`}>
          {value}
        </Text>
      ) : null}
      <ChevronRightIcon color={theme.colors.text.neutral.low} size={24} />
    </SettingsRow>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    ...theme.typography.body,
    color: theme.colors.text.neutral.high,
  },
  value: {
    flex: 1,
    textAlign: 'right',
    ...theme.typography.caption,
    color: theme.colors.text.neutral.low,
  },
}));
