import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronRightIcon } from '@/core/icons/chevron-right-icon';
import { SpeechBubbleIcon } from '@/core/icons/speech-bubble-icon';

import { SettingsRow } from './settings-row';

/**
 * `About`'s `Feedback` row: a 24px speech-bubble icon on the left, the
 * label, then a trailing chevron (issue #76 — every Settings row that
 * navigates now carries one, `Feedback` included, even though it already
 * navigated before this change). Shares `SettingsRow`'s chrome with the
 * radio rows and `DisclosureRow` but is a navigation button, not a radio.
 *
 * its own JSX root is `<SettingsRow>`, not a native element — `children`,
 * `accessibilityRole`, and `accessibilityLabel` are omitted from the
 * inherited `SettingsRow` props below because this component fixes all
 * three itself (its own icon/label/chevron children, `"button"`, and
 * `label` restated) rather than exposing them to its own caller; every
 * other `SettingsRow` prop, `position` and `testID` included, passes
 * through unchanged.
 */
export function FeedbackRow({
  label,
  onPress,
  ...props
}: Omit<
  ComponentProps<typeof SettingsRow>,
  'children' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityChecked'
> & {
  label: string;
}) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.SecondaryAction);
    onPress();
  }, [onPress]);

  return (
    // every rest prop — `position` and `testID` included — spreads last
    // (default ordering), letting a caller override an explicit default;
    // `onPress` is consumed and rewrapped (the haptic), so the caller's
    // raw `onPress` never reaches `props` to conflict with `handlePress`.
    <SettingsRow
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...props}
    >
      <SpeechBubbleIcon color={theme.colors.text.neutral.high} size={24} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <ChevronRightIcon color={theme.colors.text.neutral.low} size={24} />
    </SettingsRow>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    flex: 1,
    ...theme.typography.body,
    color: theme.colors.text.neutral.high,
  },
}));
