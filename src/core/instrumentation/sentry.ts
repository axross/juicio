import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { resolveSentryDsn } from './sentry-dsn';
import { resolveSentryEnvironment } from './sentry-identity';

let initialized = false;

/**
 * initializes Sentry from EXPO_PUBLIC_SENTRY_DSN when present and
 * well-formed. safe to call even when the variable is absent: the app runs
 * normally with error tracking simply disabled.
 *
 * tags every report with a release and an environment (development /
 * preview / production). the release is read verbatim from
 * `extra.sentryRelease` — computed once in `app.config.ts` via
 * `resolveSentryRelease` (see `sentry-identity.ts`) — rather than
 * recomputed here, so the value this app reports and the value the Android
 * preview workflow passes to the Sentry source-map upload (which reads the
 * same field through `npx expo config`) are the same string from the same
 * source. the environment is still derived locally from `version` and
 * `__DEV__`, since nothing else needs that value to match a build pipeline.
 * sending is disabled in development builds; the wiring stays in place so
 * it can be turned on locally to test it.
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
  const release = (Constants.expoConfig?.extra?.sentryRelease as string | undefined) ?? 'unknown';

  Sentry.init({
    dsn,
    release,
    environment: resolveSentryEnvironment(version, __DEV__),
    enabled: !__DEV__,
  });
  initialized = true;
}
