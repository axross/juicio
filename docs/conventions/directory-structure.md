# Directory Structure

Where a file goes in this repository, what it is called, and which module may
import which.

The general discipline — put shared logic at the lowest tier with more than
one caller, name a file for what it holds — belongs to the installed
[`code-maintainability`](../../.claude/skills/code-maintainability/SKILL.md)
capability. What follows is this repository's own tiers and paths, which
nothing outside it could infer.

## The Tree

```text
src/
├── app/                  # expo-router routes: thin entry points that compose feature UI
├── features/             # one directory per feature — see below
│   └── <feature>/
│       ├── model/        # domain types and pure logic
│       ├── usecase/      # the operations over the model
│       ├── adapter/      # persistence and React bindings
│       └── ui/           # components
├── shared/                # modules more than one feature imports — see below
└── core/                  # feature-agnostic infrastructure: db, theme, instrumentation, i18n, navigation, icons
```

## Directory Structure: By Feature

The top level is organized **by feature**, not by technical layer. A change to
one feature — hand history, a new stat, a session note — touches files inside
one `features/<feature>/` directory rather than reaching into a project-wide
`components/`, `hooks/`, and `services/` split across every other feature. The
technical split still exists; it is one level down, inside each feature, not
across the whole tree.

## Business-Logic Structure: Clean Architecture, Model-Based

Inside a feature, the four subdirectories are Clean Architecture layers, and
each one holds one kind of thing:

- **`model/`** — the domain types and the pure logic over them: no I/O, no
  React, no persistence. What a poker hand is, how a pot splits, and the rules
  that follow from those types live here and nowhere else.
- **`usecase/`** — the operations the feature exposes over its model:
  recording a hand, computing a session's result. A use case orchestrates
  `model/` logic and whatever `adapter/` provides; it holds no rendering and no
  storage detail of its own.
- **`adapter/`** — persistence and React bindings: the Drizzle queries backing
  the feature, and the hooks or context that hand a use case's result to `ui/`.
  This is the layer allowed to know that `expo-sqlite` or `react-native-unistyles`
  exists. Client state a feature keeps across screens lives here too, in a
  Zustand store — `zustand` is this project's only client-state library, and a
  store belongs to exactly one feature. No store exists yet, because no feature
  does; the first one that needs shared state creates its own rather than a
  shared store growing a slice per feature.
- **`ui/`** — the components. A component reads from `adapter/` and calls into
  `usecase/`; it does not reach into `model/` directly for anything beyond the
  types it renders.

## Import Direction

Imports run one way: **`app` → `features` → `shared` → `core`**. A module may
import from its own tier and from any tier to its right in that chain; nothing
imports back up it. `app/` may import a feature; a feature may import `shared/`
and `core/`; `shared/` may import `core/`; `core/` imports none of the others.
This is what keeps a change inside `core/` safe to make without reading every
feature that happens to sit above it, and keeps a feature free to change
without another feature noticing.

This direction is enforced by **convention and review**, not by a lint rule —
no import-boundary plugin is installed, so a violation is caught by a reviewer
reading the diff rather than by `npm run lint`.

## What `core/` Is For

`core/` today holds `db/` (the Drizzle schema, client, and migrations),
`theme/` (Unistyles themes and tokens), `instrumentation/` (Sentry setup),
`i18n/` (i18next setup, the translation-key scheme, and the `en`/`ja`
resources), `navigation/` (the shared nav bar and the app's tab bar
chrome), and `icons/` (the in-tree icon set). Everything there is
infrastructure with no product meaning of its own — it would look the same
in an app about something other than poker.

`core/` MUST NOT hold feature-specific domain logic or business rules. A type
or a function that means something only in terms of hands, sessions, or
players belongs in the feature's own `model/`, not in `core/`, however
tempting it is to reach for the always-imported directory.

