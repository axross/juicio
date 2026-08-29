---
status: accepted
---

# Ban Dynamic-Function Unistyles Styles Under `src/`

The tab bar's background rendered in the wrong theme's colour, permanently,
whenever the theme active at launch differed from the one Unistyles selected
when `StyleSheet.configure` ran (issue #68). The root cause was verified
against `react-native-unistyles@3.3.0`'s own bundled source, not guessed:
`src/core/navigation/tab-bar.tsx`'s stylesheet declared its `root` style as a
*dynamic function* — `root: (bottomInset) => ({ ... })` — inside a
two-argument `(theme, rt) => ({ root: ... })` factory, and that specific
combination is what a theme change silently fails to refresh.

## The mechanism

A dynamic function style is not parsed until Unistyles calls it — the
library defers parsing it deliberately, because it cannot know a caller's
own arguments (`bottomInset` here) ahead of a render that supplies them.
Parsing is also the only place a style's `uni__dependencies` (which of
`theme` and `rt` it reads) get populated. So until a dynamic function has
run at least once, its dependencies read as empty — not "unknown", empty —
and a theme change consults exactly two dependency sets to decide what to
refresh, both gated on that vector being non-empty. A stylesheet built from
a two-argument factory (`ThemableWithMiniRuntime`, in Unistyles' own
classification) is refreshed on a theme change only if it clears that gate;
a stylesheet built from a one-argument factory (`Themable`) is refreshed
unconditionally regardless, which is why every *other* themed style in this
codebase was unaffected — none of the others combines a two-argument
factory with a dynamic-function style the way the tab bar did.

The defect fired on every launch because of this app's own ordering, not by
chance: `main.ts` and `require.context` evaluate every route module —
`tab-bar.tsx`'s `StyleSheet.create` included — before `RootLayout` renders,
and the persisted theme preference is only applied once
`usePersistedSettings()` resolves, after that. So the dynamic function was
guaranteed to still be unparsed, its dependencies still empty, the one time
a theme change actually mattered: the one between `StyleSheet.create`
running and the tab bar's own first render. Switching the Settings selection
later "fixed" it for that session only because the tab bar had by then
rendered once, parsing the function and populating its dependencies for
next time.

## What this project does

A Unistyles style value under `src/` MUST NOT itself be a function, and a
top-level style key MUST NOT reference a function by identifier either.
`eslint.config.js` enforces both with `no-restricted-syntax` rules scoped to
`src/**/*.{ts,tsx}`: one matches a function-valued property inside a
`StyleSheet.create(...)` call directly, and three more match an
Identifier-valued top-level style key across the factory shapes this project
uses — an arrow-function factory with an implicit-return object body, an
arrow-function or `function` factory with a block body and an explicit
`return`, and a plain object literal passed directly. The identifier rules
exist because Unistyles classifies a style as dynamic by `typeof value ===
'function'` at runtime, not by AST shape, so `root: dynamicRoot` carries the
identical hazard as `root: (x) => ({ ... })` while being invisible to a rule
that only looks for a function written inline. Each identifier selector is
anchored with a direct-child chain from the top-level object down to the
property, not a descendant search, so it does not also flag an
Identifier-valued property nested *inside* a style's own value —
`height: BUTTON_HEIGHT` is a legitimate, common pattern elsewhere in this
codebase and must keep passing. No plugin was added for any of this: ESLint's
own `no-restricted-syntax` selector syntax (an ESQuery expression against the
AST) is expressive enough to name the exact shapes without one.

The fix this rule now forecloses: `tab-bar.tsx`'s themed and inset-derived
properties — `flexDirection`, `alignItems`, `paddingStart`, `paddingEnd`,
`backgroundColor`, `boxShadow` — moved into a plain (non-function)
`StyleSheet.create` entry, whose `uni__dependencies` are then read at create
time like every other style in this codebase, and whose one genuinely
per-render value (`paddingBottom`, from `insets.bottom`, which carries no
theme dependency at all) is applied as a separate style at the call site
instead of living inside the stylesheet. The stylesheet stays a
two-argument `(theme, rt) => ({ ... })` factory — `paddingStart` and
`paddingEnd` still need `rt.insets` — because the hazard is the style being
a function, not the factory being one.

## Alternatives considered

- **Keep the dynamic function and add a plain-object style beside it in the
  same stylesheet.** One style with non-empty dependencies is enough to
  pull the whole sheet into Unistyles' refresh set, so this would have
  worked. Rejected: the fix would then depend on an incidental property of
  an unrelated style, and deleting that style later silently reintroduces
  the bug with nothing to catch it.
- **Change the factory to one argument so the sheet becomes `Themable` and
  is refreshed unconditionally.** Rejected for this specific stylesheet:
  `paddingStart`/`paddingEnd` need `rt.insets`, so the second argument is
  genuinely required. Kept as part of what the rule does NOT forbid — a
  two-argument factory whose styles are all plain values is exactly what
  the fix above produces.
- **A code comment instead of a lint rule.** Rejected: the failing layer is
  native, and neither Jest nor the e2e coverage gate reaches it, so a
  comment is the only thing anyone would have to notice before shipping the
  regression again. A rule that runs in `npm run lint` — and in CI, per
  `expo-merge-checks.yaml`'s `lint` job — is the only mechanism this
  project has that can actually catch the shape returning.

## The cost this accepts

The rule is purely syntactic: it forbids the AST shape, not the underlying
hazard directly, so a future Unistyles version that changes how
`uni__dependencies` gets populated could make this rule wrong in either
direction — too strict, or no longer sufficient — without anything here
noticing. It was verified in both directions against `react-native-unistyles@3.3.0`
specifically: it fails against the pre-fix shape reintroduced in a scratch
file, and passes against the fixed tree.

The rule is also not a value-shape check, and cannot be made one with
`no-restricted-syntax` alone: it forbids a function *literal* and a style key
that is an `Identifier`, but a property whose value is some other expression
that *evaluates* to a function at runtime — a call expression that returns
one (`root: makeRoot()`), a ternary between two functions, a member
expression reading one off an object — is none of those two AST node types
and slips past every selector this rule has. Closing that fully would need a
check that has some notion of what an expression's value actually is, which
is exactly what a `no-restricted-syntax` selector, matching the AST alone,
cannot do. This project accepts that gap for the reason recorded under
"Alternatives considered" above: the mechanism this rule catches today
(`tab-bar.tsx`'s own shape, and the identifier form it was demonstrated to
alias) is the shape this codebase has actually produced. Closing the
remaining gap would mean replacing `no-restricted-syntax` with different
tooling entirely — a custom ESLint rule with type information, or a check
over the compiled output — which is a larger change than this decision
makes; it is named here as a real limitation, not something this rule
already covers.

This does not fix issue #19 (the app not following an OS colour-scheme
change while running) — a separate defect. It also does not, by itself, fix
the *symptom* on a device: that fix is `tab-bar.tsx`'s own restructuring
above, verified from source and by this rule, not by a device run — this
session had no device, emulator, or native toolchain available to retest
the original launch defect directly.
