import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';

/**
 * the Analyze players section's own add-player affordance (issue #155):
 * a persistent floating action button — the design's `PlusIcon` beside a
 * `New Player` label — replacing the two state-dependent entry points this
 * project shipped before it (the empty state's own pill `Button`, and
 * `PlayerList`'s trailing `NewPlayerRow`). Single-purpose and
 * single-caller, the same shape `NewPlayerRow` (the component it replaces)
 * already took: the icon and the label are fixed rather than props, since
 * there is exactly one thing this button ever does.
 *
 * styled from the same tokens the pill `Button` this replaces already
 * used — `theme.radius.md` (not `theme.radius.full`; a deliberate,
 * human-approved departure from a typical FAB's fully-rounded pill, per
 * the plan's own UI design section), `solid.accent.rest`/`.hovered`, and
 * `text.accent.onSolid` — plus `theme.effects.sheetInverted`, the design
 * system's bottom-anchored floating-surface elevation
 * (docs/conventions/design-system.md's Effects section), which the pill
 * `Button` never needed since it was never itself a floating surface.
 *
 * **takes no position of its own.** Per
 * docs/conventions/component-styling.md's "Placement Is the Caller's"
 * rule, this component's own root sets no `position`, `bottom`, `right`,
 * or `zIndex` — `../analyze-screen/analyze-screen.tsx`, its only caller,
 * supplies the screen's own bottom-right offset through this component's
 * `style` prop, over a `position: relative` container it establishes
 * itself. No portal: unlike `BottomSheet` and `Toast`, this button never
 * needs to escape a clipping ancestor or stack above another screen — it
 * only ever floats above the Analyze screen's own content (the plan's own
 * Alternatives Considered section).
 *
 * fires the `primaryAction` haptic on every press, the same event the two
 * entry points this button replaces both fired
 * (docs/conventions/haptics.md) — Apple's Consistency Rule is explicit
 * that the same gesture must not read as a different sensation on two
 * different screens, and this button now the only one raising it here.
 */
export function NewPlayerFab({
  onPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  onPress: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const label = t('newPlayerFab.label');

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      // `Pressable`'s own `style` accepts a plain style or a function of
      // its press state; a caller-supplied `style` can be either shape
      // too, so it's normalized before merging — this component's own
      // states first, the caller's last, so an extending caller doesn't
      // wipe the button's fill/radius/shadow — see `../../../../shared/ui/
      // button/button.tsx`'s identical merge for the pill button this
      // component's own visual identity is drawn from.
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
      <PlusIcon color={theme.colors.text.accent.onSolid} size={24} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// this component's own design-fixed intrinsic dimension, per
// docs/conventions/component-styling.md's "A Design-Fixed Intrinsic
// Dimension Stays With the Component" rule — not a placement choice a
// caller is making. 44 is this project's own touch-target floor
// (docs/conventions/design-system.md), the same value the pill `Button`
// this component's visual identity is drawn from already uses as its own
// measured height.
const FAB_HEIGHT = 44;

const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.x8,
    height: FAB_HEIGHT,
    minWidth: FAB_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.solid.accent.rest,
    // the bottom-anchored floating-surface effect
    // (docs/conventions/design-system.md's Effects section) — never
    // `theme.effects.sheet`, which is for a top-anchored surface.
    boxShadow: theme.effects.sheetInverted,
  },
  rootPressed: {
    backgroundColor: theme.colors.solid.accent.hovered,
  },
  label: {
    ...theme.typography.label,
    color: theme.colors.text.accent.onSolid,
  },
}));
