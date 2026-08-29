/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // `docs/conventions/testing.md` states the colocation rule ("beside its
  // subject") against a codebase where every subject lived under `src/`;
  // `modules/espada-engine/src/` is this project's first subject that
  // doesn't. extending the glob here, rather than moving the wrapper's
  // tests under `src/` or introducing a second Jest project, keeps that
  // same colocation rule true for a subject outside `src/` too, with no
  // extra runner config beyond the one line below.
  //
  // the glob reaches `modules/*/src/` only. a native module's Rust lives
  // under `modules/*/lib/`, so neither its sources nor cargo's `target/`
  // output is inside anything this runner walks — which is why no ignore
  // pattern for them appears here.
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/modules/**/src/**/*.test.{ts,tsx}'],
  // a native module's Rust lives under `modules/*/lib/`, and Jest must be
  // kept out of it — `testMatch` above is not enough. Jest's obsolete-
  // snapshot scan walks the haste file map rather than `testMatch`, so it
  // discovers the `insta` snapshot fixtures a forked Rust crate commits
  // (`lib/espada-internal/src/**/snapshots/*.snap`), reports all 13 as
  // "obsolete" on every run, and — this is the part that matters —
  // `npm run test:unit -- -u` deletes them. that was reproduced, not
  // theorised: the fixtures vanished and the 1260-test Rust suite that
  // asserts against them lost its expectations.
  //
  // `modulePathIgnorePatterns` is what bounds the haste crawl;
  // `testPathIgnorePatterns` would not, since it only filters test
  // discovery. this cannot be driven from `.gitignore` — the fixtures are
  // committed, and Jest reads no ignore file of its own.
  modulePathIgnorePatterns: ['<rootDir>/modules/[^/]+/lib/'],
  // registers react-native-unistyles' own Jest mock and this project's real
  // theme tokens against it (see jest.setup.ts) before any test file's own
  // imports run — this project's first component-test infrastructure,
  // needed once `settings-screen.test.tsx` mounts a themed component. this
  // is `setupFilesAfterEnv`, not `setupFiles`: `jest-expo`'s own preset
  // already populates `setupFiles` with its RN-environment polyfills
  // (`jest-preset.js:121-125`), and Jest replaces rather than merges a
  // config field the preset also sets — declaring `setupFiles` here would
  // silently drop those polyfills instead of adding to them.
  // `setupFilesAfterEnv` is a field the preset never touches, so nothing is
  // lost, and running after the test framework installs is early enough:
  // `jest.mock` calls still apply to every import a test file makes after
  // this runs.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
