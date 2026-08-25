const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    ignores: [
      'node_modules/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'src/core/db/migrations/**',
      'expo-env.d.ts',
      // Installed skills, docs tooling, and CI config are owned by other
      // stages/tooling (see AGENTS.md) — not this app's source.
      '.claude/**',
      '.github/**',
      'docs/**',
    ],
  },
  expoConfig,
  prettierConfig,
]);
