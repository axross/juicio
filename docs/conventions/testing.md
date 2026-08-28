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
beside `sentry-dsn.ts`. A subject lives under `src/` or under a module's own
`src/`, and `jest.config.js`'s `testMatch` matches both tiers. The runner is
Jest with the `jest-expo` preset, and `npm run test:unit` runs it.

## Native Surfaces

A native surface splits its own testing across three tiers, because no
single runner reaches all of it.

- **The Rust workspace** (`modules/espada-engine/lib/`) is tested on the
  host with `cargo test`, alongside `cargo fmt --check` and `cargo clippy --
  -D warnings` (see [README.md](../../README.md) for the exact invocations).
  None of the three touches a mobile runtime, so they run wherever the Rust
  toolchain is installed; all three also run inside
  `espada-engine-artifacts.yaml`'s `rust-checks` job, but only when that
  workflow is dispatched by hand — not on every pull request or push, since
  nothing in that workflow runs automatically (see
  [native-module-artifacts.md](../operations/native-module-artifacts.md)).
  A regression in the Rust crate is caught the next time someone dispatches
  that workflow, not on the pull request that introduced it; the separate
  `abi-parity` job in `merge-checks.yaml` still catches ABI drift without
  anyone dispatching anything, on every pull request and push to `main` that
  touches `modules/espada-engine/lib/espada-engine/src/ffi.rs` or
  `modules/espada-engine/android/src/main/jniLibs/**` — which is precisely
  when the two sides it compares can come to disagree. It only compares
  exported symbols and invokes no Rust toolchain at all (see README.md's
  Testing table).

  **The three are not all scoped the same way, and the difference is
  deliberate.** `cargo test` runs `--workspace`, so a vendored crate's own
  suite runs here too — that is what catches a truncated file or a botched
  refresh, and it is the only check that would. `cargo fmt --check` and
  `cargo clippy` are scoped to `-p espada-engine`, this project's own crate.
  A vendored copy is not held to this project's lint settings: the only way
  to satisfy a gate it fails is to edit the copy, and an edited copy is no
  longer diffable against upstream. A refresh that trips a lint is fixed
  upstream, not here.
- **The TypeScript wrapper** (`modules/espada-engine/src/`) is a Jest unit
  test, colocated the same way a subject under `src/` is (see
  [Unit Tests](#unit-tests) above). `react-native-nitro-modules` cannot load
  inside a Jest process — there is no Android or iOS runtime behind it there
  — so every wrapper test mocks `NitroModules.createHybridObject` and drives
  the mock's captured callbacks directly, standing in for what the real C++
  layer would otherwise invoke asynchronously from a worker thread (see
  [`espada-job.test.ts`](../../modules/espada-engine/src/espada-job.test.ts)).
- **Everything neither of those reaches** needs a real device or emulator:
  whether the JavaScript thread actually stays responsive while a job runs,
  the measured frame rate against its own idle baseline, whether progress
  events arrive at the rate the C++ layer bounds them to, and whether
  cancelling a job or triggering a Fast Refresh mid-run leaves no worker
  thread behind. `e2e/flows/SCN-008.yaml` drives the Analyze tab's native-job
  demo through Maestro — starting a job, seeing its cancel control and
  progress indicator appear, and seeing it settle — which proves the surface
  is wired end to end. It does not by itself prove the JavaScript thread
  never blocked: a coverage run reports which UI states appeared, not
  whether a frame was ever dropped between them.

`testMatch` in [`jest.config.js`](../../jest.config.js) now also matches
`modules/**/src/**/*.test.{ts,tsx}`, alongside its original
`src/**/*.test.{ts,tsx}`. `modules/espada-engine/src/` is this project's
first test subject that does not live under `src/`; extending the glob, in
place of moving the wrapper's test under `src/` or standing up a second Jest
project for one directory, is what keeps the colocation rule above true for
a subject outside `src/` too.

The glob reaches `modules/*/src/` only, never `modules/*/lib/` — but that is
**not** sufficient to keep Jest out of a module's Rust, and
`jest.config.js` carries a `modulePathIgnorePatterns` entry for
`modules/*/lib/` as well.

Jest's obsolete-snapshot scan walks its haste file map, not `testMatch`. A
vendored Rust crate commits `insta` snapshot fixtures
(`lib/espada-internal/src/**/snapshots/*.snap`), and Jest finds them, claims
all 13 as its own obsolete snapshots on every run, and **deletes them** on
`npm run test:unit -- -u` — taking the expectations the 1260-test Rust suite
asserts against with them. That was reproduced against this repository, not
theorised, which is why the entry exists and why it must not be removed as
redundant with the `testMatch` glob. `testPathIgnorePatterns` would not
substitute for it: that filters test discovery only.

This is a correctness guard, not a performance one, and it is the only
JavaScript-tooling exclusion this project's native modules need. Cargo's
`target/` output is left visible to every runner deliberately — excluding it
was measured and bought nothing — so the `modules/*/lib/` entry here earns
its place solely by stopping `-u` from deleting committed files. It also
cannot be driven from `.gitignore`: the fixtures are committed, and Jest
reads no ignore file of its own.

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
workflow that runs this project's checks on every pull request and on every
push to the default branch. Which jobs it runs, and which command each one
runs, is [README.md](../../README.md)'s to state: it holds the authoritative
table of this project's commands. This document used to restate that list,
and the restatement went stale the first time the list gained a job — so it
now points there instead of keeping a second copy.

What belongs here is what CI's coverage means for testing. The
scenario-coverage gate — every catalogued scenario in `e2e/scenarios.md`
having a matching flow file — does run in CI. Maestro itself does not:
`npm run test:e2e` runs the coverage check and then `maestro test e2e/flows`,
and only the coverage-check half has a CI job. Running the flows against a
real device or emulator stays the author's responsibility to do locally
before relying on a change.
