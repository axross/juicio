import { resolveStoredAnalyticsPreference } from './analytics-preference';

describe('resolveStoredAnalyticsPreference', () => {
  it('defaults to true when nothing was ever stored', () => {
    expect(resolveStoredAnalyticsPreference(null)).toBe(true);
    expect(resolveStoredAnalyticsPreference(undefined)).toBe(true);
  });

  it('returns false when "false" was stored', () => {
    expect(resolveStoredAnalyticsPreference('false')).toBe(false);
  });

  it('returns true when "true" was stored', () => {
    expect(resolveStoredAnalyticsPreference('true')).toBe(true);
  });

  it('defaults to true when what was stored is corrupt', () => {
    expect(resolveStoredAnalyticsPreference('not-a-boolean')).toBe(true);
  });
});
