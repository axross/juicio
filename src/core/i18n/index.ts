/**
 * The app's i18next instance. Imported once for its side effect — from
 * `main.ts`, at module scope — so the device-locale default is already
 * resolved and every string is translatable before the root layout ever
 * renders. `expo-localization`'s `getLocales()` is synchronous, so this
 * module needs no async gate of its own; the persisted-language *override*
 * is a separate, async step the root layout's readiness gate performs (see
 * `src/features/settings/usecase/apply-persisted-settings.ts`).
 */
import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './resources/en';
import { ja } from './resources/ja';
import { resolveDeviceLanguage } from './resolve-device-language';

export type { SupportedLanguage } from './resolve-device-language';

const SUPPORTED_LANGUAGES = ['en', 'ja'] as const;
const NAMESPACES = ['navigation', 'settings', 'analyze', 'history'] as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: (typeof NAMESPACES)[0];
    resources: typeof en;
  }
}

// eslint-disable-next-line import/no-named-as-default-member -- `i18next.use(...)` is the library's own documented plugin API, not a mistaken reach for the named `use` export.
void i18next.use(initReactI18next).init({
  lng: resolveDeviceLanguage(getLocales()),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: NAMESPACES,
  defaultNS: NAMESPACES[0],
  resources: { en, ja },
  interpolation: {
    // React already escapes rendered text; a second escaping pass here
    // would double-encode entities like `&` in interpolated values.
    escapeValue: false,
  },
  returnNull: false,
  // A missing key must never render silently as the raw key: that flag
  // reads as real copy to anyone who cannot read the source, in either
  // language. In development it throws, so an author sees a missing key
  // immediately; in production it degrades to an empty string, so a gap in
  // the resources never leaks an i18next key onto a screen.
  parseMissingKeyHandler: (key) => {
    if (__DEV__) {
      throw new Error(`Missing i18next translation key: "${key}"`);
    }

    return '';
  },
});

export default i18next;
