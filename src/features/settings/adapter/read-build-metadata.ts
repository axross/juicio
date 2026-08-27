import Constants from 'expo-constants';

import { resolveTechnicalInfo, type TechnicalInfo } from '../model/technical-info';

/**
 * Reads the four Technical Information values back through `expo-constants`
 * — the same `extra` `app.config.ts` writes `buildChannel`, `buildNumber`,
 * and `commitHash` into, alongside `expoConfig.version` — and shapes them
 * with `resolveTechnicalInfo`. The `expo-constants` import is what makes
 * this an adapter rather than a model concern.
 */
export function readBuildMetadata(): TechnicalInfo {
  const extra = Constants.expoConfig?.extra ?? {};

  return resolveTechnicalInfo({
    buildChannel: typeof extra.buildChannel === 'string' ? extra.buildChannel : undefined,
    version: Constants.expoConfig?.version ?? undefined,
    buildNumber: typeof extra.buildNumber === 'number' ? extra.buildNumber : undefined,
    commitHash: typeof extra.commitHash === 'string' ? extra.commitHash : undefined,
  });
}
