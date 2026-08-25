import { z } from 'zod';

/**
 * A Sentry DSN is either absent/empty (tracking disabled) or a well-formed
 * URL. Anything else is a misconfiguration we should not silently send to
 * Sentry.init.
 */
const sentryDsnSchema = z.union([z.literal(''), z.string().url()]).optional();

/**
 * Resolves a raw environment value into a usable Sentry DSN, or `undefined`
 * when tracking should stay disabled (unset, empty, or malformed).
 *
 * Kept dependency-free from the Sentry SDK itself so it can be unit tested
 * without loading native Sentry modules.
 */
export function resolveSentryDsn(raw: string | undefined): string | undefined {
  const result = sentryDsnSchema.safeParse(raw);

  if (!result.success || !result.data) {
    return undefined;
  }

  return result.data;
}
