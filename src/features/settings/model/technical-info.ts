/**
 * Shapes the Technical Information block's four values from whatever
 * `app.config.ts`'s `extra` happens to carry, so a line always renders a
 * legible value and never `undefined` — even in the pathological case where
 * `expo-constants` itself has nothing to report (see
 * `../adapter/read-build-metadata.ts`, the only caller that has real
 * `extra` to hand it). `buildChannel` and `buildNumber` are already
 * guaranteed non-empty by `resolveBuildChannel`/`resolveBuildNumber` in
 * `src/core/instrumentation/sentry-identity.ts`, computed once in
 * `app.config.ts`; the fallbacks here exist for the read path, not because
 * those two resolvers themselves are expected to fail.
 */

export type RawBuildMetadata = {
  buildChannel: string | undefined;
  version: string | undefined;
  buildNumber: number | undefined;
  commitHash: string | undefined;
};

export type TechnicalInfo = {
  buildChannel: string;
  version: string;
  buildNumber: string;
  /** Shortened to match the design's own example (`48038c4`). */
  commitHash: string;
};

const FALLBACK_BUILD_CHANNEL = 'Development';
const FALLBACK_VERSION = '0.0.0';
const FALLBACK_BUILD_NUMBER = '0';
const FALLBACK_COMMIT_HASH = 'unknown';
const SHORT_COMMIT_HASH_LENGTH = 7;

export function resolveTechnicalInfo(raw: RawBuildMetadata): TechnicalInfo {
  return {
    buildChannel:
      raw.buildChannel && raw.buildChannel.length > 0 ? raw.buildChannel : FALLBACK_BUILD_CHANNEL,
    version: raw.version && raw.version.length > 0 ? raw.version : FALLBACK_VERSION,
    buildNumber: raw.buildNumber !== undefined ? String(raw.buildNumber) : FALLBACK_BUILD_NUMBER,
    commitHash:
      raw.commitHash && raw.commitHash.length > 0
        ? raw.commitHash.slice(0, SHORT_COMMIT_HASH_LENGTH)
        : FALLBACK_COMMIT_HASH,
  };
}
