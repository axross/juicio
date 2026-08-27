import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

/**
 * The Analyze tab, landing tab of the shell. Phase 2 builds only its empty
 * state — the board, the Players list, and every non-empty state belong to
 * the equity engine this change does not build (docs/specs/equity-analysis.md).
 * The design's Analyze nav bar draws a share icon; this app's four nav bars
 * are title-only by design (docs/specs/navigation.md), so it is
 * deliberately not rendered here.
 */
export default function AnalyzeScreen() {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('analyze');

  return (
    <View style={styles.screen} testID="analyze-screen">
      <NavBar title={tNav('analyzeTab')} testID="analyze-nav-bar" />
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          heading={t('emptyHeading')}
          description={t('emptyDescription')}
          action={{
            label: t('emptyButton'),
            // Opens the card/range input sheet once the equity engine
            // exists (docs/specs/hand-ranges.md); nothing to navigate to
            // yet, so this deliberately does nothing rather than crash.
            onPress: () => {},
            testID: 'analyze-empty-new-player-button',
          }}
          testID="analyze-empty-state"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: theme.space.x32,
  },
}));
