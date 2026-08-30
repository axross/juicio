import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { HoldingInputSheet } from '@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

import { addPlayer, removePlayer, usePlayers } from '../adapter/use-players';
import { Board } from './board/board';
import { PlayerList } from './player-list/player-list';

/**
 * the Analyze tab's screen (issue #87). this phase is what finally reads
 * the card/range input sheet's own submitted `Holding` — every earlier
 * phase's board, empty state, and `Players` heading
 * (docs/specs/equity-analysis.md) stay exactly as they were; a populated
 * board and every non-empty state still belong to the equity engine this
 * change does not build. the design's Analyze nav bar draws a share icon;
 * this app's four nav bars are title-only by design
 * (docs/specs/navigation.md), so it is deliberately not rendered here.
 *
 * the nav bar and the board share one background and one `Sheet` shadow:
 * `NavBar`'s own shadow is suppressed here, and the board draws it
 * instead, at its own bottom edge, so the two read as one unbroken top
 * band — the design's own presentation, option A of the exhibit at issue
 * #64. the board is rendered outside the `ScrollView` below, so it stays
 * pinned above the players list rather than scrolling away with it — and
 * stays untouched by this phase: it keeps its five empty slots regardless
 * of how many players the list below holds, per issue #87's own scope.
 *
 * `NativeJobDemo`, which used to render beneath this screen's empty state,
 * moved to the Presets tab with an earlier change: it needed the space the
 * design's top-aligned layout now claims, and was never part of this
 * screen's own design to begin with.
 *
 * **the sheet's submitted `Holding` now reaches `../adapter/
 * use-players.ts`'s `addPlayer`, rather than being dropped.** With zero
 * players the shipped empty state renders unchanged, its own `+ New
 * Player` button opening the sheet; with one or more, `PlayerList` renders
 * instead, its own trailing `New Player` row opening the identical sheet
 * — both call the same `setSheetVisible(true)`, so this screen owns
 * exactly one sheet-visibility flag regardless of which affordance opened
 * it. `onDismiss` still needs nothing from its own reason: a dismissal
 * without submitting adds no player, the same as before this phase.
 *
 * **lives under `features/analyze/ui/` rather than in the `(tabs)/index.tsx`
 * route module itself** (PR #93): `src/app/(tabs)/index.tsx` composes
 * this component and nothing else. Route modules load lazily through
 * `require.context`, which sweeps every file under `src/app/` — including
 * a colocated `.test.tsx` — into whatever bundle Metro produces, release
 * bundles included; a test file sitting there once dragged
 * `@testing-library/react-native` into a release build and broke it. This
 * screen, and its own colocated test, live here instead, where nothing
 * `require.context` ever walks.
 */
export function AnalyzeScreen() {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('analyze');

  const [sheetVisible, setSheetVisible] = useState(false);
  const players = usePlayers();

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
        {players.length === 0 ? (
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
        ) : (
          <PlayerList
            players={players}
            onDeletePlayer={removePlayer}
            onNewPlayerRequested={() => setSheetVisible(true)}
            testID="analyze-player-list"
          />
        )}
      </ScrollView>
      <HoldingInputSheet
        visible={sheetVisible}
        onSubmit={(holding) => {
          addPlayer(holding);
          setSheetVisible(false);
        }}
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
