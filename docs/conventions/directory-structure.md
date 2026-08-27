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

Native code lives outside `src/` entirely, in one top-level directory that is
a sibling of it rather than a tier within it:

- **`modules/<module>/`** — one local Expo module per native module.
  `modules/espada-engine/` is the first. It carries no `package.json` of its
  own — Expo's autolinking discovers a local module by directory name alone
  under `./modules`, its own default `nativeModulesDir` — so it sits outside
  npm's own module resolution entirely.

**Everything belonging to a native module lives inside that module's own
directory**, including its Rust and its Nitro configuration. Those are the
module's internal implementation, not repository-level concerns, and a
second native module later is a sibling directory under `modules/` and
nothing else — no new top-level directory, no shared crate root. Inside it:

  - **`cpp/`** — the hand-written C++ that both platforms compile unchanged:
    a Nitro `HybridObject` subclassing the generated spec base class and
    calling straight into the Rust crate's C ABI.
  - **`nitrogen/generated/`** — what Nitrogen generates from the spec: the
    C++ spec base class, the registration for both platforms, and the
    per-platform autolinking files the podspec, Gradle build and CMake build
    consume. Committed, as Nitro's own documentation prescribes, and never
    hand-edited.
  - **`android/`** — the CMake build (`CMakeLists.txt`, `build.gradle`), the
    committed binary at `android/src/main/jniLibs/<abi>/`, and the one
    Kotlin file whose only job is loading the shared library `cpp/` compiles
    into.
  - **`ios/`** — the committed `.xcframework` the podspec's
    `vendored_frameworks` references. The podspec itself sits at the module
    root, not here, following Nitrogen's own template.
  - **`lib/`** — the Rust, and nothing but the Rust: a Cargo workspace
    (`Cargo.toml`, `Cargo.lock`) over one crate directory per crate, plus
    cargo's own `target/` output. It is built by neither `npm run android`
    nor `npm run ios` directly — see
    [`operations/native-module-artifacts.md`](../operations/native-module-artifacts.md)
    for the workflow that cross-compiles it instead. There is no local
    script: one manually dispatched workflow is the only producer of this
    module's committed artifacts.
  - **`src/`** — the TypeScript, and nothing but the TypeScript: the wrapper
    app code imports, and `src/specs/<module>.nitro.ts`, the spec Nitrogen
    reads. This is the only shape app code ever imports; nothing outside
    this directory reaches into `cpp/`, `android/`, `ios/` or `lib/`
    directly.

**Why `lib/` and `src/` rather than one directory holding both.** One
language per directory is not only tidier — it decides what the JavaScript
tooling has to be told to skip. Jest's `testMatch` reaches
`modules/**/src/**`, so a `target/` under `src/` would sit inside a glob the
runner already walks; under `lib/` it is outside that glob.

The split reduces what has to be excluded; it does not eliminate it, and
assuming otherwise is a mistake this project already made once. Jest still
needs an explicit `modulePathIgnorePatterns` entry for `modules/*/lib/`,
because its obsolete-snapshot scan walks a different traversal than
`testMatch` and will delete a vendored Rust crate's committed snapshot
fixtures — see [testing.md](./testing.md). The rule to draw from that: a
tool's exclusion is settled by running it against a populated `lib/`, never
by reasoning about which of its globs ought to reach there.

`.gitignore` carries the single entry for cargo's `target/`, and it is there
to keep 433 MB of build output out of git — not to make any tool faster. No
tool is configured to skip it for speed, because measurement said there was
nothing to buy: against a populated `target/`, `eslint .` cost +239 ms on
~5.8 s, well inside run-to-run noise; `jest` was marginally *faster* with it
present; a full project walk cost +3 ms. Prettier skips it for free, since
its `--ignore-path` already defaults to `[.gitignore, .prettierignore]`.

The Jest entry is a different thing and must not be read as part of that
budget: it prevents deletion of committed files, and stays regardless of
what any timing says.

**A vendored crate stays a crate of its own.** Where a module depends on a
copy of an external Rust project, the copy is its own crate under `lib/`,
resolved by the crate that uses it as a local path dependency — never merged
into it. `lib/espada-internal/` is the first: a verbatim copy of
`axross/espada`, which `lib/espada-engine/` depends on by path. The boundary
is what keeps the copy diffable against upstream, so a refresh is a re-copy
rather than a merge; the copy's own `PROVENANCE.md` records where it came
from, what was deliberately left out, and the licences that travel with it.
Nothing edits a copied file — a fix belongs upstream, or in the crate that
wraps it.

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
only, import of `@/modules/espada-engine/*`.

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
