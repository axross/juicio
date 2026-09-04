import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

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

/**
 * the Preset list screen (issue #176, docs/specs/hand-ranges.md's "The
 * Preset List"): every saved preset, in `usePresetList()`'s own
 * `listPresets()` order, filterable by any combination of the four fixed
 * tag axes, with a persistent "new preset" action and each row opening the
 * Preset editor route (`../preset-editor-screen/preset-editor-screen.tsx`,
 * reached through `/preset-editor`) in edit mode. Replaces the Presets
 * tab's former native-job-engine demo placeholder outright.
 *
 * **five states, one `switch` over `usePresetList()`'s own status** — see
 * that hook's own doc comment for `loading`/`loaded`/`error`; `loaded`
 * itself further splits into the three the design settles (issue #176's
 * own Option A):
 *
 * - `loading`: a centered spinner beneath the title bar; the filter row,
 *   pill row, list, and FAB are all hidden until presets resolve (Option A,
 *   minimal).
 * - `error`: reuses `EmptyState` with error-specific copy, no retry action
 *   (Option A) — nor the filter row, pill row, or FAB: there is nothing to
 *   filter or add to while the underlying load has failed.
 * - `loaded`, no preset ever saved (`presets.length === 0`, before any
 *   filter is applied): `EmptyState` with "no presets yet" copy and the FAB
 *   — but **no filter chip row**, since filtering an empty list has nothing
 *   to narrow. This distinction (raw count, not filtered count) is this
 *   implementer's own reading: the design's own "Presets/Empty" frame
 *   (`docs/operations/design-source.md`'s `600:31737`) is actually a
 *   populated six-item list despite its name, so no genuine empty-state
 *   frame exists to read this from directly.
 * - `loaded`, at least one preset saved but the applied filters match none
 *   of them: the filter chip row (so the user can adjust what's applied),
 *   the pill row, `EmptyState` with "no matching presets" copy (visibly
 *   distinct from the no-presets-at-all copy above), and the FAB.
 * - `loaded`, populated: the filter chip row, the pill row (only once
 *   `hasAnyAppliedTagFilter`), the list, and the FAB.
 *
 * **filtering is entirely local state** — `applied` (`AppliedTagFilters`)
 * and `openAxis` (which axis's own picker sheet, if any, is currently open)
 * both live here, in this screen's own `useState`; neither this screen nor
 * `usePresetList()` persists a filter selection across a remount, and
 * nothing in issue #176's own plan asks for that.
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
export function PresetListScreen() {
  const { theme } = useUnistyles();
  const { t } = useTranslation('presets');
  const insets = useSafeAreaInsets();

  const status = usePresetList();
  const [applied, setApplied] = useState(EMPTY_APPLIED_TAG_FILTERS);
  const [openAxis, setOpenAxis] = useState<TagAxis | null>(null);

  // matches `@/features/evaluations/ui/analyze-screen/analyze-screen.tsx`'s
  // own `fabBottom` exactly, including its own iOS-only inset (issue #168's
  // regression, fixed after on-device testing) — see that screen's own
  // comment for why `insets.bottom` is folded in here, as a plain merged
  // style, rather than inside a `StyleSheet.create` factory.
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
            heading={t('list.filteredEmpty.heading')}
            description={t('list.filteredEmpty.description')}
            style={styles.emptyState}
            testID="presets-filtered-empty-state"
          />
        ) : (
          <FlatList<Preset>
            data={filtered}
            keyExtractor={(preset) => String(preset.id)}
            renderItem={({ item }) => <PresetRow preset={item} onPress={handleOpenPreset} />}
            contentContainerStyle={styles.listContent}
            testID="presets-list"
          />
        )}
      </>
    );
  };

  return (
    <View style={styles.screen} testID="presets-screen">
      <NavBar title={t('list.title')} testID="presets-nav-bar" />
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