The test for which side of that line a piece of navigation or presentation
code falls on is not whether it is generic across every possible app —
`core/navigation/`'s tab bar hardcodes this app's own four routes to their
icons and labels, and is no less `core/` material for it — but whether it
carries a *domain* rule, in the sense the paragraph above already fixes: a
type or function that means something only in terms of hands, sessions, or
players. A nav bar rendering whatever title it is handed, and a tab bar
mapping this app's own route names to an icon and a label, are both
navigational chrome with no opinion on poker; neither becomes feature logic
by knowing the app's own screen names, any more than `theme/` becomes
feature logic by knowing this app's own brand colours. That is why both live
in `core/navigation/` rather than under a feature. A component that renders
a specific domain concept instead — a player row, a hand history entry —
belongs in that feature's own `ui/`, even where it looks visually similar to
something in `core/`.

## Native Code

Native code lives outside `src/` entirely, in two top-level directories that
are siblings of it rather than tiers within it:

- **`rust/<crate>/`** — one Cargo crate per Rust crate this project ships.
  `rust/juicio-native/` is the first and, so far, the only one: a standard
  Cargo layout (`Cargo.toml`, `src/`), with its own `Cargo.lock` committed
  because the crate produces binaries this project ships rather than a
  library another crate depends on. It exports a C ABI only, and is built by
  neither `npm run android` nor `npm run ios` directly — see
  [`operations/native-library-build.md`](../operations/native-library-build.md)
  for the workflow and the local script that cross-compile it instead.
- **`modules/<module>/`** — one local Expo module per native module.
  `modules/juicio-native/` is the first. It carries no `package.json` of its
  own — Expo's autolinking discovers a local module by directory name alone
  under `./modules`, its own default `nativeModulesDir` — so it sits outside
  npm's own module resolution entirely. Inside it:
  - **`cpp/`** — the shared C++ that both platforms compile unchanged: a
    Nitro `HybridObject` calling straight into the crate's C ABI. Android's
    CMake target globs this directory in place; iOS's podspec copies it into
    the pod's own directory at evaluation time, because CocoaPods will not
    resolve `source_files` outside the pod's own directory.
  - **`android/`** — the CMake build (`CMakeLists.txt`, `build.gradle`), the
    committed binary at `android/src/main/jniLibs/<abi>/`, and the one
    Kotlin file whose only job is loading the shared library `cpp/` compiles
    into.
  - **`ios/`** — the podspec, the module's own registration entry point, and
    the committed `.xcframework` the podspec's `vendored_frameworks`
    references.
  - **`src/`** — the TypeScript wrapper. This is the only shape app code
    ever imports; nothing outside this directory reaches into `cpp/`,
    `android/`, or `ios/` directly.

**The wrapper and the import direction.** `modules/<module>/src/` sits
outside the `app → features → shared → core` chain stated above, and is
reached the same way anything else outside `src/` is: a `tsconfig.json` path
alias (`@/modules/<module>/*`), the same mechanism `@/assets/*` already uses
for the non-`src/` `assets/` directory — not a `moduleNameMapper` entry of
its own, since `jest-expo`'s own TypeScript-path mapping already reads the
same `tsconfig.json` `paths` map. Nothing about sitting outside the chain
exempts the wrapper from it or gives it a tier of its own: it carries no
domain logic, so it may be imported from anywhere `core/` may be, but by
convention it is reached through a feature's own `adapter/` layer — the
layer already licensed to know that a native library exists, the same way it
already knows that `expo-sqlite` or `react-native-unistyles` does.
`features/analyze/adapter/use-native-job-demo.ts` is the first, and so far
only, import of `@/modules/juicio-native/*`.

## `features/` and `shared/`

The first `features/<feature>/` directory in this repository is
`features/settings/`, holding the language and theme model, its use cases,
its `AsyncStorage` adapter, and its UI — created because Settings was the
first feature written, not scaffolded ahead of it. A feature earns its own
directory the same way: when it is written, not in anticipation of one.

