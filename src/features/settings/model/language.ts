import { z } from 'zod';

import type { SupportedLanguage } from '@/core/i18n';

/**
 * Validates a raw stored value against the language i18next already
 * declares support for (`SupportedLanguage`, from `@/core/i18n`). The
 * `z.ZodType<SupportedLanguage>` annotation makes that cross-reference a
 * compiler-checked fact rather than two lists kept in sync by hand: this
 * schema fails to type-check the moment `SupportedLanguage` and the set of
 * languages the app actually ships resources for diverge.
 */
export const languageSchema: z.ZodType<SupportedLanguage> = z.enum(['en', 'ja']);

/**
 * Coerces a raw AsyncStorage read into a `SupportedLanguage` override, or
 * `undefined` when there is none to apply — covering both "nothing was ever
 * stored" and "what was stored is corrupt or names a language this app
 * doesn't ship". Both are the same case from the caller's point of view:
 * fall through to whatever language is already active (the device-locale
 * default `@/core/i18n` resolved at startup), rather than crash or silently
 * apply a second, independent default here.
 */
export function resolveStoredLanguage(
  raw: string | null | undefined,
): SupportedLanguage | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  const result = languageSchema.safeParse(raw);

  return result.success ? result.data : undefined;
}
