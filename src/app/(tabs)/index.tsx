import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { NativeJobDemo } from '@/features/analyze/ui/native-job-demo';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

/**
 * The Analyze tab, landing tab of the shell. Phase 2 builds only its empty
 * state — the board, the Players list, and every non-empty state belong to
 * the equity engine this change does not build (docs/specs/equity-analysis.md).
 * The design's Analyze nav bar draws a share icon; this app's four nav bars
 * are title-only by design (docs/specs/navigation.md), so it is
 * deliberately not rendered here.
 *
 * `NativeJobDemo`, beneath the empty state, is unrelated to that design: it
 * proves the `juicio-native` off-thread mechanism (issue #7) and occupies
 * the space the equity engine will eventually take, until that engine
 * replaces it.
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
        <NativeJobDemo />
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
