import i18next from '@/core/i18n';
import type { SupportedLanguage } from '@/core/i18n';
import { identifyUserProperty } from '@/core/instrumentation/analytics';

import { writeStoredLanguage } from '../adapter/settings-storage';

/**
 * this project's own fixed label for each `SupportedLanguage`, sent as the
 * `Language` user property — a language names itself the same way
 * regardless of which language is currently active
 * (`../ui/language-options.ts#LANGUAGE_LABEL_KEYS`'s own `en.ts`/`ja.ts`
 * values already agree on both, per `en.ts`'s own "a language names
 * itself" comment), so this table is not a second source that could drift
 * from those in the way `change-theme.ts`'s own `THEME_ANALYTICS_LABELS`
 * genuinely would have to guard against — it exists anyway, alongside that
 * one, so this event's own value never depends on i18next's live instance
 * (see `screen-name.ts` for the same "this project's own fixed name"
 * reasoning applied to a third dimension).
 */
const LANGUAGE_ANALYTICS_LABELS: Record<SupportedLanguage, string> = {
  en: 'English (United States)',
  ja: '日本語',
};

/**
 * changes the app's language immediately (every mounted `useTranslation()`
 * re-renders through react-i18next) and persists the choice so it survives
 * a restart. also records the new language as an ongoing `Language` user
 * property rather than a one-off event.
 */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  await i18next.changeLanguage(language);
  identifyUserProperty('language', LANGUAGE_ANALYTICS_LABELS[language]);
  await writeStoredLanguage(language);
}
