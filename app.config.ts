import { execSync } from 'node:child_process';

import type { ExpoConfig, ConfigContext } from 'expo/config';

import { resolveSentryRelease } from './src/core/instrumentation/sentry-identity.ts';
import { withAndroidAbiFilter } from './plugins/with-android-abi-filter.ts';

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

// A build run outside CI (a developer's own machine) has no CI run number to
// read, and never reaches Firebase App Distribution or a store, so this
// fallback's lack of monotonicity has no consequence — it exists only so
// `expo config` still resolves a valid build number when run locally.
const LOCAL_BUILD_NUMBER_FALLBACK = 1;

/**
 * The single build number `android.versionCode` and `ios.buildNumber` both
 * derive from below, resolved once so the two can never diverge — the same
 * pattern `resolveCommitHash` above and `resolveSentryRelease` follow.
 * `GITHUB_RUN_NUMBER` increases by one on every run of a workflow in this
 * repository; see
 * docs/decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md
 * for why it was chosen over the alternatives.
 */
function resolveBuildNumber(): number {
  const runNumber = process.env.GITHUB_RUN_NUMBER;
  if (runNumber) {
    const parsed = Number.parseInt(runNumber, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return LOCAL_BUILD_NUMBER_FALLBACK;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const previewVersionName = process.env.PREVIEW_VERSION_NAME;
  const version = previewVersionName ?? config.version;
  const commitHash = resolveCommitHash();
  const buildNumber = resolveBuildNumber();

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
    // Appended after app.json's own plugin list rather than replacing it —
    // it only overrides a gradle.properties value none of those plugins
    // touch, so order among them doesn't matter; see
    // plugins/with-android-abi-filter.ts and
    // docs/operations/preview-deployment.md.
    //
    // `ExpoConfig['plugins']` types a plugin entry as a module-name string
    // (or a [name, options] tuple) only, not as a function — even though
    // `@expo/config-plugins` resolves a function entry at runtime exactly
    // like a resolved string one (see `withStaticPlugin`'s `typeof
    // pluginResolve === 'function'` branch). The cast below documents that
    // gap rather than papering over a real type error.
    plugins: [...(config.plugins ?? []), withAndroidAbiFilter] as ExpoConfig['plugins'],
    extra: {
      ...config.extra,
      commitHash,
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
