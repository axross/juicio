/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // `react-native-unistyles`'s `StyleSheet` imports `react-native-nitro-
  // modules` at module scope (`src/index.ts` → `specs/index.native.ts` →
  // `NitroModules` → `NativeNitroModules`), which throws outside a native
  // runtime — there is no Nitro binary for Jest to load. that broke this
  // project's first component test the moment it imported a styled
  // component. `react-native-unistyles/mocks` is the library's own Jest
  // entry point, mocking both `react-native-unistyles` and
  // `react-native-nitro-modules` so a themed component renders under
  // Jest; it must load before any test module, hence `setupFiles` rather
  // than `setupFilesAfterEnv`.
  setupFiles: ['react-native-unistyles/mocks'],
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
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
