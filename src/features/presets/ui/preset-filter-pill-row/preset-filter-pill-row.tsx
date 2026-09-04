import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { XIcon } from '@/core/icons/x-icon';

import {
  TAG_AXIS_ORDER,
  tagAxisValues,
  type AppliedTagFilters,
} from '../../adapter/filter-presets';
import type { TagAxis } from '../../model/preset';

/** matches `../preset-filter-chip-row/preset-filter-chip-row.tsx`'s own
 * `CHIP_HEIGHT` — the design's own pill instances
 * (`docs/operations/design-source.md`'s `145:22333`, `Frame 181`'s own
 * `Button` children) measure the identical 37. */
const PILL_HEIGHT = 37;

/**
 * the Preset list screen's own applied-filter pill row (issue #176): every
 * currently-applied `(axis, value)` pair, one pill each, in the fixed
 * `TAG_AXIS_ORDER` (Position, # of Players, Depth, Action) and, within one
 * axis, in that axis's own catalog order (`../../adapter/
 * filter-presets.ts`'s `tagAxisValues`) — never insertion/toggle order,
 * which would let repeatedly toggling one value shuffle its neighbours.
 * Renders nothing at all while no filter is applied
 * (`hasAnyAppliedTagFilter`), per issue #176's own UI design: "shown only
 * once at least one filter is applied."
 *
 * a pill's own value renders verbatim, the catalog's own literal string
 * (`100BB`, never `100 BB`) — this project's settled subtitle/pill format
 * (`docs/conventions/design-system.md`'s App-Wide Copy Conventions), the
 * same value `../preset-row/preset-row.tsx`'s own tag summary already
 * reproduces unmodified.
 *
 * pressing a pill's own `X` removes just that one applied value
 * (`removeAppliedTagValue`, `../../adapter/filter-presets.ts`) and fires
 * `secondaryAction` (docs/conventions/haptics.md) — this component holds no
 * filter state of its own; `../preset-list-screen/preset-list-screen.tsx`
 * owns `AppliedTagFilters` and passes the narrowed result back down.
 *
 * **static, no motion**, the same departure from `ShorthandChip`
 * `../preset-filter-chip-row/preset-filter-chip-row.tsx`'s own doc comment
 * states — issue #176's own plan draws no animation for this new control.
 */
export function PresetFilterPillRow({
  applied,
  onRemove,
  testID,
  style,
  ...props
}: ComponentProps<typeof ScrollView> & {
  applied: AppliedTagFilters;
  /** fires with the `(axis, value)` pair whose pill's `X` was pressed.
   * named for the outcome, not the mechanism, per docs/conventions/
   * component-contracts.md; this row knows nothing about
   * `../../adapter/filter-presets.ts`'s own `removeAppliedTagValue`, which
   * `../preset-list-screen/preset-list-screen.tsx` is what actually
   * calls. */
  onRemove: (axis: TagAxis, value: string) => void;
  testID?: string;
}) {
  const pills = TAG_AXIS_ORDER.flatMap((axis) => {
    const catalogOrder = tagAxisValues(axis);
    return [...applied[axis]]
      .sort((a, b) => catalogOrder.indexOf(a) - catalogOrder.indexOf(b))
      .map((value) => ({ axis, value }));
  });

  if (pills.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={style}
      testID={testID}
      {...props}
    >
      {pills.map(({ axis, value }) => (
        <FilterPill
          key={`${axis}:${value}`}
          axis={axis}
          value={value}
          onRemove={onRemove}
          testID={testID ? `pill-${axis}-${value}` : undefined}
        />
      ))}
    </ScrollView>
  );
}

function FilterPill({
  axis,
  value,
  onRemove,
  testID,
}: {
  axis: TagAxis;
  value: string;
  onRemove: (axis: TagAxis, value: string) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');

  const handleRemove = useCallback(() => {
    triggerHaptic(HapticEvent.SecondaryAction);
    onRemove(axis, value);
  }, [axis, onRemove, value]);

  return (
    <Pressable
      onPress={handleRemove}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel={t('list.removeFilterAccessibilityLabel', { value })}
      testID={testID}
    >
      <Text style={styles.pillLabel} numberOfLines={1}>
        {value}
      </Text>
      <XIcon color={theme.colors.text.accent.low} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x8,
    paddingHorizontal: theme.space.x16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x4,
    height: PILL_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: theme.radius.full,
    // the same fill/label pairing `ShorthandChip`'s own active state uses
    // (`@/shared/ui/hand-range-pane/hand-range-pane.tsx`) — the closest
    // existing "this is currently applied" chip precedent this project has,
    // reused rather than a fresh colour pick.
    backgroundColor: theme.colors.component.accent.selected,
  },
  pillLabel: {
    ...theme.typography.chipLabel,
    color: theme.colors.text.accent.low,
  },
}));