`shared/` holds `shared/ui/empty-state/`, the first module to earn a place
there: Analyze and History both render the same empty-state component —
illustration, heading, description, and an optional action — the same
*behavior*, not merely a visually similar layout. That is the bar a second
candidate has to clear too. Promoting something to `shared/` on the strength
of two features merely looking alike, without both needing the same
behavior, is a directory every feature after it pays to consider before it
has bought anything — the restraint this section existed to state even
before either directory had a tenant.

## Naming

A file is named for what it holds, in kebab-case — `use-database-migrations.ts`,
`sentry-dsn.ts` — and so is a feature directory, named for the feature itself.

## The Package Entry

[`main.ts`](../../src/main.ts) is `package.json`'s `main` — the module that
runs before the router mounts and before any component renders. It lives
under `src/`, a sibling of `app/` rather than a file inside it: nothing
resolves it by a root-relative default the way Metro resolves
`metro.config.js` or the Expo config loader resolves `app.config.ts` at the
repository root — `package.json`'s own `main` field names its path
explicitly, wherever that path points, so nothing about running before the
router requires sitting outside `src/`.

`main.ts` imports `expo-router/entry` first, per the installed
`expo-app-development` skill's MUST rule that the router-entry import comes
before any other import or statement with a side effect in the entry module.
After it, the file imports `@/core/theme/unistyles` — a module whose only
content is a call to Unistyles' `StyleSheet.configure` at its own module
scope — and `@/core/instrumentation/sentry-boot` — a module whose only
content is a call to `initSentry()` at its own module scope. Neither module
is imported anywhere else in the codebase.

Their presence in this module, rather than their position relative to
`expo-router/entry`, is what is load-bearing:

- A route module under `src/app/` is never a safe place to call
  `StyleSheet.configure`, however early in that module it is called. Route
  modules are not part of `main.ts`'s own import graph — expo-router
  discovers and evaluates them lazily, through `require.context`, during the
  root navigator's render, walking that context's keys in sorted order.
  `(` (0x28) sorts before `_` (0x5F), so `src/app/(tabs)/_layout.tsx` — and
  everything it imports, down to the themed `StyleSheet.create` in
  `tab-bar-item.tsx` — evaluates before `src/app/_layout.tsx` itself. A
  theme configured from that root layout module, as it once was, crashes on
  launch the moment some other route sorts ahead of it and evaluates first
  (`StyleSheet.create` needs a theme already selected) — which is exactly
  what release `0.1.0-pr-11` shipped (Sentry event `JUICIO-1`). `main.ts` is
  the only place in the whole module graph guaranteed to run before every
  route module — regardless of where within it the import sits — which is
  why `StyleSheet.configure` lives here instead. A future edit that moves
  `@/core/theme/unistyles` into a module under `src/app/` reintroduces the
  same crash, whatever order that module's own imports are in.
- Every import in a module executes, in source order, before any statement
  in that module's own body runs. A call to `initSentry()` placed later in
  `main.ts`'s body therefore still runs after every import above it has
  already resolved — `@/core/i18n`'s own synchronous `i18next.init` and
  `expo-localization` calls included — so a crash during one of those
  imports would go unreported no matter where in the body the call sat.
  Making `initSentry()` fire as an import's own side effect, and keeping
  that import ahead of `@/core/i18n`'s, is what actually moves it earlier; a
  future edit that reorders `sentry-boot`'s import below `@/core/i18n`'s
  reintroduces the same gap silently, with nothing but this paragraph and
  `sentry-boot.ts`'s own comment to catch it.

[`main.test.ts`](../../src/main.test.ts), colocated beside `main.ts` under
`src/` per [testing.md](./testing.md)'s colocation convention, asserts these
invariants directly, since none of them is a type error, a lint violation,
nor a difference format would ever touch: that `expo-router/entry` is
`main.ts`'s first import, that `main.ts` imports
`@/core/theme/unistyles`, that no file under `src/app/` imports it, and that
`@/core/instrumentation/sentry-boot` precedes `@/core/i18n`.
