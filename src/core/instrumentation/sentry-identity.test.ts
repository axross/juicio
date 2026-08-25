import { resolveSentryEnvironment, resolveSentryRelease } from './sentry-identity';

describe('resolveSentryRelease', () => {
  it('combines the version and commit hash when both are present', () => {
    expect(resolveSentryRelease('0.1.0', 'abc123')).toBe('0.1.0+abc123');
  });

  it('falls back to the version alone when no commit hash is available', () => {
    expect(resolveSentryRelease('0.1.0', undefined)).toBe('0.1.0');
  });

  it('falls back to "unknown" when no version is available either', () => {
    expect(resolveSentryRelease(undefined, undefined)).toBe('unknown');
  });

  it('falls back to "unknown" when the version is an empty string', () => {
    expect(resolveSentryRelease('', 'abc123')).toBe('unknown+abc123');
  });
});

describe('resolveSentryEnvironment', () => {
  it('reports development for a development build regardless of version', () => {
    expect(resolveSentryEnvironment('0.1.0-pr-42', true)).toBe('development');
  });

  it('reports preview for a non-development build with a PR-suffixed version', () => {
    expect(resolveSentryEnvironment('0.1.0-pr-42', false)).toBe('preview');
  });

  it('reports production for a non-development build with a plain version', () => {
    expect(resolveSentryEnvironment('0.1.0', false)).toBe('production');
  });

  it('reports production for a non-development build with no version at all', () => {
    expect(resolveSentryEnvironment(undefined, false)).toBe('production');
  });
});
