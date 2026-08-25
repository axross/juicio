import { execSync } from 'node:child_process';

import type { ExpoConfig, ConfigContext } from 'expo/config';

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

  return {
    ...config,
    name: config.name ?? 'juicio',
    slug: config.slug ?? 'juicio',
    version: previewVersionName ?? config.version,
    extra: {
      ...config.extra,
      commitHash: resolveCommitHash(),
    },
  };
};
