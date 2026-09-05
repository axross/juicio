import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';

/**
 * the Preset list screen's own persistent "new preset" affordance (issue
 * #176's Assumptions: "a persistent floating action button, bottom-right,
 * matching Analyze's existing 'New Player' button"). Visually and
 * behaviourally identical to `@/features/evaluations/ui/new-player-fab/
 * new-player-fab.tsx` — same fixed icon-plus-label shape, same
 * `theme.radius.md`/`sheetInverted` visual identity, same `primaryAction`
 * haptic on every press — but **its own, local component**, not a shared
 * import: docs/conventions/directory-structure.md warns against promoting a
 * component to `shared/` on "two features merely looking alike," and
 * features may not import one another's own `ui/` components regardless.
 * Single-purpose and single-caller, the same shape `NewPlayerFab` itself
 * takes: the icon and the label are fixed rather than props, since there is
 * exactly one thing this button ever does.
 *
 * **takes no position of its own** — `../preset-list-screen/
 * preset-list-screen.tsx`, its only caller, supplies the screen's own
 * bottom-right offset through this component's `style` prop, per
 * docs/conventions/component-styling.md's "Placement Is the Caller's" rule,
 * mirroring `NewPlayerFab`'s identical carve-out.
 */
export function NewPresetFab({
  onPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  onPress: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');
  const label = t('list.newPresetFab.label');

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
      // states first, the caller's last, mirroring `NewPlayerFab`'s
      // identical merge.
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

// this component's own design-fixed intrinsic dimension, mirroring
// `NewPlayerFab`'s identical `FAB_HEIGHT` — this project's own touch-target
// floor (docs/conventions/design-system.md), not a placement choice.
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
