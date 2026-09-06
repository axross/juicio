import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { FeedbackForm } from '@/features/feedback/ui/feedback-form';

/**
 * the Feedback screen: its own nav bar and a working back affordance, above
 * `FeedbackForm` — the form that submits to Sentry's User Feedback API, per
 * docs/specs/settings.md.
 *
 * **`scrollOffset` is this screen's own half of `NavBar`'s scroll-linked
 * translucency+blur contract** (issue #260, see that component's own doc
 * comment) — `FeedbackForm`'s own internal `ScrollView` is what actually
 * scrolls, so it's this screen's job to create the one shared value both it
 * and `NavBar` read, and hand it down; `FeedbackForm` writes to it, on the
 * UI thread, through the same `useAnimatedScrollHandler` pattern
 * `@/features/evaluations/ui/analyze-screen/analyze-screen.tsx` and
 * `@/shared/ui/bottom-sheet/bottom-sheet.tsx` both already use.
 */
export default function FeedbackScreen() {
  const { t } = useTranslation('settings');
  const { t: tNav } = useTranslation('navigation');
  const scrollOffset = useSharedValue(0);

  return (
    <View style={styles.screen} testID="feedback-screen">
      <NavBar
        title={t('about.feedback')}
        onBack={() => router.back()}
        backAccessibilityLabel={tNav('back')}
        scrollOffset={scrollOffset}
        testID="feedback-nav-bar"
      />
      <FeedbackForm scrollOffset={scrollOffset} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
}));
