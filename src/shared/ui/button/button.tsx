import type { ComponentProps, ComponentType } from 'react';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { IconProps } from '@/core/icons/icon-props';

/**
 * this project's general-purpose solid pill button — 52px tall,
 * `theme.radius.md` corners, `solid.accent.rest` filled
 * (`solid.accent.hovered` pressed), `theme.typography.label` at
 * `text.accent.onSolid`, an icon then its label. extracted from
 * `EmptyState`, its only caller until now (originally for the design's own
 * `+ New Player` action — later replaced there by a dedicated floating
 * action button, issue #155, `src/features/evaluations/ui/new-player-fab/
 * new-player-fab.tsx`) — `Button` earns the promotion to `src/shared/ui/`
 * per docs/conventions/directory-structure.md's bar for `shared/`, since a
 * second real caller (`@/shared/ui/submit-bar/submit-bar.tsx`, itself
 * promoted the same way once the Preset editor became its own second
 * caller — issue #177) already imports and renders it.
 *
 * fires the `primaryAction` haptic on every press, moved here from
 * `EmptyState`'s own `Pressable` so every future caller gets it for free —
 * and so it fires once per press, not twice, now that `EmptyState` no
 * longer fires it too.
 *
 * **`loading` swaps the icon and label for a centred spinner and ignores a
 * press, without changing the pill's own size or fill.** Added directly to
 * `Button` — for `@/shared/ui/submit-bar/submit-bar.tsx`'s own
 * in-progress-save state — rather than `SubmitBar` re-implementing the
 * pill's own fixed height/radius/fill a second time just to swap its
 * content. Defaults to `false`, so every caller before this one keeps
 * rendering exactly as it did.
 */
export function Button({
  label,
  Icon,
  onPress,
  loading = false,
  testID,
  style,
  ...props
}: ComponentProps<typeof Pressable> & {
  label: string;
  /** rendered at 24px, coloured `text.accent.onSolid`; the caller passes
   * a component, never a glyph name, per `src/core/icons/icon-props.ts`. */
  Icon: ComponentType<IconProps>;
  onPress: () => void;
  /** true while the action this button triggers is in flight. */
  loading?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    if (loading) {
      return;
    }
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress();
  }, [loading, onPress]);

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
      accessibilityState={{ busy: loading }}
      testID={testID}
      {...props}
    >
      {loading ? (
        // fixed local testID, not `${testID}-spinner` — this project's own
        // rule against building a non-root child's testID from the parent's
        // received one (docs/conventions/component-contracts.md); a single
        // `Button` instance renders at most one spinner at a time, the same
        // reasoning `HandRangePane`'s own fixed `'count'`/`'grid'` child
        // testIDs already rely on.
        <ActivityIndicator
          color={theme.colors.text.accent.onSolid}
          testID={testID ? 'spinner' : undefined}
        />
      ) : (
        <>
          <Icon color={theme.colors.text.accent.onSolid} size={24} />
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// 52 is this component's own design-fixed intrinsic dimension, per
// docs/conventions/component-styling.md's "A Design-Fixed Intrinsic
// Dimension Stays With the Component" rule — not a spacing decision, so
// not one of this project's `space.x*` steps. It matches the Settings
// screen's own row height, `ROW_HEIGHT`
// (src/features/settings/ui/settings-row.tsx) — itself a deliberate
// departure from the design file's own 44dp measurement, raised because 44
// felt too small as a touch target (docs/specs/settings.md's "The Settings
// Screen Itself" section).
const BUTTON_HEIGHT = 52;

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
