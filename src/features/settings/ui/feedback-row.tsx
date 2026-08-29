import { useCallback } from 'react';
import { Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import { SpeechBubbleIcon } from '@/core/icons/speech-bubble-icon';

import type { RowPosition } from './row-position';
import { SettingsRow } from './settings-row';

type FeedbackRowProps = {
  label: string;
  onPress: () => void;
  position: RowPosition;
  testID: string;
};

/**
 * `About`'s `Feedback` row: a 24px speech-bubble icon on the left, then the
 * label. shares `SettingsRow`'s chrome with the radio rows above but is a
 * navigation button, not a radio.
 */
export function FeedbackRow({ label, onPress, position, testID }: FeedbackRowProps) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    triggerHaptic('secondaryAction');
    onPress();
  }, [onPress]);

  return (
    <SettingsRow
      position={position}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <SpeechBubbleIcon color={theme.colors.text.neutral.high} size={24} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
