import { resolveAmplitudeApiKey } from './analytics-api-key';

describe('resolveAmplitudeApiKey', () => {
  it('returns undefined when the variable is unset', () => {
    expect(resolveAmplitudeApiKey(undefined)).toBeUndefined();
  });

  it('returns undefined when the variable is an empty string', () => {
    expect(resolveAmplitudeApiKey('')).toBeUndefined();
  });

  it('returns the key unchanged when it is a non-empty string', () => {
    expect(resolveAmplitudeApiKey('abcd1234')).toBe('abcd1234');
  });
});
