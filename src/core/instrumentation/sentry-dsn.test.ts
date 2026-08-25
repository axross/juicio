import { resolveSentryDsn } from './sentry-dsn';

describe('resolveSentryDsn', () => {
  it('returns undefined when the variable is unset', () => {
    expect(resolveSentryDsn(undefined)).toBeUndefined();
  });

  it('returns undefined when the variable is an empty string', () => {
    expect(resolveSentryDsn('')).toBeUndefined();
  });

  it('returns undefined when the variable is not a well-formed URL', () => {
    expect(resolveSentryDsn('not-a-dsn')).toBeUndefined();
  });

  it('returns the DSN unchanged when it is a well-formed URL', () => {
    const dsn = 'https://examplePublicKey@o0.ingest.sentry.io/0';

    expect(resolveSentryDsn(dsn)).toBe(dsn);
  });
});
