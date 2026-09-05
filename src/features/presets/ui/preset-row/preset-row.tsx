import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { ChevronRightIcon } from '@/core/icons/chevron-right-icon';
import { RankPairGrid } from '@/shared/ui/rank-pair-grid/rank-pair-grid';

import { TAG_AXIS_ORDER } from '../../adapter/filter-presets';
import type { Preset } from '../../model/preset';

/**
 * this row's own design-fixed height, measured from the design's own row
 * instance (`docs/operations/design-source.md`'s `145:22333`, the "Players"
 * instance's own 112-tall frame) — 112, not the players list row's 96.
 * stays with this component per docs/conventions/component-styling.md's "A
 * Design-Fixed Intrinsic Dimension Stays With the Component" rule.
 */
const ROW_HEIGHT = 112;
/** the rank-pair-grid preview's own measured size, from the same row
 * instance (`Frame 114`, 72×72) — larger than the players list row's 64. */
const PREVIEW_SIZE = 72;
/** the measured gap between the preview and the name/subtitle block
 * (`Frame 40`'s own children, `104 - 80 = 24`) — an existing `theme.space`
 * step, not a value needing its own named constant. */
const PREVIEW_TO_META_GAP = 24;

/**
 * one row of the Preset list (docs/specs/hand-ranges.md's "The
 * Preset List"): the preset's own 13×13 rank-pair-grid preview, its name,
 * a tag summary, and a trailing chevron — pressed to open the Preset editor
 * route in edit mode. **holds no store reference and no navigation
 * knowledge of its own** — it reports a press through `onPress`, named for
 * the outcome per docs/conventions/component-contracts.md, and
 * `../preset-list-screen/preset-list-screen.tsx` is what actually navigates.
 *
 * **carries no swipe-to-delete gesture**, unlike
 * `@/features/evaluations/ui/player-row/player-row.tsx` (which the design's
 * own row instance draws one for, revealed by a swipe): this row is a
 * plain `Pressable`, not a gesture-driven one — deleting a preset has
 * nothing to wire it to yet.
 *
 * the tag summary joins every axis with at least one selected value, in the
 * fixed `Position, # of Players, Depth, Action` order
 * (`../../adapter/filter-presets.ts`'s `TAG_AXIS_ORDER`), skipping an axis
 * with nothing selected for this preset entirely — this project's own
 * settled subtitle format (`docs/conventions/design-system.md`'s App-Wide
 * Copy Conventions), the same shape `PlayerRowContent`'s own subtitle and a
 * future History row share.
 */
export function PresetRow({
  preset,
  onPress,
  testID,
  style,
  ...props
}: Omit<ComponentProps<typeof Pressable>, 'onPress'> & {
  preset: Preset;
  /** fires with this preset's own `id` when this row is pressed. named for
   * the outcome, not the mechanism, per docs/conventions/
   * component-contracts.md; this row knows nothing about the Preset editor
   * route that opens in response. Omits `Pressable`'s own `onPress` above
   * (a `GestureResponderEvent` callback) rather than colliding with it, the
   * same `Omit<ComponentProps<typeof X>, ...>` pattern `RadioRow`/
   * `FeedbackRow` already use. */
  onPress: (id: number) => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');

  const handlePress = useCallback(() => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress(preset.id);
  }, [onPress, preset.id]);

  const tagSummary = TAG_AXIS_ORDER.flatMap((axis) => preset.tags[axis]).join(', ');
  const accessibilityLabel = t('list.row.accessibilityLabel', {
    name: preset.name,
    tags: tagSummary,
  });

  return (
    // `style` is merged last so a caller extending it doesn't wipe this
    // row's own fixed height — mirroring `NewPresetFab`'s and
    // `NewPlayerFab`'s identical `Pressable` merge.
    <Pressable
      onPress={handlePress}
      style={(state) => [
        styles.root,
        state.pressed && styles.rootPressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      {...props}
    >
      <View style={styles.preview}>
        <RankPairGrid rankPairs={preset.handRange} size={PREVIEW_SIZE} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1} testID={testID ? 'name' : undefined}>
          {preset.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1} testID={testID ? 'subtitle' : undefined}>
          {tagSummary}
        </Text>
      </View>
      <View style={styles.chevronColumn}>
        <ChevronRightIcon color={theme.colors.text.neutral.low} size={24} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: PREVIEW_TO_META_GAP,
    padding: theme.space.x16,
    backgroundColor: theme.colors.background.neutral.app,
  },
  rootPressed: {
    backgroundColor: theme.colors.component.neutral.rest,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: theme.space.x8,
  },
  name: {
    ...theme.typography.rowLabel,
    color: theme.colors.text.neutral.high,
  },
  subtitle: {
    ...theme.typography.rowSubtitle,
    color: theme.colors.text.neutral.low,
  },
  chevronColumn: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
