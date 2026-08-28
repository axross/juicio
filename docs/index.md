# Documentation

This project's own documentation, alongside its README. Which body answers
which question: **what does the design specify?** → `specs/`, defined further
in [glossary.md](./glossary.md). **What must a change satisfy?** →
`conventions/`. **How is something run or operated?** → `operations/`.
`decisions/` holds why a constraint exists, for the constraints whose
reasoning cannot be recovered from the code.

Documents under `conventions/` and `operations/` use MUST, MUST NOT, SHOULD,
SHOULD NOT, and MAY as [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html)
describes. A `specs/` document describes rather than instructs, and uses none
of them.

## Specifications

- [specs/equity-analysis.md](./specs/equity-analysis.md) — the board, the
  players, the Analyze screen's states, and the Equity Breakdown sheet.
- [specs/hand-ranges.md](./specs/hand-ranges.md) — hand ranges, presets, the
  preset list and editor, and the card/range input sheet.
- [specs/calculation-history.md](./specs/calculation-history.md) — history
  entries, how they group under a board, and the empty state.
- [specs/settings.md](./specs/settings.md) — language, theme, About, and the
  technical information block.
- [specs/navigation.md](./specs/navigation.md) — the four-tab shell, the nav
  bar, and drill-down destinations.

## Conventions

- [conventions/directory-structure.md](./conventions/directory-structure.md) —
  where a file goes, what it is called, and which module may import which.
- [conventions/testing.md](./conventions/testing.md) — the unit-test and
  end-to-end runners, where a test lives, and what the scenario catalog owes
  the suite.
- [conventions/documentation.md](./conventions/documentation.md) — how this
  project's own documentation is kept true: correcting what a change
  invalidated, making a new document reachable, and the checks a documentation
  change owes.
- [conventions/design-system.md](./conventions/design-system.md) — the
  design's colour, type, spacing, and icon tokens, and its app-wide copy
  conventions.
- [conventions/security.md](./conventions/security.md) — the CI supply-chain
  convention: how a third-party GitHub Action is pinned, why the exposure is
  assessed per job, and the exceptions this project has recorded.

## Operations

- [operations/development-workflow.md](./operations/development-workflow.md) —
  how a change gets from a stated intent to a merged pull request, and what
  holds the loop in place from outside a session.
- [operations/agent-skills.md](./operations/agent-skills.md) — installing and
  refreshing the agent skills, and the register of deviations and gaps.
- [operations/agent-sessions.md](./operations/agent-sessions.md) — how a
  session starts, the hooks that run during one, the subagents it can spawn,
  and its telemetry tagging.
- [operations/preview-deployment.md](./operations/preview-deployment.md) —
  the Android and iOS preview build and Firebase App Distribution pipelines:
  their stages, their preflight gates, and every secret and variable each
  needs.
- [operations/native-module-artifacts.md](./operations/native-module-artifacts.md) —
  how a native module's committed artifacts — its Android and iOS binaries and
  its generated Nitro bindings — are produced and committed: the one workflow
  that produces all three, the NDK version, and the 16 KB page-alignment
  requirement.
- [operations/secrets.md](./operations/secrets.md) — every secret and
  variable this project's automation reads, by exact name: what reads it,
  whether it is required, and what happens while it is absent.
- [operations/design-source.md](./operations/design-source.md) — where the
  design file is, how to read it without being misled by its own frame
  naming, and which frames are authoritative for what.

## Decisions

[decisions/](./decisions) holds every decision this project has recorded,
each as its own dated, append-only file.

For what this project is, how to start it, and the commands it has, see
[`README.md`](../README.md). [`AGENTS.md`](../AGENTS.md) is the working
agreement for agent sessions.
