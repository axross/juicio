import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { SupportedLanguage } from '@/core/i18n';
import { NavBar } from '@/core/navigation/nav-bar';

import { changeLanguage } from '../usecase/change-language';
import { fireAndForget } from './fire-and-forget';
import { JpFlagIcon, UsFlagIcon } from './flag-icons';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_OPTIONS } from './language-options';
import { RadioRow } from './radio-row';
import { rowPosition } from './row-position';
import { SettingsSection } from './settings-section';

/**
 * the `Language` child screen (issue #76, option A): its own nav bar — the
 * title tracks `i18n.language` live, since selecting a row changes it
 * immediately, this screen included — and one card of the two language
 * `RadioRow`s at the same 16dp inset the Settings screen's own cards use.
 * No description below the card: `English (United States)` and `日本語`
 * need no gloss.
 */
export function LanguageScreen({
  onBack,
  style,
  ...props
}: ComponentProps<typeof View> & {
  onBack: () => void;
}) {
  const { t: tNav } = useTranslation('navigation');
  const { t, i18n } = useTranslation('settings');

  const currentLanguage = i18n.language as SupportedLanguage;

  return (
    // `style` is pulled out of the rest spread and merged last via array
    // syntax, this screen's own `styles.screen` first, the caller's last,
    // so a caller extending it doesn't wipe the screen's `flex: 1`; every
    // other rest prop, this screen's own hardcoded `testID` default
    // included, spreads last (default ordering), letting a caller override
    // it.
    <View style={[styles.screen, style]} testID="settings-language-screen" {...props}>
      <NavBar
        title={t('language.sectionTitle')}
        onBack={onBack}
        backAccessibilityLabel={tNav('back')}
        testID="settings-language-nav-bar"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection testID="settings-language">
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
