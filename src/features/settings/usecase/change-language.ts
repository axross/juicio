import i18next from '@/core/i18n';
import type { SupportedLanguage } from '@/core/i18n';

import { writeStoredLanguage } from '../adapter/settings-storage';

/**
 * Changes the app's language immediately (every mounted `useTranslation()`
 * re-renders through react-i18next) and persists the choice so it survives
 * a restart.
 */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
  await writeStoredLanguage(language);
}
