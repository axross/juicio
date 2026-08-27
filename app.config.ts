import { execSync } from 'node:child_process';

import type { ExpoConfig, ConfigContext } from 'expo/config';

import {
  resolveBuildChannel,
  resolveBuildNumber,
  resolveSentryRelease,
} from './src/core/instrumentation/sentry-identity.ts';

function resolveCommitHash(): string | undefined {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }

  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const previewVersionName = process.env.PREVIEW_VERSION_NAME;
  const version = previewVersionName ?? config.version;
  const commitHash = resolveCommitHash();
  const buildNumber = resolveBuildNumber(process.env.GITHUB_RUN_NUMBER);
  // `GITHUB_RUN_NUMBER` is set automatically for every job GitHub Actions
  // runs (see docs/decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md),
  // so its absence is what marks this config evaluation as a local,
  // non-CI build — the "is this a development build" signal
  // `resolveBuildChannel` needs, and the only one available here: this
  // file runs under Node during `expo prebuild`/`expo config`/`expo
  // start`, where the RN runtime's `__DEV__` global (what
  // `resolveSentryEnvironment` uses for the same distinction at runtime,
  // in `src/core/instrumentation/sentry.ts`) does not exist.
  const isDevelopmentBuild = !process.env.GITHUB_RUN_NUMBER;
  const buildChannel = resolveBuildChannel(version, isDevelopmentBuild);

  return {
    ...config,
    name: config.name ?? 'juicio',
    slug: config.slug ?? 'juicio',
    version,
    ios: {
      ...config.ios,
      // Expo requires this as a string; a number here is a silent config
      // error rather than a type error. See `resolveBuildNumber` above.
      buildNumber: String(buildNumber),
    },
    android: {
      ...config.android,
      // Expo requires this as a number, unlike ios.buildNumber above — see
      // `resolveBuildNumber`, the single source both are derived from.
      versionCode: buildNumber,
    },
    extra: {
      ...config.extra,
      commitHash,
      // Settings' Technical Information block reads these two straight
      // back through expo-constants — see
      // src/core/instrumentation/sentry-identity.ts for what each
      // resolves to and why `buildChannel` shares its signals with
      // `resolveSentryEnvironment` below.
      buildChannel,
      buildNumber,
      // The single computation of the Sentry release string: `sentry.ts`
      // reads this field through `expo-constants` at runtime, and the
      // Android preview workflow reads the same field from `npx expo config
      // --type public --json` before the Sentry Android Gradle Plugin's
      // source-map upload, so the value the app reports and the value the
      // upload is filed under can never drift apart — see
      // docs/operations/preview-deployment.md and
      // .claude/skills/sentry-instrumentation/references/identity-and-releases.md.
      sentryRelease: resolveSentryRelease(version, commitHash),
    },
  };
};
