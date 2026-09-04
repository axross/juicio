import { create } from 'zustand';

import { setAnalyticsEnabled } from '@/core/instrumentation/analytics';

type AnalyticsPreferenceState = {
  enabled: boolean;
};

/**
 * shared client state for the on-device analytics preference (issue #211),
 * following the same shape `use-theme-preference.ts` already established
 * for a different persisted setting: read by the Settings screen's own
 * Analytics disclosure row (to show its current value) and by the
 * Analytics child screen (to check its switch), written by that same
 * screen's switch and by `apply-persisted-settings.ts` at boot.
 *
 * defaults to `true` (enabled) — this project's own default — matching
 * `../model/analytics-preference.ts#resolveStoredAnalyticsPreference`'s own
 * default before the persisted value has ever been read.
 *
 * exported (not just the hook below) so a test can reset it between cases
 * — see `use-theme-preference.ts`'s own precedent and
 * `analytics-screen.test.tsx`.
 */
export const useAnalyticsPreferenceStore = create<AnalyticsPreferenceState>(() => ({
  enabled: true,
}));

/**
 * the analytics preference's one write path — called at boot with the
 * persisted value (`../usecase/apply-persisted-settings.ts`) and again on
 * every tap of the Analytics screen's switch
 * (`../usecase/change-analytics-preference.ts`). Updates this shared store,
 * so every mounted reader stays in sync, and pushes the same value into
 * `@/core/instrumentation/analytics.ts`'s own gate (`setAnalyticsEnabled`)
 * — the one call that actually takes effect on the next `trackEvent`.
 *
 * pushing from this features-layer adapter into `core/`, rather than
 * having `core/instrumentation/analytics.ts` read this feature's own
 * store, is what keeps docs/conventions/directory-structure.md's one-way
 * `core` import direction intact: `core/` must not import a features-layer
 * module, so `analytics.ts` exposes a plain setter instead and this is the
 * one place that calls it — the same adapter-pushes-into-a-lower-layer
 * shape `apply-theme-instruction.ts` already uses for Unistyles, just in
 * the opposite direction (into `core/` rather than into a vendor runtime
 * `core/` itself wraps).
 */
export function setAnalyticsPreference(enabled: boolean): void {
  useAnalyticsPreferenceStore.setState({ enabled });
  setAnalyticsEnabled(enabled);
}

/** the current analytics preference — read by both the Settings screen's
 * own Analytics row and the Analytics child screen's switch. */
export function useAnalyticsPreference(): boolean {
  return useAnalyticsPreferenceStore((state) => state.enabled);
}
