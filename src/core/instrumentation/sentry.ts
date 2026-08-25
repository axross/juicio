import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { resolveSentryDsn } from './sentry-dsn';
import { resolveSentryEnvironment, resolveSentryRelease } from './sentry-identity';

let initialized = false;

/**
 * Initializes Sentry from EXPO_PUBLIC_SENTRY_DSN when present and
 * well-formed. Safe to call even when the variable is absent: the app runs
 * normally with error tracking simply disabled.
 *
 * Tags every report with a release (the app version plus the commit that
 * produced the build) and an environment (development / preview /
 * production), derived from `app.config.ts`'s existing `extra.commitHash`
 * and `version` rather than a second source of truth — see
 * `sentry-identity.ts`. Sending is disabled in development builds; the
 * wiring stays in place so it can be turned on locally to test it.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = resolveSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);

  if (!dsn) {
    return;
  }

  const version = Constants.expoConfig?.version;
  const commitHash = Constants.expoConfig?.extra?.commitHash as string | undefined;

  Sentry.init({
    dsn,
    release: resolveSentryRelease(version, commitHash),
    environment: resolveSentryEnvironment(version, __DEV__),
    enabled: !__DEV__,
  });
  initialized = true;
}
