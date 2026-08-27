import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

/**
 * The Presets tab. The design specifies no content for it yet and no empty
 * state either — inventing one would ship copy nobody wrote — so phase 2
 * renders only its nav bar (the tab bar comes from the shared shell). See
 * docs/specs/navigation.md and the plan's Goals and Non-goals.
 */
export default function PresetsScreen() {
  const { t } = useTranslation('navigation');

  return (
    <View style={styles.screen} testID="presets-screen">
      <NavBar title={t('presetsTab')} testID="presets-nav-bar" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
}));
