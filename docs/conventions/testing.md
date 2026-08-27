# Testing

This project's own testing setup — what runs where, and what a catalogued
scenario owes the suite. What is worth testing at all, how to write a unit
test, and how to write an end-to-end journey are not restated here: the
installed [`unit-testing`](../../.claude/skills/unit-testing/SKILL.md),
[`jest-testing`](../../.claude/skills/jest-testing/SKILL.md), and
[`end-to-end-testing`](../../.claude/skills/end-to-end-testing/SKILL.md)
capabilities own that, and load whenever a task touches a test.

## Unit Tests

A unit test is colocated beside its subject, named `<name>.test.ts` or
`<name>.test.tsx` — for example
[`src/core/instrumentation/sentry-dsn.test.ts`](../../src/core/instrumentation/sentry-dsn.test.ts)
beside `sentry-dsn.ts`. Every subject lives under `src/`, and
`jest.config.js`'s `testMatch` matches that tier. The runner is Jest with the
`jest-expo` preset, and `npm run test:unit` runs it.

## End-to-End Tests

The runner is [Maestro](https://maestro.mobile.dev). A flow lives under
[`e2e/flows/`](../../e2e/flows), named `<id>.yaml` for the scenario it covers —
`e2e/flows/SCN-001.yaml` covers `SCN-001`.

[`e2e/scenarios.md`](../../e2e/scenarios.md) is the scenario catalog: the
source of truth for which user journeys the suite is expected to cover, each
under a stable `SCN-NNN` identifier that never changes once assigned. Every
catalogued scenario MUST have a corresponding flow file, and
[`e2e/check-scenario-coverage.mjs`](../../e2e/check-scenario-coverage.mjs)
enforces it: it fails when a catalogued scenario has no matching flow.

- `npm run test:e2e:coverage` runs the coverage check alone.
- `npm run test:e2e` runs the coverage check and then `maestro test e2e/flows`.

## What Runs in CI

[`merge-checks.yaml`](../../.github/workflows/merge-checks.yaml) is the
workflow that gates merges to the default branch. Which jobs it runs, and
which command each one runs, is [README.md](../../README.md)'s to state: it
holds the authoritative table of this project's commands. This document used
to restate that list, and the restatement went stale the first time the list
gained a job — so it now points there instead of keeping a second copy.

What belongs here is what CI's coverage means for testing. The
scenario-coverage gate — every catalogued scenario in `e2e/scenarios.md`
having a matching flow file — does run in CI. Maestro itself does not:
`npm run test:e2e` runs the coverage check and then `maestro test e2e/flows`,
and only the coverage-check half has a CI job. Running the flows against a
real device or emulator stays the author's responsibility to do locally
before relying on a change.
