# Documentation

This project's own documentation, alongside its README. Which body answers
which question: **what must a change satisfy?** → `conventions/`. **How is
something run or operated?** → `operations/`. `docs/` holds no `specs/` yet —
there is no implemented product behaviour here for a spec to describe — and no
`glossary.md` for the same reason; both arrive with the first implemented
feature, seeded from that feature's own vocabulary rather than invented ahead
of it. `decisions/` holds why a constraint exists, for the constraints whose
reasoning cannot be recovered from the code; the log starts empty and gains a
record only from the next decision this project actually makes, never
backfilled to explain something inherited from elsewhere.

Documents under `conventions/` and `operations/` use MUST, MUST NOT, SHOULD,
SHOULD NOT, and MAY as [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html)
describes. A `specs/` document, once one exists, describes rather than
instructs, and uses none of them.

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
  the Android preview build and Firebase App Distribution pipeline: its
  stages, its preflight gate, and every secret and variable it needs.

For what this project is, how to start it, and the commands it has, see
[`README.md`](../README.md). [`AGENTS.md`](../AGENTS.md) is the working
agreement for agent sessions.
