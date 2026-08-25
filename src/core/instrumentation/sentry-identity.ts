/**
 * Derives the `release` and `environment` values Sentry.init reports,
 * from build metadata this app already computes rather than a second
 * source of truth: `app.config.ts` resolves `extra.commitHash` and
 * `PREVIEW_VERSION_NAME`-derived `version`, both reachable at runtime
 * through `expo-constants`.
 *
 * Kept dependency-free from `expo-constants` and `@sentry/react-native`
 * so it can be unit tested without loading native modules — see
 * `sentry-dsn.ts` for the same pattern.
 */

export type SentryEnvironment = 'development' | 'preview' | 'production';

/**
 * Combines the app version with the commit that produced the build, so a
 * release maps back to source without a separate lookup. Falls back to the
 * version alone when no commit hash is available (for example, a local
 * build outside CI and outside a git checkout).
 */
export function resolveSentryRelease(
  version: string | undefined,
  commitHash: string | undefined,
): string {
  const safeVersion = version && version.length > 0 ? version : 'unknown';

  return commitHash ? `${safeVersion}+${commitHash}` : safeVersion;
}

/**
 * Distinguishes development, preview, and production so incident response
 * can filter to production without development or preview noise mixed in.
 *
 * Preview builds are identified by the `<version>-pr-<n>` version name the
 * Android preview pipeline injects through `PREVIEW_VERSION_NAME` (see
 * docs/operations/preview-deployment.md); this project has no production
 * release pipeline yet, so any non-development, non-preview build is
 * reported as production.
 */
export function resolveSentryEnvironment(
  version: string | undefined,
  isDevelopmentBuild: boolean,
): SentryEnvironment {
  if (isDevelopmentBuild) {
    return 'development';
  }

  return version?.includes('-pr-') ? 'preview' : 'production';
}
