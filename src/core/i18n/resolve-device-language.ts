/** the two languages this app ships resources for. */
export type SupportedLanguage = 'en' | 'ja';

/** the one field `resolveDeviceLanguage` reads off `expo-localization`'s
 * `Locale` — narrowed to a plain shape so this stays pure and testable
 * without the native module `getLocales()` itself requires. */
type LocaleLike = { languageCode: string | null };

/**
 * resolves the language a first-ever launch opens in, before any persisted
 * override exists to consult: `ja` when the device's first-listed locale is
 * Japanese, `en` for every other case, including a device that reports no
 * locale at all. `expo-localization`'s `getLocales()` orders its result by
 * the user's own device-settings preference, so only the first entry
 * matters here.
 */
export function resolveDeviceLanguage(locales: readonly LocaleLike[]): SupportedLanguage {
  return locales[0]?.languageCode === 'ja' ? 'ja' : 'en';
}
