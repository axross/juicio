import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';
import { SharkIllustration } from '@/shared/ui/empty-state/shark-illustration';

import {
  EMPTY_APPLIED_TAG_FILTERS,
  filterPresetsByTags,
  hasAnyAppliedTagFilter,
  removeAppliedTagValue,
  toggleAppliedTagValue,
} from '../../adapter/filter-presets';
import { usePresetList } from '../../adapter/use-preset-list';
import type { Preset, TagAxis } from '../../model/preset';
import { NewPresetFab } from '../new-preset-fab/new-preset-fab';
import { PresetFilterChipRow } from '../preset-filter-chip-row/preset-filter-chip-row';
import { PresetFilterPillRow } from '../preset-filter-pill-row/preset-filter-pill-row';
import { PresetRow } from '../preset-row/preset-row';
import { PresetTagPickerSheet } from '../preset-tag-picker-sheet/preset-tag-picker-sheet';
import { AaCornerIllustration } from './aa-corner-illustration';

/**
 * the Preset list screen (docs/specs/hand-ranges.md's "The
 * Preset List"): every saved preset, in `usePresetList()`'s own
 * `listPresets()` order, filterable by any combination of the four fixed
 * tag axes, with a persistent "new preset" action and each row opening the
 * Preset editor route (`../preset-editor-screen/preset-editor-screen.tsx`,
 * reached through `/preset-editor`) in edit mode.
 *
 * **five states, one `switch` over `usePresetList()`'s own status** — see
 * that hook's own doc comment for `loading`/`loaded`/`error`; `loaded`
 * itself further splits into the three the design settles:
 *
 * - `loading`: a centered spinner beneath the title bar; the filter row,
 *   pill row, list, and FAB are all hidden until presets resolve (Option A,
 *   minimal).
 * - `error`: reuses `EmptyState` with the shark and error-specific copy, no
 *   retry action (Option A) — nor the filter row, pill row, or FAB: there is
 *   nothing to filter or add to while the underlying load has failed.
 * - `loaded`, no preset ever saved (`presets.length === 0`, before any
 *   filter is applied): `EmptyState` with "no presets yet" copy, `./
 *   aa-corner-illustration.tsx` rather than the shark the other two
 *   non-list states below keep, and the FAB — but **no filter chip row**,
 *   since filtering an empty list has nothing to narrow. This distinction
 *   (raw count, not filtered count) is this implementer's own reading: the
 *   design's own "Presets/Empty" frame
 *   (`docs/operations/design-source.md`'s `600:31737`) is actually a
 *   populated six-item list despite its name, so no genuine empty-state
 *   frame exists to read this from directly.
 * - `loaded`, at least one preset saved but the applied filters match none
 *   of them: the filter chip row (so the user can adjust what's applied),
 *   the pill row, `EmptyState` with the shark and "no matching presets"
 *   copy (visibly distinct from the no-presets-at-all copy above), and the
 *   FAB.
 * - `loaded`, populated: the filter chip row, the pill row (only once
 *   `hasAnyAppliedTagFilter`), the list, and the FAB.
 *
 * **filtering is entirely local state** — `applied` (`AppliedTagFilters`)
 * and `openAxis` (which axis's own picker sheet, if any, is currently open)
 * both live here, in this screen's own `useState`; neither this screen nor
 * `usePresetList()` persists a filter selection across a remount.
 *
 * **one `PresetTagPickerSheet` instance, not four** — see that component's
 * own doc comment for why this still satisfies "each of the four filter
 * chips opens its OWN independent picker."
 *
 * **holds no store reference of its own beyond `usePresetList()`** —
 * pressing the FAB or a row navigates straight through `expo-router`'s own
 * `router.push`, exactly the way `@/features/settings/ui/
 * settings-screen.tsx` already navigates to its own child routes; this
 * screen holds no navigation state of its own to reconcile.
 */
