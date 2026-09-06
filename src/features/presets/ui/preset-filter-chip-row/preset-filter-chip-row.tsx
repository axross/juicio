import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronDownIcon } from '@/core/icons/chevron-down-icon';

import { TAG_AXIS_ORDER, type AppliedTagFilters } from '../../adapter/filter-presets';
import type { TagAxis } from '../../model/preset';

/** the chip's own measured height and radius, matching
 * `@/shared/ui/hand-range-pane/hand-range-pane.tsx`'s `ShorthandChip` own
 * `CHIP_HEIGHT` exactly: this project's one existing chip precedent uses
 * the identical 37, and the Preset list's own filter row
 * (docs/operations/design-source.md's `145:22333`, `Button` instances at
 * 37 tall) measures the same value independently. */
const CHIP_HEIGHT = 37;

/**
 * the Preset list screen's own filter chip row: one chip per
 * tag axis, in `../../adapter/filter-presets.ts`'s fixed `TAG_AXIS_ORDER`
 * (Position, # of Players, Depth, Action), horizontally scrollable —
 * `docs/operations/design-source.md`'s `145:22333` draws a fourth chip
 * (`Action`) clipped at the screen's own trailing edge, confirming the row
 * scrolls rather than wrapping or shrinking to fit.
 *
 * **every chip renders identically regardless of whether its own axis
 * currently carries an applied filter** — the design's own four chip
 * instances are visually uniform whether or not `Position`/`Players` have
 * an applied value at the time (the currently-applied values are instead
 * shown entirely by `../preset-filter-pill-row/preset-filter-pill-row.tsx`
 * below this row) — so this component carries no active/inactive visual
 * variant, unlike `ShorthandChip`. `accessibilityState.selected` still
 * reflects it, non-visually.
 *
 * **static, no motion** — this project's decision boundary settles no
 * animation for this new control, unlike `ShorthandChip`'s reanimated
 * fill/ring/label transition.
 *
 * pressing a chip fires `selectionChange` (docs/conventions/haptics.md) and
 * calls `onOpenAxis` with that chip's own axis — this component holds no
 * sheet of its own; `../preset-list-screen/preset-list-screen.tsx` is what
 * actually opens `../preset-tag-picker-sheet/preset-tag-picker-sheet.tsx`
 * for whichever axis was pressed.
 */
export function PresetFilterChipRow({
  applied,
  onOpenAxis,
  testID,
  style,
  ...props
}: ComponentProps<typeof ScrollView> & {
  /** which axes currently carry an applied filter — read only for each
   * chip's own `accessibilityState.selected`, never for its visual style
   * (this component's own doc comment above). */
  applied: AppliedTagFilters;
  /** fires with the axis whose chip was pressed. named for the outcome,
   * not the mechanism, per docs/conventions/component-contracts.md; this
   * row knows nothing about the bottom sheet that opens in response. */
  onOpenAxis: (axis: TagAxis) => void;
  testID?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={[styles.root, style]}
      testID={testID}
      {...props}
    >
      {TAG_AXIS_ORDER.map((axis) => (
        <FilterChip
          key={axis}
          axis={axis}
          selected={applied[axis].length > 0}
          onPress={onOpenAxis}
          testID={testID ? `chip-${axis}` : undefined}
        />
      ))}
    </ScrollView>
  );
}

function FilterChip({
  axis,
  selected,
  onPress,
  testID,
}: {
  axis: TagAxis;
  selected: boolean;
  onPress: (axis: TagAxis) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');
  const label = t(`list.filterAxisLabel.${axis}`);

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.SelectionChange);
    onPress(axis);
  }, [axis, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel={t('list.filterChipAccessibilityLabel', { axis: label })}
      accessibilityState={{ selected }}
      testID={testID}
    >
      <Text style={styles.chipLabel} numberOfLines={1}>
        {label}
      </Text>
      <ChevronDownIcon color={theme.colors.text.neutral.high} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    // neutralises `ScrollView`'s own base style, which sets `flexGrow: 1`
    // and `flexShrink: 1` for either scroll orientation
    // (react-native@0.86.3's `ScrollView.js`) — applied along the column
    // this row sits in on the Preset list screen, not a size this
    // component is choosing.
    flexGrow: 0,
    flexShrink: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    // the measured gap between adjacent chips (`145:22333`'s own `Button`
    // instances, 4px apart) — `theme.space.x4` exactly.
    gap: theme.space.x4,
    paddingHorizontal: theme.space.x16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x4,
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.component.neutral.rest,
  },
  chipLabel: {
    ...theme.typography.chipLabel,
    color: theme.colors.text.neutral.high,
  },
}));
