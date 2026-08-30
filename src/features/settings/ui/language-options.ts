import type { SupportedLanguage } from '@/core/i18n';

/**
 * shared between the Settings screen (to show the active language's own
 * label on its `Language` disclosure row) and the `Language` child screen
 * (to list both options as radio rows) — one definition so the two never
 * drift apart.
 */
export const LANGUAGE_LABEL_KEYS = {
  en: 'language.optionEnglish',
  ja: 'language.optionJapanese',
} as const;

export const LANGUAGE_OPTIONS: readonly { value: SupportedLanguage; testID: string }[] = [
  { value: 'en', testID: 'settings-language-en' },
  { value: 'ja', testID: 'settings-language-ja' },
];
