import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SupportedLanguage } from '@/core/i18n';

import { resolveStoredAnalyticsPreference } from '../model/analytics-preference';
import { resolveStoredLanguage } from '../model/language';
import { resolveStoredTheme, type ThemePreference } from '../model/theme';

/**
 * AsyncStorage keys for the three persisted settings — see
 * docs/decisions/2026-08-26-store-user-settings-in-async-storage.md. no
 * decision record names the exact strings; fixed here as the one place
 * any of the three keys is spelled out. `ANALYTICS_KEY` was added by issue
 * #211, following the same naming shape as the two that already existed.
 */
const LANGUAGE_KEY = 'juicio.settings.language';
const THEME_KEY = 'juicio.settings.theme';
const ANALYTICS_KEY = 'juicio.settings.analytics';

/**
 * reads the persisted language override. the raw read and the parse that
 * validates it happen together, right here — see
 * `../model/language.ts#resolveStoredLanguage` — so nothing downstream ever
 * sees the unparsed AsyncStorage value.
 */
export async function readStoredLanguage(): Promise<SupportedLanguage | undefined> {
  const raw = await AsyncStorage.getItem(LANGUAGE_KEY);

  return resolveStoredLanguage(raw);
}

export async function writeStoredLanguage(language: SupportedLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}

/** reads the persisted theme preference, defaulting to `system` — see
 * `../model/theme.ts#resolveStoredTheme`. */
export async function readStoredTheme(): Promise<ThemePreference> {
  const raw = await AsyncStorage.getItem(THEME_KEY);

  return resolveStoredTheme(raw);
}

export async function writeStoredTheme(theme: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme);
}

/** reads the persisted analytics preference, defaulting to `true` (this
 * project's own default: on) — see
 * `../model/analytics-preference.ts#resolveStoredAnalyticsPreference`. */
export async function readStoredAnalyticsPreference(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(ANALYTICS_KEY);

  return resolveStoredAnalyticsPreference(raw);
}

export async function writeStoredAnalyticsPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ANALYTICS_KEY, String(enabled));
}
