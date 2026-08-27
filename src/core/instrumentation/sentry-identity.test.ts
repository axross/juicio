import {
  resolveBuildChannel,
  resolveBuildNumber,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from './sentry-identity';

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

describe('resolveBuildChannel', () => {
  it('reports Development for a development build regardless of version', () => {
    expect(resolveBuildChannel('0.1.0-pr-42', true)).toBe('Development');
  });

  it('reports Preview for a non-development build with a PR-suffixed version', () => {
    expect(resolveBuildChannel('0.1.0-pr-42', false)).toBe('Preview');
  });

  it('reports Production for a non-development build with a plain version', () => {
    expect(resolveBuildChannel('0.1.0', false)).toBe('Production');
  });

  it('reports Production for a non-development build with no version at all', () => {
    expect(resolveBuildChannel(undefined, false)).toBe('Production');
  });

  it('agrees with resolveSentryEnvironment on every branch, up to casing', () => {
    const cases: [string | undefined, boolean][] = [
      ['0.1.0-pr-42', true],
      ['0.1.0-pr-42', false],
      ['0.1.0', false],
      [undefined, false],
    ];

    for (const [version, isDevelopmentBuild] of cases) {
      expect(resolveBuildChannel(version, isDevelopmentBuild).toLowerCase()).toBe(
        resolveSentryEnvironment(version, isDevelopmentBuild),
      );
    }
  });
});

describe('resolveBuildNumber', () => {
  it('resolves to the numeric GITHUB_RUN_NUMBER when present', () => {
    expect(resolveBuildNumber('42')).toBe(42);
  });

  it('resolves to the local fallback when GITHUB_RUN_NUMBER is absent', () => {
    expect(resolveBuildNumber(undefined)).toBe(1);
  });

  it('resolves to the local fallback when GITHUB_RUN_NUMBER is not a valid positive integer', () => {
    expect(resolveBuildNumber('not-a-number')).toBe(1);
    expect(resolveBuildNumber('')).toBe(1);
    expect(resolveBuildNumber('-1')).toBe(1);
    expect(resolveBuildNumber('1.5')).toBe(1);
  });
});
