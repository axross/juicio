import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { Board } from '@/features/evaluations/ui/board/board';
import { HoldingInputSheet } from '@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

/**
 * the Analyze tab, landing tab of the shell. this phase adds the board's
 * own empty state and the `Players` heading above the empty state that
 * already shipped (docs/specs/equity-analysis.md) — a populated board,
 * the players list itself, and every non-empty state still belong to the
 * equity engine this change does not build. the design's Analyze nav bar
 * draws a share icon; this app's four nav bars are title-only by design
 * (docs/specs/navigation.md), so it is deliberately not rendered here.
 *
 * the nav bar and the board share one background and one `Sheet` shadow:
 * `NavBar`'s own shadow is suppressed here, and the board draws it
 * instead, at its own bottom edge, so the two read as one unbroken top
 * band — the design's own presentation, option A of the exhibit at issue
 * #64. the board is rendered outside the `ScrollView` below, so it stays
 * pinned above the players list rather than scrolling away with it.
 *
 * `NativeJobDemo`, which used to render beneath this screen's empty state,
 * moved to the Presets tab with this same change: it needed the space the
 * design's top-aligned layout now claims, and was never part of this
 * screen's own design to begin with.
 *
 * `+ New Player` now opens the card/range input sheet
 * (`@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet`), tracked by one local
 * `sheetVisible` flag — there is still no players list and no store to
 * put a submitted `Holding` into (docs/specs/equity-analysis.md's players
 * list, and the Zustand store that would back one, are both later work;
 * this change deliberately does not invent either), so `onSubmit` drops
 * its own result on the floor, same as `onDismiss` needs nothing from
 * its own reason today. both close the sheet, which is all this screen
 * can do with either outcome yet.
 */
export default function AnalyzeScreen() {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('analyze');

  const [sheetVisible, setSheetVisible] = useState(false);

  return (
    <View style={styles.screen} testID="analyze-screen">
      <NavBar title={tNav('analyzeTab')} suppressShadow testID="analyze-nav-bar" />
      <Board testID="analyze-board" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          style={styles.playersHeading}
          accessibilityRole="header"
          testID="analyze-players-heading"
        >
          {t('playersHeading')}
        </Text>
        <EmptyState
          heading={t('emptyHeading')}
          description={t('emptyDescription')}
          action={{
            label: t('emptyButton'),
            onPress: () => setSheetVisible(true),
            testID: 'analyze-empty-new-player-button',
          }}
          testID="analyze-empty-state"
        />
      </ScrollView>
      <HoldingInputSheet
        visible={sheetVisible}
        // the submitted holding has nowhere to go yet — see this
        // component's own doc comment above.
        onSubmit={() => setSheetVisible(false)}
        onDismiss={() => setSheetVisible(false)}
        testID="analyze-holding-input-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
  content: {
    paddingTop: theme.space.x32,
    paddingBottom: theme.space.x32,
  },
  playersHeading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
    paddingHorizontal: theme.space.x16,
    marginBottom: theme.space.x16,
  },
}));
