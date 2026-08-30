import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { NativeJobDemo } from '@/features/presets/ui/native-job-demo';

/**
 * the Presets tab. the design specifies no content for it yet and no empty
 * state either — inventing one would ship copy nobody wrote — so this
 * screen renders its nav bar and, beneath it, `NativeJobDemo`: not itself
 * Presets content, but relocated here from Analyze by issue #64 to make
 * room for Analyze's own top-aligned board and players layout. it still
 * proves the `espada-engine` off-thread mechanism (issue #7) and occupies
 * the space real Presets content will eventually take. see
 * docs/specs/navigation.md and the plan's goals and non-goals.
 */
export default function PresetsScreen() {
  const { t } = useTranslation('navigation');

  return (
    <View style={styles.screen} testID="presets-screen">
      <NavBar title={t('presetsTab')} testID="presets-nav-bar" />
      <ScrollView contentContainerStyle={styles.content}>
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
    paddingBottom: theme.space.x32,
  },
}));
