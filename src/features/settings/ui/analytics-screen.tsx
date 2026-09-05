import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

import { useAnalyticsPreference } from '../adapter/use-analytics-preference';
import { changeAnalyticsPreference } from '../usecase/change-analytics-preference';
import { fireAndForget } from './fire-and-forget';
import { rowPosition } from './row-position';
import { SettingsSection } from './settings-section';
import { SwitchRow } from './switch-row';

/**
 * the `Analytics` child screen: its own nav bar, one card holding the
 * tracking switch at the same 16dp inset the Settings screen's own cards
 * use, and — 16dp below the card, in the `caption` role in
 * `text.neutral.low` — a description of what the switch controls. The same
 * shape `Theme`'s own child screen already takes (`theme-screen.tsx`),
 * reused here rather than an inline switch on the Settings screen itself —
 * see docs/specs/settings.md#analytics for why.
 */
export function AnalyticsScreen({
  onBack,
  style,
  ...props
}: ComponentProps<typeof View> & {
  onBack: () => void;
}) {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('settings');
  const enabled = useAnalyticsPreference();

  return (
    // per docs/conventions/component-styling.md, style merges last over
    // this screen's own `flex: 1`; rest props (this screen's own hardcoded
    // `testID` default included) spread last too, the default ordering per
    // docs/conventions/component-contracts.md.
    <View style={[styles.screen, style]} testID="settings-analytics-screen" {...props}>
      <NavBar
        title={t('about.analytics')}
        onBack={onBack}
        backAccessibilityLabel={tNav('back')}
        testID="settings-analytics-nav-bar"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection testID="settings-analytics" description={t('analytics.description')}>
          <SwitchRow
            label={t('analytics.switchLabel')}
            value={enabled}
            onValueChange={(next) => fireAndForget(changeAnalyticsPreference(next))}
            position={rowPosition(0, 1)}
            testID="settings-analytics-switch"
          />
        </SettingsSection>
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
    paddingVertical: theme.space.x32,
  },
}));
