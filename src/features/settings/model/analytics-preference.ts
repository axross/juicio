import { z } from 'zod';

const STORED_VALUES = ['true', 'false'] as const;
const analyticsPreferenceSchema = z.enum(STORED_VALUES);

/**
 * coerces a raw AsyncStorage read into the on-device analytics preference,
 * defaulting to `true` (enabled) — this project's own default — for both
 * "nothing was ever stored" and "what was stored is corrupt or isn't one of
 * the two strings this app ever writes". mirrors `theme.ts#resolveStoredTheme`'s
 * own shape (a zod enum over AsyncStorage's own string-only value type,
 * safe-parsed with a fixed fallback) for this project's third persisted
 * setting.
 */
export function resolveStoredAnalyticsPreference(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) {
    return true;
  }

  const result = analyticsPreferenceSchema.safeParse(raw);

  return result.success ? result.data === 'true' : true;
}
