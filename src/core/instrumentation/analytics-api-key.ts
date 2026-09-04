import { z } from 'zod';

/**
 * an Amplitude API key is either absent/empty (tracking disabled) or a
 * well-formed non-empty string. Amplitude issues opaque alphanumeric keys
 * with no fixed shape to validate beyond that, unlike a Sentry DSN's URL
 * form (`./sentry-dsn.ts`) — so "non-empty" is the whole check.
 */
const amplitudeApiKeySchema = z.union([z.literal(''), z.string().min(1)]).optional();

/**
 * resolves a raw environment value into a usable Amplitude API key, or
 * `undefined` when tracking should stay disabled (unset or empty).
 *
 * kept dependency-free from the Amplitude SDK itself, mirroring
 * `./sentry-dsn.ts#resolveSentryDsn`, so it can be unit tested without
 * loading native Amplitude modules.
 */
export function resolveAmplitudeApiKey(raw: string | undefined): string | undefined {
  const result = amplitudeApiKeySchema.safeParse(raw);

  if (!result.success || !result.data) {
    return undefined;
  }

  return result.data;
}
