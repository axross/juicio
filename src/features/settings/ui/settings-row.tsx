import type { ComponentProps, ReactNode } from 'react';
import { PixelRatio, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { RowPosition } from './row-position';

/**
 * minimum touch target on every side, shared by every Settings row — the
 * Settings screen's own three rows and both child screens' option rows
 * alike, since all of them render through this one component. Raised from
 * the design file's own 44dp to 52dp — see
 * docs/specs/settings.md#the-settings-screen-itself for why.
 *
 * exported unsnapped so `settings-row.test.tsx` can assert the pixel-grid
 * snapping arithmetic against the real production value, rather than a
 * duplicated magic number.
 */
export const ROW_HEIGHT = 52;

/**
 * the one row chrome every Settings row shares — the Settings screen's own
 * `Language`, `Theme` and `Feedback` disclosure rows, and both child
 * screens' `RadioRow`s. `olive dark/3` background, 52px minimum height,
 * 16px horizontal padding and inter-child gap, a visible
 * `component.hovered` pressed state, and the group's 10px corner radius
 * applied only where `position` says it belongs — the flex-gap divider
 * between rows is the parent group's `gap`, not drawn here (see
 * `settings-section.tsx`).
 *
 * `minHeight` is snapped onto the device's own physical pixel grid with
 * `PixelRatio.roundToNearestPixel`, alongside `SettingsSection`'s card
 * `gap`, though for a different reason — see that module's comment for why
 * snapping the gap is what keeps consecutive gaps equal. Snapping
 * `minHeight` keeps each row's own rendered height identical across the
 * card, rather than varying by whatever rounding Yoga would otherwise apply
 * to an unsnapped height.
 */
export function SettingsRow({
  position,
  onPress,
  children,
  accessibilityRole,
  accessibilityLabel,
  accessibilityChecked,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  position: RowPosition;
  onPress: () => void;
  children: ReactNode;
  accessibilityRole: 'radio' | 'button' | 'switch';
  accessibilityLabel: string;
  /** a radio's or a switch's own state is reported through
   * `accessibilityState.checked` (React Native's own state prop for
   * checkbox/radio/switch-like controls), not `.selected`, which is for a
   * selected tab or list item. `switch-row.tsx` is this row's first
   * `"switch"` caller — `RadioRow`'s own `"radio"` was the only one until
   * then. */
  accessibilityChecked?: boolean;
  testID: string;
}) {
  styles.useVariants({ position });

  return (
    <Pressable
      onPress={onPress}
      // per docs/conventions/component-styling.md's Pressable row: normalizes
      // the caller's style/function before merging it last, over this row's
      // own chrome. rest props (testID included) spread last too, the
      // default ordering per docs/conventions/component-contracts.md.
      style={(state) => [
        styles.row,
        state.pressed && styles.rowPressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        accessibilityRole === 'radio' || accessibilityRole === 'switch'
          ? { checked: accessibilityChecked }
          : undefined
      }
      {...props}
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
    minHeight: PixelRatio.roundToNearestPixel(ROW_HEIGHT),
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
