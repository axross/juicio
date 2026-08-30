import type { ComponentProps, ComponentType } from 'react';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';

/**
 * the solid pill button the design's `+ New Player` action uses — 44px
 * tall, `theme.radius.md` corners, `solid.accent.rest` filled
 * (`solid.accent.hovered` pressed), `theme.typography.label` at
 * `text.accent.onSolid`, an icon then its label. extracted from
 * `EmptyState`, its only caller until now — `Button` earns the promotion
 * to `src/shared/ui/` per docs/conventions/directory-structure.md's bar
 * for `shared/`, since a second real caller is arriving next.
 *
 * fires the `primaryAction` haptic on every press, moved here from
 * `EmptyState`'s own `Pressable` so every future caller gets it for free —
 * and so it fires once per press, not twice, now that `EmptyState` no
 * longer fires it too.
 */
export function Button({
  label,
  Icon,
  onPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  label: string;
  /** rendered at 24px, coloured `text.accent.onSolid`; the caller passes
   * a component, never a glyph name, per `src/core/icons/icon-props.ts`. */
  Icon: ComponentType<IconProps>;
  onPress: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      // `Pressable`'s own `style` accepts a plain style or a function of
      // its press state; a caller-supplied `style` can be either shape too,
      // so it's normalized before merging — this component's own states
      // first, the caller's last, so an extending caller doesn't wipe the
      // pill's fill/radius.
      style={(state) => [
        styles.root,
        state.pressed && styles.rootPressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      {...props}
    >
      <Icon color={theme.colors.text.accent.onSolid} size={24} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// 44 is a fixed control dimension — a minimum touch target, not a spacing
// decision — per react-component-styling's "Fixed element dimensions"
// exemption; not one of this project's `space.x*` steps.
const BUTTON_HEIGHT = 44;

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // measures 6px in the design; snapped up to this project's 8px
    // row/icon gap under a now-superseded normalize-by-default rule (see
    // docs/conventions/design-system.md's Spacing and Radius section).
    // left as-is by this extraction.
    gap: theme.space.x8,
    height: BUTTON_HEIGHT,
    minWidth: BUTTON_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.solid.accent.rest,
  },
  rootPressed: {
    backgroundColor: theme.colors.solid.accent.hovered,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.text.accent.onSolid,
  },
}));
