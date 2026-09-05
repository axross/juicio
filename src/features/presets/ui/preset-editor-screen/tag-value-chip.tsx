import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

/** matches `@/shared/ui/hand-range-pane/hand-range-pane.tsx`'s own
 * `ShorthandChip` measurements exactly (`CHIP_HEIGHT`, `CHIP_RADIUS`,
 * `CHIP_ACTIVE_RING_WIDTH`) — this project's Tags section chip and the hand
 * range's own shorthand chip are the same visual control, per issue #177's
 * own plan. */
const CHIP_HEIGHT = 37;
const CHIP_RADIUS = 20;
const CHIP_ACTIVE_RING_WIDTH = 1.5;

/**
 * the Preset editor's own Tags section value chip (issue #177) — one per
 * `(axis, value)` pair, visually matching `@/shared/ui/hand-range-pane/
 * hand-range-pane.tsx`'s own `ShorthandChip` (same fill, ring, and label
 * tokens for the rest/active pair) but **static, no motion**: this
 * project's own decision boundary for a new preset-feature chip control
 * (`../preset-filter-chip-row/preset-filter-chip-row.tsx`'s own doc
 * comment already establishes this precedent), unlike `ShorthandChip`'s own
 * Reanimated fill/ring/label transition — a Unistyles `variants` block
 * switches instantly rather than animating, which is what "static" means
 * here. `ShorthandChip` itself is not exported from its own file
 * (`docs/conventions/directory-structure.md`'s coupled-module rule), so
 * this is a new component matching it visually rather than a reuse of its
 * code.
 *
 * a checkbox, not a plain toggle button: every value on an axis may be
 * selected at once, mirroring `../preset-tag-picker-sheet/
 * preset-tag-picker-sheet.tsx`'s own `ValueRow` — `accessibilityRole`,
 * `accessibilityState.checked`, and the `toggleOn`/`toggleOff` haptic pair
 * are all reused from it directly (issue #177's own UI design section: "each
 * tag chip exposes its selected/unselected state via `accessibilityState`,
 * matching the existing tag-picker sheet's own value rows").
 */
export function TagValueChip({
  value,
  active,
  onPress,
  testID,
}: {
  value: string;
  active: boolean;
  /** fires with this chip's own `value`, whether the press selects or
   * deselects it — the caller (`preset-editor-screen.tsx`) decides which via
   * `../../adapter/filter-presets.ts`'s own `toggleAppliedTagValue`. */
  onPress: (value: string) => void;
  testID?: string;
}) {
  styles.useVariants({ active });

  const handlePress = useCallback(() => {
    triggerHaptic(active ? HapticEvent.ToggleOff : HapticEvent.ToggleOn);
    onPress(value);
  }, [active, onPress, value]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.chip}
      accessibilityRole="checkbox"
      accessibilityLabel={value}
      accessibilityState={{ checked: active }}
      testID={testID}
    >
      <View style={styles.ring} pointerEvents="none" />
      <Text style={styles.label} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: CHIP_RADIUS,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    variants: {
      active: {
        true: { backgroundColor: theme.colors.component.accent.selected },
        false: { backgroundColor: theme.colors.component.neutral.rest },
        default: { backgroundColor: theme.colors.component.neutral.rest },
      },
    },
  },
  // the active ring: an absolutely-positioned overlay on top of the same
  // box, not a wider border on `chip` itself — the identical reasoning
  // `ShorthandChip`'s own `chipActiveRing` doc comment gives (a border on
  // `chip` would grow its intrinsic width and shift every chip after it).
  // `pointerEvents="none"` keeps it out of this chip's own hit test.
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CHIP_RADIUS,
    borderWidth: CHIP_ACTIVE_RING_WIDTH,
    variants: {
      active: {
        true: { borderColor: theme.colors.text.accent.low },
        false: { borderColor: 'transparent' },
        default: { borderColor: 'transparent' },
      },
    },
  },
  label: {
    ...theme.typography.chipLabel,
    variants: {
      active: {
        true: { color: theme.colors.text.accent.low },
        false: { color: theme.colors.text.neutral.high },
        default: { color: theme.colors.text.neutral.high },
      },
    },
  },
}));
