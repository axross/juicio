/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // `main.ts` is the one test subject that lives outside src/ (see
  // docs/conventions/directory-structure.md), so its colocated main.test.ts
  // needs its own root-level pattern alongside the general src/ one.
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
