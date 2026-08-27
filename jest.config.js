/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // `docs/conventions/testing.md` states the colocation rule ("beside its
  // subject") against a codebase where every subject lived under `src/`;
  // `modules/espada-engine/src/` is this project's first subject that
  // doesn't. Extending the glob here, rather than moving the wrapper's
  // tests under `src/` or introducing a second Jest project, keeps that
  // same colocation rule true for a subject outside `src/` too, with no
  // extra runner config beyond the one line below.
  //
  // The glob reaches `modules/*/src/` only. A native module's Rust lives
  // under `modules/*/lib/`, so neither its sources nor cargo's `target/`
  // output is inside anything this runner walks — which is why no ignore
  // pattern for them appears here.
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/modules/**/src/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
