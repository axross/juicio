import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

/**
 * the History tab. phase 2 builds only its empty state — grouped history
 * entries belong to a later change (docs/specs/calculation-history.md).
 * unlike Analyze's empty state, this one has no button.
 */
export default function HistoryScreen() {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('history');

  return (
    <View style={styles.screen} testID="history-screen">
      <NavBar title={tNav('historyTab')} testID="history-nav-bar" />
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          heading={t('emptyHeading')}
          description={t('emptyDescription')}
          testID="history-empty-state"
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
