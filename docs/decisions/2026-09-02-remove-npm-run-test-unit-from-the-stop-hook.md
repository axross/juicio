---
status: accepted
---

# Remove `npm run test:unit` From the Stop Hook

[`check.sh`](../../.claude/hooks/check.sh), the project's opt-in `Stop` hook,
ran `npm run test:unit` alongside `npm run lint` before letting a session
report a code change as finished. That run has been removed; only `npm run
lint` runs there now.

The motivation is the upstream skills library's own cost analysis
([axross/skills#506](https://github.com/axross/skills/issues/506)), which
measured the equivalent `Stop`-hook test run firing **234 times over 30
days**, at **≈$65 (1.8%)** of that library's own session cost. That figure is
cited as the reason this kind of check is worth reconsidering, not as a
prediction of what removing it saves in this repository — this project has
run no comparable measurement of its own `Stop`-hook fires.

The underlying criterion, recorded in
[docs/operations/agent-sessions.md](../operations/agent-sessions.md), is
that a blocking `Stop` check is expensive in a way a mechanical
`PostToolUse` repair is not: it fires only after the agent believes the task
is finished, so a failure there costs a full main turn. A lint violation
`eslint --fix` cannot repair still belongs at `Stop` — the fix is an
authoring decision only that turn can make. A unit-test failure is not that:
running the suite again does not turn a red test green, so keeping it on
`Stop` bought no repair the way keeping an unrepairable lint rule there does
— it only moved the same failure earlier by one turn, at the cost of paying
for that turn on every run, clean or not.

## What this trades away

Unit-test failures are now caught by CI — Expo Merge Checks' `test` job,
gated on that workflow's `changes` job's `test` filter — rather than before
the agent stops. A session can therefore finish and report a code change as
done while a unit test it touched is still failing, with the failure
surfacing only once a pull request exists and that job runs. Nothing in this
project's local hooks catches that case any more; the person reviewing the
pull request, or the CI run itself, is what catches it now.
