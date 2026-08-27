import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { RowPosition } from './row-position';

/** Minimum touch target on every side, per the design's rows and this
 * project's accessibility floor. */
const ROW_MIN_HEIGHT = 44;

type SettingsRowProps = {
  position: RowPosition;
  onPress: () => void;
  children: ReactNode;
  accessibilityRole: 'radio' | 'button';
  accessibilityLabel: string;
  /** A radio's selection is reported through `accessibilityState.checked`
   * (React Native's own state prop for checkbox/radio/switch-like
   * controls), not `.selected`, which is for a selected tab or list item. */
  accessibilityChecked?: boolean;
  testID: string;
};

/**
 * The one row chrome every Settings row shares — `Language`'s and `Theme`'s
 * radio rows, and `About`'s `Feedback` row — per the plan's requirement that
 * Theme reuse the exact row component Language uses. `olive dark/3`
 * background, 44px minimum height, 16px horizontal padding and inter-child
 * gap, a visible `component.hovered` pressed state, and the group's 10px
 * corner radius applied only where `position` says it belongs — the
 * flex-gap divider between rows is the parent group's `gap`, not drawn here.
 */
export function SettingsRow({
  position,
  onPress,
  children,
  accessibilityRole,
  accessibilityLabel,
  accessibilityChecked,
  testID,
}: SettingsRowProps) {
  styles.useVariants({ position });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        accessibilityRole === 'radio' ? { checked: accessibilityChecked } : undefined
      }
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: theme.space.x16,
    backgroundColor: theme.colors.component.neutral.rest,
    variants: {
      position: {
        single: { borderRadius: theme.radius.md },
        top: { borderTopLeftRadius: theme.radius.md, borderTopRightRadius: theme.radius.md },
        bottom: {
          borderBottomLeftRadius: theme.radius.md,
          borderBottomRightRadius: theme.radius.md,
        },
        middle: {},
        default: {},
      },
    },
  },
  rowPressed: {
    backgroundColor: theme.colors.component.neutral.hovered,
  },
}));
