import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** the single-line minimum touch target, per this project's accessibility
 * floor (see `SettingsRow`'s own `ROW_MIN_HEIGHT`). */
const FIELD_MIN_HEIGHT = 44;
/** the Message field's own measured height (~132px), per the approved
 * design. */
const MULTILINE_HEIGHT = 132;

/**
 * a labelled text field: a visible label above the input, then either an
 * optional hint line or — when `error` is set — an inline error in its
 * place. this project's first `TextInput`; built for the Feedback screen's
 * Message, Name, and Email fields (docs/specs/settings.md).
 */
export function TextField({
  label,
  hint,
  error,
  multiline = false,
  style,
  testID,
  ...props
}: ComponentProps<typeof TextInput> & {
  label: string;
  /** shown beneath the input when `error` is unset. */
  hint?: string;
  /** shown beneath the input in place of `hint`, and switches the input's
   * own border to the destructive scheme. */
  error?: string;
}) {
  const { theme } = useUnistyles();
  styles.useVariants({ multiline, invalid: error !== undefined });

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={theme.colors.text.neutral.low}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        testID={testID}
        accessibilityLabel={label}
        {...props}
      />
      {error !== undefined ? (
        <Text style={styles.error} testID={testID !== undefined ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint !== undefined ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.space.x8,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.text.neutral.high,
  },
  input: {
    ...theme.typography.body,
    color: theme.colors.text.neutral.high,
    minHeight: FIELD_MIN_HEIGHT,
    paddingHorizontal: theme.space.x16,
    paddingVertical: theme.space.x12,
    borderRadius: theme.radius.md,
    borderWidth: theme.borderWidth.base,
    backgroundColor: theme.colors.component.neutral.rest,
    variants: {
      multiline: {
        true: { height: MULTILINE_HEIGHT },
        false: {},
        default: {},
      },
      invalid: {
        true: { borderColor: theme.colors.border.destructive.interactive },
        false: { borderColor: theme.colors.border.neutral.subtle },
        default: { borderColor: theme.colors.border.neutral.subtle },
      },
    },
  },
  hint: {
    ...theme.typography.description,
    color: theme.colors.text.neutral.low,
  },
  error: {
    ...theme.typography.description,
    color: theme.colors.text.destructive.high,
  },
}));
