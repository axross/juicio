import type { ComponentProps, ReactNode } from 'react';
import { useCallback } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { RadioIndicator } from './radio-indicator';
import { SettingsRow } from './settings-row';

/**
 * a radio row: the radio on the left (20×20), an optional leading visual
 * (a `Language` row's flag), then the label filling the rest. `Theme`
 * reuses this exact component with no `leading` — the maintainer's chosen
 * option A, per the plan.
 *
 * its own JSX root is `<SettingsRow>`, not a native element — `children`,
 * `accessibilityRole`, `accessibilityLabel`, and `accessibilityChecked` are
 * omitted from the inherited `SettingsRow` props below because this
 * component fixes all four itself (its own radio/leading/label children,
 * `"radio"`, `label` restated, and `selected` restated) rather than
 * exposing them to its own caller; every other `SettingsRow` prop,
 * `position` and `testID` included, passes through unchanged.
 */
export function RadioRow({
  label,
  selected,
  onPress,
  leading,
  ...props
}: Omit<
  ComponentProps<typeof SettingsRow>,
  'children' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityChecked'
> & {
  label: string;
  selected: boolean;
  /** the flag on a `Language` row; omitted on a `Theme` row, which is the
   * same row component with nothing filling this slot. */
  leading?: ReactNode;
}) {
  // fires on every press, the already-selected option included: the
  // feedback confirms the touch registered even when selecting it again
  // changes nothing.
  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.SelectionChange);
    onPress();
  }, [onPress]);

  return (
    // every rest prop — `position` and `testID` included — spreads last
    // (default ordering), letting a caller override an explicit default;
    // `onPress` is consumed and rewrapped (the haptic), so the caller's
    // raw `onPress` never reaches `props` to conflict with `handlePress`.
    <SettingsRow
      onPress={handlePress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityChecked={selected}
      {...props}
    >
      <RadioIndicator selected={selected} />
      {leading}
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
