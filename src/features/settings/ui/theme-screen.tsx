import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';

import { setThemePreference, useThemePreference } from '../adapter/use-theme-preference';
import { changeTheme } from '../usecase/change-theme';
import { fireAndForget } from './fire-and-forget';
import { RadioRow } from './radio-row';
import { rowPosition } from './row-position';
import { SettingsSection } from './settings-section';
import { THEME_LABEL_KEYS, THEME_OPTIONS } from './theme-options';

/**
 * the `Theme` child screen: its own nav bar, one card of the three theme
 * `RadioRow`s at the same 16dp inset the Settings screen's own cards use,
 * and — 16dp below the card, in the `caption` role in `text.neutral.low` —
 * a description of what the three options do.
 *
 * a tap both writes `useThemePreference`'s store (so the Settings screen's
 * own `Theme` row reflects it too) and calls `changeTheme` — Unistyles
 * fires no change notification for a same-theme transition, so the store
 * write is what moves the checked radio when `changeTheme`'s own runtime
 * effect would not.
 */
export function ThemeScreen({
  onBack,
  style,
  ...props
}: ComponentProps<typeof View> & {
  onBack: () => void;
}) {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('settings');
  const themePreference = useThemePreference();

  return (
    // per docs/conventions/component-styling.md, style merges last over
    // this screen's own `flex: 1`; rest props (this screen's own hardcoded
    // `testID` default included) spread last too, the default ordering per
    // docs/conventions/component-contracts.md.
    <View style={[styles.screen, style]} testID="settings-theme-screen" {...props}>
      <NavBar
        title={t('theme.sectionTitle')}
        onBack={onBack}
        backAccessibilityLabel={tNav('back')}
        testID="settings-theme-nav-bar"
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSection testID="settings-theme" description={t('theme.description')}>
          {THEME_OPTIONS.map((option, index) => (
            <RadioRow
              key={option.value}
              label={t(THEME_LABEL_KEYS[option.value])}
              selected={themePreference === option.value}
              onPress={() => {
                setThemePreference(option.value);
                fireAndForget(changeTheme(option.value));
              }}
              position={rowPosition(index, THEME_OPTIONS.length)}
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
