import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

/**
 * The Feedback screen: only its own nav bar and a working back affordance.
 * Empty otherwise — it will be connected to Sentry's user-feedback form
 * later (docs/specs/settings.md).
 */
export default function FeedbackScreen() {
  const { t } = useTranslation('settings');
  const { t: tNav } = useTranslation('navigation');

  return (
    <View style={styles.screen} testID="feedback-screen">
      <NavBar
        title={t('about.feedback')}
        onBack={() => router.back()}
        backAccessibilityLabel={tNav('back')}
        testID="feedback-nav-bar"
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
}));
