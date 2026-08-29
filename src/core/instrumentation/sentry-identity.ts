/**
 * derives the `release`, `environment`, `buildChannel`, and `buildNumber`
 * values `app.config.ts` computes once and this app reports at runtime
 * through `expo-constants` — from build metadata this app already has
 * rather than a second source of truth. `resolveBuildChannel` shares its
 * two signals with `resolveSentryEnvironment` on purpose: Settings'
 * `Build` row and the environment Sentry files an event under must never
 * be able to drift apart.
 *
 * kept dependency-free from `expo-constants` and `@sentry/react-native`
 * so it can be unit tested without loading native modules — see
 * `sentry-dsn.ts` for the same pattern.
 */

export type SentryEnvironment = 'development' | 'preview' | 'production';

/**
 * combines the app version with the commit that produced the build, so a
 * release maps back to source without a separate lookup. falls back to the
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
 * distinguishes development, preview, and production so incident response
 * can filter to production without development or preview noise mixed in.
 *
 * preview builds are identified by the `<version>-pr-<n>` version name the
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

/** which pipeline produced the running build — see docs/glossary.md. shown
 * verbatim (not translated — see docs/conventions/design-system.md) in
 * Settings' Technical Information block. */
export type BuildChannel = 'Development' | 'Preview' | 'Production';

/**
 * same two signals and the same branch order as `resolveSentryEnvironment`
 * above — only the casing differs, to match `BuildChannel`'s exact
 * `Development`/`Preview`/`Production` literals rather than Sentry's own
 * lowercase `environment` convention. computed once, in `app.config.ts`,
 * and read back through `expo-constants` rather than recomputed at
 * runtime — see that file for what `isDevelopmentBuild` resolves to
 * outside a running app, where `__DEV__` does not exist.
 */
export function resolveBuildChannel(
  version: string | undefined,
  isDevelopmentBuild: boolean,
): BuildChannel {
  if (isDevelopmentBuild) {
    return 'Development';
  }

  return version?.includes('-pr-') ? 'Preview' : 'Production';
}

/**
 * `docs/decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md`:
 * `GITHUB_RUN_NUMBER` (GitHub Actions sets it for every job automatically)
 * when running in CI, a fixed local fallback otherwise. a build run outside
 * CI never reaches Firebase App Distribution or a store, so this fallback's
 * lack of monotonicity has no consequence — it exists only so `expo config`
 * still resolves a valid build number when run locally, and `1` rather than
 * `0` because a store rejects a non-positive `versionCode` outright.
 */
const LOCAL_BUILD_NUMBER = 1;

export function resolveBuildNumber(githubRunNumber: string | undefined): number {
  const parsed = githubRunNumber === undefined ? NaN : Number(githubRunNumber);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : LOCAL_BUILD_NUMBER;
}
