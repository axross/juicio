import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { SupportedLanguage } from '@/core/i18n';
import { NavBar } from '@/core/navigation/nav-bar';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';
import { SharkIllustration } from '@/shared/ui/empty-state/shark-illustration';

import { useHistoryEntries } from '../../adapter/use-history-entries';
import { groupHistoryEntries } from '../../usecase/group-history-entries';
import { DateGroup } from '../date-group/date-group';

/**
 * the History tab (issue #180, `docs/specs/calculation-history.md`):
 * `useHistoryEntries()`'s own saved entries, grouped by calculation date
 * and then by board (`../../usecase/group-history-entries.ts`), each
 * rendered as a `DateGroup`. Falls back to the app's existing, unchanged
 * `EmptyState` — its own visual output is a protected surface this issue
 * does not touch — whenever there is nothing saved, the last entry was
 * just deleted, or the underlying read failed outright (`useHistoryEntries`'s
 * own `'error'` state).
 *
 * **replaces `src/app/(tabs)/history.tsx`'s own previous body**, which
 * rendered `EmptyState` unconditionally; that route is now a thin
 * composition of this component, mirroring
 * `src/app/(tabs)/index.tsx`'s own split with `../../../evaluations/ui/
 * analyze-screen/analyze-screen.tsx` — see that file's own header comment,
 * and `docs/conventions/testing.md`'s own rule that no file with `.test.`
 * in its name may live under `src/app/`, for why this screen's own tests
 * live here rather than beside the route.
 *
 * **accepts and merges a caller `style`**, the same
 * `ComponentProps<typeof View>` shape `../../../evaluations/ui/
 * analyze-screen/analyze-screen.tsx` — this project's own precedent for the
 * identically-shaped case — declares, per
 * docs/conventions/component-styling.md's "The Caller's Style Lands on the
 * JSX Root" rule: `style` is pulled out of the rest spread and merged last
 * via array syntax onto this screen's own root, so a caller extending it
 * doesn't wipe `styles.screen`'s own `flex: 1`; every other rest prop
 * spreads last (default ordering), letting a caller override this screen's
 * own hardcoded `testID`.
 */
export function HistoryScreen({ style, ...props }: ComponentProps<typeof View>) {
  const { t: tNav } = useTranslation('navigation');
  const { t, i18n } = useTranslation('history');
  const { state, removeEntry } = useHistoryEntries();

  // memoized on `state` itself, not derived fresh every render — the
  // `'error'` branch would otherwise hand `useMemo` below a new empty-array
  // identity on every render and defeat its own memoization.
  const entries = useMemo(() => (state.status === 'loaded' ? state.entries : []), [state]);
  const groups = useMemo(() => groupHistoryEntries(entries), [entries]);
  // opening History with nothing saved, deleting the last remaining entry,
  // or a failed read (`state.status === 'error'`) all resolve to the same
  // fallback — issue #180's own acceptance criteria treat the three as one
  // case, not three branches to keep in sync separately.
  const isEmpty = state.status === 'error' || entries.length === 0;
  // this app's currently selected language (Settings' own `Language`
  // row), not the device's OS locale — `../date-group/date-heading.ts`'s
  // own doc comment on why an older date's formatting follows this rather
  // than `now`'s own locale. i18next types `.language` as a plain
  // `string`; `supportedLngs` (`src/core/i18n/index.ts`) is what actually
  // keeps it inside `SupportedLanguage` at runtime.
  const language = i18n.language as SupportedLanguage;
  // fresh every render, per `../date-group/date-group.tsx`'s own doc
  // comment on its `now` prop — this screen does not itself throttle how
  // often "Today"/"Yesterday" gets re-evaluated against the real clock.
  const now = new Date();

  return (
    // `style` is pulled out of the rest spread and merged last via array
    // syntax, this screen's own `styles.screen` first, the caller's last —
    // see this component's own doc comment above.
    <View style={[styles.screen, style]} testID="history-screen" {...props}>
      <NavBar title={tNav('historyTab')} testID="history-nav-bar" />
      <ScrollView contentContainerStyle={isEmpty ? styles.emptyContent : styles.content}>
        {isEmpty ? (
          <EmptyState
            illustration={<SharkIllustration />}
            heading={t('emptyHeading')}
            description={t('emptyDescription')}
            testID="history-empty-state"
          />
        ) : (
          <View style={styles.groups} testID="history-groups">
            {groups.map((group) => (
              <DateGroup
                key={group.dateKey}
                group={group}
                language={language}
                now={now}
                onDeleteEntry={removeEntry}
                testID={`date-group-${group.dateKey}`}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
  // unchanged from `src/app/(tabs)/history.tsx`'s own previous, always-empty
  // body — the empty state's own surrounding layout is exactly as it was.
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: theme.space.x32,
  },
  content: {
    flexGrow: 1,
    paddingVertical: theme.space.x16,
  },
  groups: {
    width: '100%',
    gap: theme.space.x32,
    paddingHorizontal: theme.space.x16,
  },
}));
