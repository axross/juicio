import * as Sentry from '@sentry/react-native';

import { resolveSentryDsn } from './sentry-dsn';

let initialized = false;

/**
 * Initializes Sentry from EXPO_PUBLIC_SENTRY_DSN when present and
 * well-formed. Safe to call even when the variable is absent: the app runs
 * normally with error tracking simply disabled.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = resolveSentryDsn(process.env.EXPO_PUBLIC_SENTRY_DSN);

  if (!dsn) {
    return;
  }

  Sentry.init({ dsn });
  initialized = true;
}
