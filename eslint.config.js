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
      // forward guard, not a fix: no module has generated Nitrogen output
      // large enough for ESLint to notice today (see tsconfig.json's own
      // matching exclude).
      'modules/*/nitrogen/generated/**',
      // installed skills, docs tooling, and CI config are owned by other
      // stages/tooling (see AGENTS.md) — not this app's source.
      '.claude/**',
      '.github/**',
      'docs/**',
    ],
  },
  expoConfig,
  prettierConfig,
  {
    // forbids a function-valued Unistyles style ("dynamic function" style)
    // anywhere in src/. a style that is itself a function is not parsed
    // until Unistyles calls it at least once, so it stays out of every set
    // a theme change consults until then — a stylesheet that never renders
    // before a theme change (this app's own launch path, every time) keeps
    // whatever theme was active when its `StyleSheet.create` first ran for
    // the rest of the process. `src/core/navigation/tab-bar.tsx` hit this
    // exactly (issue #68); see
    // docs/decisions/2026-08-29-ban-dynamic-function-styles.md for the full
    // mechanism, verified against react-native-unistyles's own source.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create'] Property > :matches(ArrowFunctionExpression, FunctionExpression)",
          message:
            'A Unistyles style must not itself be a function (a "dynamic function" style). Unistyles only parses a dynamic function\'s uni__dependencies once it has been called at least once, so a theme change that happens before this style\'s first render never refreshes it — see issue #68 and docs/decisions/2026-08-29-ban-dynamic-function-styles.md. Move the per-render value out of the stylesheet and apply it as a separate style at the call site instead.',
        },
      ],
    },
  },
]);
