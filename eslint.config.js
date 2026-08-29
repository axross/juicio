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
    //
    // the first selector below catches a function written directly as a
    // style's value. Unistyles itself does not care how that function got
    // there — it classifies a style as dynamic by `typeof value ===
    // 'function'` at runtime, not by AST shape — so a style key that merely
    // *references* a function by identifier (`root: dynamicRoot`) carries
    // the identical hazard while looking, to this rule's first selector,
    // like an ordinary property. The next three selectors close that gap by
    // flagging an Identifier-valued top-level style key across the three
    // `StyleSheet.create` factory shapes this project uses: an
    // arrow-function factory with an implicit-return object body, an
    // arrow-function or `function` factory with a block body and an
    // explicit `return`, and a plain object literal passed directly. Each
    // one is anchored with `>` (a direct-child chain, not a descendant
    // search) all the way from the top-level object down to the property,
    // specifically so it does not also match an Identifier-valued property
    // nested *inside* a style's own value — `height: BUTTON_HEIGHT` is a
    // legitimate, common pattern (see `src/shared/ui/empty-state/`,
    // `src/features/settings/ui/settings-row.tsx`, and elsewhere) and must
    // keep passing.
    //
    // this is still a syntactic check, not a value-shape one: a property
    // whose value is a call expression that itself returns a function
    // (`root: makeRoot()`) is not an Identifier node and slips past every
    // selector here. See the decision record's "cost this accepts" section.
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
        {
          selector:
            "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create'] > ArrowFunctionExpression > ObjectExpression.body > Property[value.type='Identifier']",
          message:
            'A Unistyles style must not reference a function by identifier (a "dynamic function" style in disguise). Unistyles classifies a style as dynamic by `typeof value === \'function\'` at runtime, not by whether the function is written inline, so this carries the same hazard as a function literal in the same position — see issue #68 and docs/decisions/2026-08-29-ban-dynamic-function-styles.md. Move the per-render value out of the stylesheet and apply it as a separate style at the call site instead.',
        },
        {
          selector:
            "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create'] > ObjectExpression > Property[value.type='Identifier']",
          message:
            'A Unistyles style must not reference a function by identifier (a "dynamic function" style in disguise). Unistyles classifies a style as dynamic by `typeof value === \'function\'` at runtime, not by whether the function is written inline, so this carries the same hazard as a function literal in the same position — see issue #68 and docs/decisions/2026-08-29-ban-dynamic-function-styles.md. Move the per-render value out of the stylesheet and apply it as a separate style at the call site instead.',
        },
        {
          selector:
            "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create'] > :matches(ArrowFunctionExpression, FunctionExpression) > BlockStatement.body > ReturnStatement > ObjectExpression.argument > Property[value.type='Identifier']",
          message:
            'A Unistyles style must not reference a function by identifier (a "dynamic function" style in disguise). Unistyles classifies a style as dynamic by `typeof value === \'function\'` at runtime, not by whether the function is written inline, so this carries the same hazard as a function literal in the same position — see issue #68 and docs/decisions/2026-08-29-ban-dynamic-function-styles.md. Move the per-render value out of the stylesheet and apply it as a separate style at the call site instead.',
        },
      ],
    },
  },
]);
