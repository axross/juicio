import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SupportedLanguage } from '@/core/i18n';

import { resolveStoredLanguage } from '../model/language';
import { resolveStoredTheme, type ThemePreference } from '../model/theme';

/**
 * AsyncStorage keys for the two persisted settings — see
 * docs/decisions/2026-08-26-store-user-settings-in-async-storage.md. No
 * decision record names the exact strings; fixed here as the one place
 * either key is spelled out.
 */
const LANGUAGE_KEY = 'juicio.settings.language';
const THEME_KEY = 'juicio.settings.theme';

/**
 * Reads the persisted language override. The raw read and the parse that
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

/** Reads the persisted theme preference, defaulting to `system` — see
 * `../model/theme.ts#resolveStoredTheme`. */
export async function readStoredTheme(): Promise<ThemePreference> {
  const raw = await AsyncStorage.getItem(THEME_KEY);

  return resolveStoredTheme(raw);
}

export async function writeStoredTheme(theme: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_KEY, theme);
}
