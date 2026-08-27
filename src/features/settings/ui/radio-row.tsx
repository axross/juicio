import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { RowPosition } from './row-position';
import { RadioIndicator } from './radio-indicator';
import { SettingsRow } from './settings-row';

type RadioRowProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** The flag on a `Language` row; omitted on a `Theme` row, which is the
   * same row component with nothing filling this slot. */
  leading?: ReactNode;
  position: RowPosition;
  testID: string;
};

/**
 * A radio row: the radio on the left (20×20), an optional leading visual
 * (a `Language` row's flag), then the label filling the rest. `Theme`
 * reuses this exact component with no `leading` — the maintainer's chosen
 * option A, per the plan.
 */
export function RadioRow({ label, selected, onPress, leading, position, testID }: RadioRowProps) {
  return (
    <SettingsRow
      position={position}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityChecked={selected}
      testID={testID}
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
