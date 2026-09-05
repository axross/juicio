import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { Switch, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { SettingsRow } from './settings-row';

/**
 * a switch row: the label filling the row, a native `Switch` on the right —
 * this app's first boolean switch control. Settings' Theme row
 * is a radio, not a toggle, so `docs/conventions/haptics.md`'s
 * `toggleOn`/`toggleOff` events were designated for exactly this shape but
 * had no caller until now — see this row's own `handleChange`. The
 * Analytics screen's tracking control is its one use.
 *
 * its own JSX root is `<SettingsRow>`, not a native element — `children`,
 * `accessibilityRole`, `accessibilityLabel`, `accessibilityChecked`, and
 * `onPress` are omitted from the inherited `SettingsRow` props below
 * because this component fixes all five itself (its own label/switch
 * children, `"switch"`, `label` restated, `value` restated, and a full-row
 * press toggling the switch) rather than exposing them to its own caller;
 * every other `SettingsRow` prop, `position` and `testID` included, passes
 * through unchanged.
 *
 * pressing anywhere on the row toggles the switch, not only the `Switch`'s
 * own smaller touch target — the same full-row affordance every other row
 * in this app already gives. React Native's responder system resolves a
 * tap that lands directly on the nested `Switch` to that control alone
 * (never both handlers for the same touch), and `SettingsRow`'s own
 * `Pressable` defaults to `accessible: true`, which — as it already does
 * for `RadioRow`'s indicator and `DisclosureRow`/`FeedbackRow`'s chevron —
 * collapses this row into the one accessible element a screen reader
 * reaches, rather than a second, separately focusable stop for the native
 * `Switch` itself.
 */
export function SwitchRow({
  label,
  value,
  onValueChange,
  ...props
}: Omit<
  ComponentProps<typeof SettingsRow>,
  'children' | 'accessibilityRole' | 'accessibilityLabel' | 'accessibilityChecked' | 'onPress'
> & {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { theme } = useUnistyles();

  const handleChange = useCallback(
    (next: boolean) => {
      triggerHaptic(next ? HapticEvent.ToggleOn : HapticEvent.ToggleOff);
      onValueChange(next);
    },
    [onValueChange],
  );

  return (
    <SettingsRow
      onPress={() => handleChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityChecked={value}
      {...props}
    >
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={handleChange}
        trackColor={{
          false: theme.colors.component.neutral.restAlpha,
          true: theme.colors.text.accent.brand,
        }}
        thumbColor={theme.colors.text.neutral.onSolid}
        ios_backgroundColor={theme.colors.component.neutral.restAlpha}
      />
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