export function PresetListScreen({ style, ...props }: ComponentProps<typeof View>) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');
  const insets = useSafeAreaInsets();

  const status = usePresetList();
  const [applied, setApplied] = useState(EMPTY_APPLIED_TAG_FILTERS);
  const [openAxis, setOpenAxis] = useState<TagAxis | null>(null);

  // this screen's own half of `NavBar`'s scroll-linked translucency+blur
  // contract (issue #260, see that component's own doc comment) — written
  // on the UI thread, the same `useAnimatedScrollHandler` pattern
  // `../../../evaluations/ui/analyze-screen/analyze-screen.tsx` and
  // `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx` both already use.
  // this screen's own list is virtualized (`Animated.FlatList` below), not
  // a `ScrollView`, but `useAnimatedScrollHandler`'s own `onScroll` contract
  // is identical either way.
  const scrollOffset = useSharedValue(0);
  const handleScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  // matches `@/features/evaluations/ui/analyze-screen/analyze-screen.tsx`'s
  // own `fabBottom` exactly, including its own iOS-only inset — see that
  // screen's own comment for why `insets.bottom` is folded in here, as a
  // plain merged style, rather than inside a `StyleSheet.create` factory.
  const fabBottom = theme.space.x24 + (Platform.OS === 'ios' ? insets.bottom : 0);

  const handleOpenAxis = useCallback((axis: TagAxis) => {
    setOpenAxis(axis);
  }, []);

  const handleToggleValue = useCallback(
    (value: string) => {
      if (openAxis === null) {
        return;
      }
      setApplied((current) => toggleAppliedTagValue(current, openAxis, value));
    },
    [openAxis],
  );

  const handleRemoveFilter = useCallback((axis: TagAxis, value: string) => {
    setApplied((current) => removeAppliedTagValue(current, axis, value));
  }, []);

  const handleNewPreset = useCallback(() => {
    router.push({ pathname: '/preset-editor', params: { mode: 'create' } });
  }, []);

  const handleOpenPreset = useCallback((id: number) => {
    router.push({ pathname: '/preset-editor', params: { mode: 'edit', id: String(id) } });
  }, []);

  const renderBody = () => {
    if (status.status === 'loading') {
      return (
        <View style={styles.centered} testID="presets-loading">
          <ActivityIndicator size="large" color={theme.colors.solid.accent.rest} />
        </View>
      );
    }

    if (status.status === 'error') {
      return (
        <EmptyState
          illustration={<SharkIllustration />}
          heading={t('list.error.heading')}
          description={t('list.error.description')}
          style={styles.emptyState}
          testID="presets-error-state"
        />
      );
    }

    const { presets } = status;

    if (presets.length === 0) {
      return (
        <EmptyState
          illustration={<AaCornerIllustration />}
          heading={t('list.empty.heading')}
          description={t('list.empty.description')}
          style={styles.emptyState}
          testID="presets-empty-state"
        />
      );
    }

    const filtered = filterPresetsByTags(presets, applied);

    return (
      <>
        <PresetFilterChipRow
          applied={applied}
          onOpenAxis={handleOpenAxis}
          style={styles.filterChipRow}
          testID="presets-filter-chips"
        />
        {hasAnyAppliedTagFilter(applied) ? (
          <PresetFilterPillRow
            applied={applied}
            onRemove={handleRemoveFilter}
            style={styles.filterPillRow}
            testID="presets-filter-pills"
          />
        ) : null}
        {filtered.length === 0 ? (
          <EmptyState
            illustration={<SharkIllustration />}
            heading={t('list.filteredEmpty.heading')}
            description={t('list.filteredEmpty.description')}
            style={styles.emptyState}
            testID="presets-filtered-empty-state"
          />
        ) : (
          <Animated.FlatList<Preset>
            data={filtered}
            keyExtractor={(preset) => String(preset.id)}
            renderItem={({ item }) => (
              <MemoizedPresetRow preset={item} onPress={handleOpenPreset} />
            )}
            contentContainerStyle={styles.listContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            testID="presets-list"
          />
        )}
      </>
    );
  };

  return (
    // matches `AnalyzeScreen`'s identical merge exactly, `testID`'s own
    // default included.
    <View style={[styles.screen, style]} testID="presets-screen" {...props}>
      <NavBar title={t('list.title')} scrollOffset={scrollOffset} testID="presets-nav-bar" />
      {renderBody()}
      {status.status === 'loaded' ? (
        <NewPresetFab
          onPress={handleNewPreset}
          style={[styles.fab, { bottom: fabBottom }]}
          testID="presets-new-preset-fab"
        />
      ) : null}
      <PresetTagPickerSheet
        visible={openAxis !== null}
        axis={openAxis}
        appliedValues={openAxis === null ? [] : applied[openAxis]}
        onToggleValue={handleToggleValue}
        onRequestClose={() => setOpenAxis(null)}
        testID="presets-tag-picker-sheet"
      />
    </View>
  );
}

/**
 * `PresetRow`'s own re-render protection, applied here rather than inside
 * `../preset-row/preset-row.tsx` itself, per this project's own decision
 * (docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md,
 * docs/conventions/component-memoization.md) — this is the one place
 * `PresetRow` is rendered, inside this screen's virtualized `FlatList`.
 *
 * **plain `memo()`, no custom comparator** — unlike `../../evaluations/ui/
 * player-list/player-list.tsx`'s `MemoizedPlayerRow`, which excludes its own
 * `rowCount` prop for a reason specific to that list. `PresetRow` takes only
 * `preset` and `onPress` here: `onPress` is `handleOpenPreset` above, a
 * `useCallback` with an empty dependency list, so it is the same reference
 * across every render of this screen; `preset` is one element of `filtered`
 * above, and `filterPresetsByTags` (`../../adapter/filter-presets.ts`) builds
 * `filtered` with `.filter()`, which never clones the items it keeps, so a
 * given preset's own object identity is stable across a render unless that
 * preset itself actually changed. `React.memo`'s own default shallow
 * comparison already has nothing to gain from a custom comparator here.
 */
const MemoizedPresetRow = memo(PresetRow);

const styles = StyleSheet.create((theme, rt) => ({
  // establishes the coordinate space the FAB below is positioned within —
  // not this screen placing itself; see docs/conventions/
  // component-styling.md's "A Positioning Context for a Component's Own
  // Children Is Not Placement", mirroring `AnalyzeScreen`'s identical
  // `screen` style.
  screen: {
    flex: 1,
    position: 'relative',
    backgroundColor: theme.colors.background.neutral.app,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.space.x16,
  },
  filterChipRow: {
    marginTop: theme.space.x24,
  },
  filterPillRow: {
    marginTop: theme.space.x24,
  },
  listContent: {
    paddingTop: theme.space.x24,
  },
  // this screen's own placement of `NewPresetFab` — the FAB's own root sets
  // none of this — mirroring `AnalyzeScreen`'s identical `fab` style
  // exactly, `right` included (this project's own gutter composed with the
  // device's horizontal safe-area inset).
  fab: {
    position: 'absolute',
    right: Math.max(theme.space.x16, rt.insets.right),
  },
}));
