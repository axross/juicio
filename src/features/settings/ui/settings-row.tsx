import type { ComponentProps, ReactNode } from 'react';
import { PixelRatio, Pressable } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { RowPosition } from './row-position';

/**
 * minimum touch target on every side, shared by every Settings row — the
 * Settings screen's own three rows and both child screens' option rows
 * alike, since all of them render through this one component. Raised from
 * the design file's own 44dp to 52dp (issue #76, option A) — the design
 * file specifies no row taller than 44dp; this is settled behaviour ahead
 * of it, the same way `Theme`'s section already was.
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
  accessibilityRole: 'radio' | 'button';
  accessibilityLabel: string;
  /** a radio's selection is reported through `accessibilityState.checked`
   * (React Native's own state prop for checkbox/radio/switch-like
   * controls), not `.selected`, which is for a selected tab or list item. */
  accessibilityChecked?: boolean;
  testID: string;
}) {
  styles.useVariants({ position });

  return (
    <Pressable
      onPress={onPress}
      // `Pressable`'s own `style` accepts a plain style or a function of its
      // press state; a caller-supplied `style` can be either shape too, so
      // it's normalized before merging — this row's own `styles.row`/
      // `styles.rowPressed` first, the caller's last, so an extending
      // caller doesn't wipe the row's own chrome. every other rest prop,
      // `testID` included, spreads last, letting a caller override an
      // explicit default.
      style={(state) => [
        styles.row,
        state.pressed && styles.rowPressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        accessibilityRole === 'radio' ? { checked: accessibilityChecked } : undefined
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
