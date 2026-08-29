import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { SupportedLanguage } from '@/core/i18n';
import { reportError } from '@/core/instrumentation/report-error';
import { NavBar } from '@/core/navigation/nav-bar';

import { resolveThemePreferenceFromRuntime, type ThemePreference } from '../model/theme';
import { changeLanguage } from '../usecase/change-language';
import { changeTheme } from '../usecase/change-theme';
import { FeedbackRow } from './feedback-row';
import { JpFlagIcon, UsFlagIcon } from './flag-icons';
import { RadioRow } from './radio-row';
import { rowPosition } from './row-position';
import { SettingsSection } from './settings-section';
import { TechnicalInfo } from './technical-info';

const LANGUAGE_LABEL_KEYS = {
  en: 'language.optionEnglish',
  ja: 'language.optionJapanese',
} as const;

const LANGUAGE_OPTIONS: readonly { value: SupportedLanguage; testID: string }[] = [
  { value: 'en', testID: 'settings-language-en' },
  { value: 'ja', testID: 'settings-language-ja' },
];

const THEME_LABEL_KEYS = {
  system: 'theme.optionSystem',
  light: 'theme.optionLight',
  dark: 'theme.optionDark',
} as const;

const THEME_OPTIONS: readonly { value: ThemePreference; testID: string }[] = [
  { value: 'system', testID: 'settings-theme-system' },
  { value: 'light', testID: 'settings-theme-light' },
  { value: 'dark', testID: 'settings-theme-dark' },
];

/** fire-and-forget: both use cases persist on their own, and there is
 * nothing in the UI that needs to await them — the app re-renders the
 * instant `changeLanguage`/`changeTheme` apply, before the write settles.
 * this is the root call site for that persist step, so a rejection (a
 * failed AsyncStorage write, for instance) is reported here — otherwise the
 * user's language or theme choice would silently fail to survive a
 * restart, with nothing surfacing that in production. */
function fireAndForget(promise: Promise<void>): void {
  promise.catch((error: unknown) => {
    reportError(error, { tags: { module: 'settings' } });
  });
}

/**
 * the Settings screen: `Language`, `Theme`, `About`, then the unlabelled
 * Technical Information block, in that order. `Theme` reuses `RadioRow` —
 * the exact same row component `Language` uses — per the maintainer's
 * chosen option A.
 */
export function SettingsScreen() {
  const { t: tNav } = useTranslation('navigation');
  const { t, i18n } = useTranslation('settings');
  const { rt } = useUnistyles();

  const currentLanguage = i18n.language as SupportedLanguage;
  const currentThemePreference = resolveThemePreferenceFromRuntime(
    rt.hasAdaptiveThemes,
    rt.themeName,
  );

  return (
    <View style={styles.screen} testID="settings-screen">
      <NavBar title={tNav('settingsTab')} testID="settings-nav-bar" />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection heading={t('language.sectionTitle')} testID="settings-language-section">
          {LANGUAGE_OPTIONS.map((option, index) => (
            <RadioRow
              key={option.value}
              label={t(LANGUAGE_LABEL_KEYS[option.value])}
              selected={currentLanguage === option.value}
              onPress={() => fireAndForget(changeLanguage(option.value))}
              leading={option.value === 'en' ? <UsFlagIcon /> : <JpFlagIcon />}
              position={rowPosition(index, LANGUAGE_OPTIONS.length)}
              testID={option.testID}
            />
          ))}
        </SettingsSection>

        <SettingsSection heading={t('theme.sectionTitle')} testID="settings-theme-section">
          {THEME_OPTIONS.map((option, index) => (
            <RadioRow
              key={option.value}
              label={t(THEME_LABEL_KEYS[option.value])}
              selected={currentThemePreference === option.value}
              onPress={() => fireAndForget(changeTheme(option.value))}
              position={rowPosition(index, THEME_OPTIONS.length)}
              testID={option.testID}
            />
          ))}
        </SettingsSection>

        <SettingsSection heading={t('about.sectionTitle')} testID="settings-about-section">
          <FeedbackRow
            label={t('about.feedback')}
            onPress={() => router.push('/feedback')}
            position={rowPosition(0, 1)}
            testID="settings-about-feedback"
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
