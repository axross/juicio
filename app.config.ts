import { execSync } from 'node:child_process';

import type { ExpoConfig, ConfigContext } from 'expo/config';

import { resolveSentryRelease } from './src/core/instrumentation/sentry-identity.ts';

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

  return {
    ...config,
    name: config.name ?? 'juicio',
    slug: config.slug ?? 'juicio',
    version,
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
