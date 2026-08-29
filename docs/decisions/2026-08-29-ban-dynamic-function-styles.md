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

A Unistyles style value under `src/` MUST NOT itself be a function.
`eslint.config.js` enforces this with a `no-restricted-syntax` rule matching
any function-valued property inside a `StyleSheet.create(...)` call,
scoped to `src/**/*.{ts,tsx}`. No plugin was added for it: ESLint's own
`no-restricted-syntax` selector syntax (an ESQuery expression against the
AST) is expressive enough to name the exact shape without one.

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

This does not fix issue #19 (the app not following an OS colour-scheme
change while running) — a separate defect. It also does not, by itself, fix
the *symptom* on a device: that fix is `tab-bar.tsx`'s own restructuring
above, verified from source and by this rule, not by a device run — this
session had no device, emulator, or native toolchain available to retest
the original launch defect directly.
