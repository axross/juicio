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
├── features/             # one directory per feature (none exist yet — see below)
│   └── <feature>/
│       ├── model/        # domain types and pure logic
│       ├── usecase/      # the operations over the model
│       ├── adapter/      # persistence and React bindings
│       └── ui/           # components
├── shared/                # modules more than one feature imports (none exist yet)
└── core/                  # feature-agnostic infrastructure: db, theme, instrumentation
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
`theme/` (Unistyles themes and tokens), and `instrumentation/` (Sentry setup).
Everything there is infrastructure with no product meaning of its own — it
would look the same in an app about something other than poker.

`core/` MUST NOT hold feature-specific domain logic or business rules. A type
or a function that means something only in terms of hands, sessions, or
players belongs in the feature's own `model/`, not in `core/`, however
tempting it is to reach for the always-imported directory.

## `features/` and `shared/` Do Not Exist Yet

Neither directory is scaffolded, because nothing has needed either one: the
tree so far is `app/` and `core/` only. The first feature creates its own
`features/<feature>/` directory when it is written, rather than a scaffold
pre-creating empty tier directories nothing populates yet. The same restraint
applies to `shared/`: it earns a module only once two features need the same
*behavior*, never merely the same shape — promoting something there in
anticipation of a second caller is a directory every feature pays to consider
before it has bought anything.

## Naming

A file is named for what it holds, in kebab-case — `use-database-migrations.ts`,
`sentry-dsn.ts` — and so is a feature directory, named for the feature itself.

## The Package Entry

[`main.ts`](../../main.ts) is `package.json`'s `main` — the module that runs
before the router mounts and before any component renders. It lives at the
repository root, beside the other files tooling reads by a root-relative
default (`metro.config.js`, `app.config.ts`), rather than under `src/`. It
imports `expo-router/entry` first and then runs `initSentry()` — the only
thing this project currently needs to happen before the first render — per
the entry-module placement the `sentry-instrumentation` and
`expo-app-development` skills require.
