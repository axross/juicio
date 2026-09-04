import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { SupportedLanguage } from '@/core/i18n';
import { NavBar } from '@/core/navigation/nav-bar';

import { useAnalyticsPreference } from '../adapter/use-analytics-preference';
import { useThemePreference } from '../adapter/use-theme-preference';
import { DisclosureRow } from './disclosure-row';
import { FeedbackRow } from './feedback-row';
import { LANGUAGE_LABEL_KEYS } from './language-options';
import { rowPosition } from './row-position';
import { SettingsSection } from './settings-section';
import { TechnicalInfo } from './technical-info';
import { THEME_LABEL_KEYS } from './theme-options';

/**
 * the Settings screen (issue #76, option A): `Language`, `Theme`, `About`,
 * then the unlabelled Technical Information block, in that order. `Language`
 * and `Theme` each collapse to one `DisclosureRow` — the current value on
 * the right, then a chevron — that opens that setting's own child screen;
 * `About`'s `Feedback` row is unchanged except for gaining the same
 * chevron, and gains a second row, `Analytics` (issue #211), collapsed the
 * same way `Language` and `Theme` are — its own current On/Off value, then
 * a chevron, opening `AnalyticsScreen`. The design file specifies none of
 * this: no child screen, no chevron on any row, and every row at 44dp
 * rather than 52 — see docs/specs/settings.md.
 */
export function SettingsScreen({ style, ...props }: ComponentProps<typeof View>) {
  const { t: tNav } = useTranslation('navigation');
  const { t, i18n } = useTranslation('settings');
  const themePreference = useThemePreference();
  const analyticsEnabled = useAnalyticsPreference();

  const currentLanguage = i18n.language as SupportedLanguage;
  const languageLabel = t('language.sectionTitle');
  const languageValue = t(LANGUAGE_LABEL_KEYS[currentLanguage]);
  const themeLabel = t('theme.sectionTitle');
  const themeValue = t(THEME_LABEL_KEYS[themePreference]);
  const analyticsLabel = t('about.analytics');
  const analyticsValue = analyticsEnabled ? t('analytics.onValue') : t('analytics.offValue');

  return (
    // `style` is pulled out of the rest spread and merged last via array
    // syntax, this screen's own `styles.screen` first, the caller's last,
    // so a caller extending it doesn't wipe the screen's `flex: 1`; every
    // other rest prop, this screen's own hardcoded `testID` default
    // included, spreads last (default ordering), letting a caller override
    // it.
    <View style={[styles.screen, style]} testID="settings-screen" {...props}>
      <NavBar title={tNav('settingsTab')} testID="settings-nav-bar" />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection heading={languageLabel} testID="settings-language-section">
          <DisclosureRow
            label={languageLabel}
            value={languageValue}
            onPress={() => router.push('/settings-language')}
            accessibilityLabel={`${languageLabel}, ${languageValue}`}
            position={rowPosition(0, 1)}
            testID="settings-language-row"
          />
        </SettingsSection>

        <SettingsSection heading={themeLabel} testID="settings-theme-section">
          <DisclosureRow
            label={themeLabel}
            value={themeValue}
            onPress={() => router.push('/settings-theme')}
            accessibilityLabel={`${themeLabel}, ${themeValue}`}
            position={rowPosition(0, 1)}
            testID="settings-theme-row"
          />
        </SettingsSection>

        <SettingsSection heading={t('about.sectionTitle')} testID="settings-about-section">
          <FeedbackRow
            label={t('about.feedback')}
            onPress={() => router.push('/feedback')}
            position={rowPosition(0, 2)}
            testID="settings-about-feedback"
          />
          <DisclosureRow
            label={analyticsLabel}
            value={analyticsValue}
            onPress={() => router.push('/settings-analytics')}
            accessibilityLabel={`${analyticsLabel}, ${analyticsValue}`}
            position={rowPosition(1, 2)}
            testID="settings-about-analytics"
          />
        </SettingsSection>

        <TechnicalInfo
          labels={{
            build: t('technicalInfo.build'),
            appVersion: t('technicalInfo.appVersion'),
            buildNumber: t('technicalInfo.buildNumber'),
            sha: t('technicalInfo.sha'),
          }}
          testID="settings-technical-info"
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
    paddingVertical: theme.space.x32,
    gap: theme.space.x32,
  },
}));
