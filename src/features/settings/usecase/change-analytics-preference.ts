import { writeStoredAnalyticsPreference } from '../adapter/settings-storage';
import { setAnalyticsPreference } from '../adapter/use-analytics-preference';

/**
 * changes the on-device analytics preference immediately (every mounted
 * `useAnalyticsPreference()` re-renders, and
 * `@/core/instrumentation/analytics.ts`'s own gate takes effect on the very
 * next `trackEvent` call — no app restart needed) and persists the choice
 * so it survives one — mirroring `change-theme.ts`'s own shape for a
 * different persisted setting.
 */
export async function changeAnalyticsPreference(enabled: boolean): Promise<void> {
  setAnalyticsPreference(enabled);
  await writeStoredAnalyticsPreference(enabled);
}
