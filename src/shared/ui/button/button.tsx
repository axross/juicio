import type { ComponentType } from 'react';
import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';

export type ButtonProps = {
  label: string;
  /** rendered at 24px, coloured `text.accent.onSolid`; the caller passes
   * a component, never a glyph name, per `src/core/icons/icon-props.ts`. */
  Icon: ComponentType<IconProps>;
  onPress: () => void;
  testID?: string;
};

/**
 * the solid pill button the design's `+ New Player` action uses — 44px
 * tall, `theme.radius.md` corners, `solid.accent.rest` filled (
 * `solid.accent.hovered` pressed), `theme.typography.label` at
 * `text.accent.onSolid`, an icon then its label. extracted from
 * `EmptyState`, which was this button's only caller until now: `Button`
 * is `src/shared/ui/`'s second module, earning the promotion per
 * docs/conventions/directory-structure.md's bar for `shared/` because a
 * second real caller — issue #66's hand-range preset editor, run 4 —
 * arrives after this change, not concurrently with it.
 *
 * fires the `primaryAction` haptic on every press. moved here from
 * `EmptyState`, which fired it directly against its own `Pressable`, so
 * every future caller gets the feedback without wiring it itself — and so
 * it fires exactly once per press rather than twice, since `EmptyState`
 * no longer also fires it.
 */
export function Button({ label, Icon, onPress, testID }: ButtonProps) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    triggerHaptic('primaryAction');
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.root, pressed && styles.rootPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon color={theme.colors.text.accent.onSolid} size={24} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// the button height (44) is a fixed control dimension — a well-known
// minimum touch target, not a spacing decision — per
// react-component-styling's "Fixed element dimensions" exemption; it is not
// one of this project's `space.x*` steps.
const BUTTON_HEIGHT = 44;

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // measures 6px in the design; snapped up to this project's existing
    // 8px row/icon gap when this button was first built, under this
    // document's now-superseded normalize-by-default rule (see
    // docs/conventions/design-system.md's Spacing and Radius section).
    // left unchanged by this extraction, which does not revisit this
    // button's pixel value.
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
