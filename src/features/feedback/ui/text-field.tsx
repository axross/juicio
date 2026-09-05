import type { ComponentProps } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/** the single-line minimum touch target, per this project's accessibility
 * floor (see `SettingsRow`'s own `ROW_MIN_HEIGHT`). */
const FIELD_MIN_HEIGHT = 44;
/** the Message field's own measured height (~132px), per the design file's
 * Feedback screen. */
const MULTILINE_HEIGHT = 132;

/**
 * a labelled text field: a visible label above the input, then either an
 * optional hint line or — when `error` is set — an inline error in its
 * place. this project's first `TextInput`; built for the Feedback screen's
 * Message, Name, and Email fields (docs/specs/settings.md).
 *
 * **`style` and `inputStyle` reach two different elements.** this
 * component's props type inherits the `TextInput`'s own props (minus
 * `style`) per docs/conventions/component-contracts.md, since the input is
 * this field's identity, not the `View` that lays its label, hint, and
 * error line around it — that inheritance is what lets a caller reach past
 * this field's own named props for anything the input already supports
 * (`autoCapitalize`, `keyboardType`, and so on) without this project
 * inventing a matching named prop for each one. a caller's `style`, though,
 * lands on this component's own literal JSX root — the outer `View` — per
 * docs/conventions/component-styling.md, not on the inherited element;
 * `inputStyle` is the named surface that reaches the `TextInput` instead,
 * merged after `styles.input` the same way `style` merges after
 * `styles.root`.
 */
export function TextField({
  label,
  hint,
  error,
  multiline = false,
  style,
  inputStyle,
  testID,
  ...props
}: Omit<ComponentProps<typeof TextInput>, 'style'> & {
  label: string;
  /** shown beneath the input when `error` is unset. */
  hint?: string;
  /** shown beneath the input in place of `hint`, and switches the input's
   * own border to the destructive scheme. */
  error?: string;
  /** reaches this field's own outer `View` root — the label, input, and
   * hint/error line's shared layout box. */
  style?: ComponentProps<typeof View>['style'];
  /** reaches the `TextInput` itself, merged after `styles.input`. */
  inputStyle?: ComponentProps<typeof TextInput>['style'];
}) {
  const { theme } = useUnistyles();
  styles.useVariants({ multiline, invalid: error !== undefined });

  return (
    <View style={[styles.root, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholderTextColor={theme.colors.text.neutral.low}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        testID={testID}
        accessibilityLabel={label}
        // carries this field's hint/error to assistive technology on both
        // platforms — see docs/conventions/accessibility.md.
        accessibilityHint={error ?? hint}
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
    ...theme.typography.paragraph,
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
