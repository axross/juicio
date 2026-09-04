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

`@testing-library/react-native` (with `react-test-renderer`, its peer at the
version this project pins) is installed for rendering a React component
under test. A component test — `<name>.test.tsx` — is colocated the same way any
other unit test is, per the paragraph above; there is no separate directory
or naming rule for one. Component tests exist now — the card/range input
sheet's own (`src/features/hand-ranges/ui/**/*.test.tsx` and the panes it
composes, `src/shared/ui/**/*.test.tsx`) are the first — so this is no
longer a bare adoption with nothing written against it.

**`render()` and `fireEvent` are synchronous at the RNTL version this
project pins.** Existing tests here still write `await render(...)` and
`await fireEvent.press(...)`; awaiting a non-promise is harmless, and the
form is kept so the suite does not have to change again if the library's
async variants are adopted later. What it does mean is that a render-phase
throw propagates out of the `render()` call itself rather than surfacing as
a rejection, so assert one with `expect(() => render(...)).toThrow(...)` —
`rejects.toThrow` never fires and the test passes vacuously.

This was got wrong once already: a version of this document written against
RNTL 14 stated the opposite, and the portal test written from it asserted
`rejects.toThrow`, which silently stopped proving anything when the branch
merged onto the pinned version.

A component test needs a side-effect import of `@/core/theme/unistyles`
before anything themed renders, so this project's real themes are
registered against the mocked `StyleSheet` (see below) rather than
whatever unconfigured default Unistyles would otherwise fall back to; every
component test colocated so far starts with that import for exactly this
reason. `jest.config.js` carries `setupFiles: ['react-native-unistyles/mocks']`
for this same surface: without it, mounting anything that calls
`StyleSheet.create` throws outside a real native environment.

**`react-native-unistyles/mocks` strips every `variants` block from a
`StyleSheet.create` result and no-ops `useVariants`.** A variant's own
resolved colour or style is therefore not observable from a component test
— asserting that a selected cell "is lime," for instance, cannot be done by
reading a rendered colour. Assert `accessibilityState` (`selected`,
`disabled`, and the rest) and testIDs instead; that is what every component
test in this repository does today for a variant-dependent visual state.

**Gestures are drivable, through `react-native-gesture-handler/jest-utils`**
— `fireGestureHandler`, `getByGestureTestId`, and a gesture's own
`.withTestId()` to make it findable — and this repository's grid and
card-fan gesture tests already use them (see
`src/shared/ui/selection-grid/selection-grid.test.tsx` and
`src/shared/ui/cards-pane/cards-pane.test.tsx`). What this proves and
does not prove is worth being precise about: `fireGestureHandler` injects a
synthetic sequence of gesture-handler state transitions (`BEGAN`, `UPDATE`,
`END`, and so on) at coordinates the test chooses, and asserts what the
component's own JS-thread callbacks did in response. It does **not** prove
that a real touch on a real device resolves to the same state sequence —
whether the native recognizer actually begins, updates, and ends a gesture
the way the test's synthetic sequence assumes stays something only a real
device confirms.

**No unit or component test in this project can catch a layout or
visual-regression defect.** RNTL renders without a layout engine — `onLayout`
never fires on its own, no component's measured size is ever real, and
nothing here can tell a correctly-proportioned screen from one whose content
overflows or overlaps. Combined with the `variants`-stripping above, a test
cannot observe either half of "does this look right": not a real measured
geometry, and not a variant-driven visual state. This is exactly what let
the rank-pair grid's runaway-height bug (13 columns, each stretched to many
times the screen, discovered on a real device — see
`src/shared/ui/selection-grid/selection-grid.tsx`'s `GestureContext` doc
comment) reach a device with the full suite green: the sizing arithmetic
that produced it had no test exercising it at all.

A synthetic `onLayout` event, fired by hand at a chosen width and height
(`fireEvent(el, 'layout', { nativeEvent: { layout: {...} } })`), closes part
of that gap — it can pin down sizing **arithmetic**, asserting that a given
measured width resolves to the style values the component computes from it
(`selection-grid.test.tsx`'s own regression tests for that bug do exactly
this). What it does not, and cannot, prove is that the width and height it
supplies are what a real device would actually measure for that layout, or
that the computed style, once real Yoga layout and native rendering run
against it, produces the on-screen result the numbers suggest. Real measured
geometry — whether a screen actually renders within its bounds, whether an
element actually stretches, clips, or overlaps another — rests entirely on
the manual device check.

## What a Unit Test Asserts About a Third-Party Library

**A unit test asserts that this project uses a library's API correctly; it
asserts nothing about what that library then produces.** The configuration
handed to a library — its data, its options, the callbacks it is given, the
colours and sizes passed to it — is this project's own work, and a test MAY
assert any of it. What the library draws, renders, or computes from that
configuration is the library's own work, already tested where it is
maintained: asserting it a second time here tests someone else's code twice,
and under a runner that has replaced the library with a stand-in it proves
nothing at all, because the only thing such an assertion can observe is what
the stand-in was written to return. Either way it restates the
implementation in a second file, where it agrees with a mistake as readily
as with a correct value.

**A test MUST NOT introduce a platform primitive whose purpose is to make
something the library draws assertable.** A border on a React Native view,
standing in for a rule the library would otherwise have painted, is on the
drawing side of this line rather than the API side — the assertion reads
back a value the same change wrote, and the rule it claims to be about is
still unobserved. This is not hypothetical: the Equity Breakdown chart's
two axis rules and its axis labels were built out of React Native borders
and `Text` for exactly that reason, and both came back out
([specs/equity-analysis.md](../specs/equity-analysis.md)) once the rule
above was settled.

Where a library is mocked wholesale — `@shopify/react-native-skia` is, at
the primitives it exports (`Canvas`, `Line`, `Rect`, `Text`, `useFont`), in
both
[`bar-chart.test.tsx`](../../src/features/evaluations/ui/equity-breakdown-chart/bar-chart.test.tsx)
and
[`equity-breakdown-chart.test.tsx`](../../src/features/evaluations/ui/equity-breakdown-chart/equity-breakdown-chart.test.tsx)
— the props the mock captured are the subject a test reads. A callback among
them is a plain function this project wrote: call it directly and assert
what it returns. `./bar-chart.tsx`'s own `BarChart` is **not** an instance of
this: it is this project's own component, with a reachable rendered
observable under `jest-expo`, so both suites render it for real over that
one mocked boundary — `bar-chart.test.tsx` directly, and
`equity-breakdown-chart.test.tsx` transitively, since `BarChart` is
`EquityBreakdownChart`'s own child — and read its own `<Rect>`/`<Line>`/
`<Text>` calls back, never a captured `BarChart` prop.

**This is a narrower permission than it looks, and it sits against a rule
the installed [`unit-testing`](../../.claude/skills/unit-testing/SKILL.md)
capability states.** That capability says not to mock a third-party
dependency merely to inspect the arguments handed to it, and to reach a
component's behaviour through its rendered output instead — sound advice
wherever rendered output exists. Here it does not: `@shopify/react-native-skia`
runs no rendered output at all under `jest-expo`, so there is no rendered
output to reach for it, and the configuration handed to it is the only
observable this project authored. That capability's own guidance defers to a
project's component and UI conventions for a component rather than a pure
helper, and this section is that convention. A change MUST NOT read it
wider: where a rendered observable does exist — `BarChart`'s own case — that
capability's rule holds and this one does not apply.

What this leaves uncovered is real and MUST be reported as such rather than
quietly absorbed. Whether Skia draws what its configuration asks for
reaches only the manual device check, on the same footing as the layout and
visual-regression gap [Unit Tests](#unit-tests) above already describes.

## Database-Backed Tests

A test that touches the database MUST run against the in-memory database
registered globally in [`jest.setup.ts`](../../jest.setup.ts)
(`jest.mock('@/core/db/client')`, backed by
[`src/core/db/__mocks__/client.ts`](../../src/core/db/__mocks__/client.ts)). A
test needs no opt-in for this: importing `@/core/db/client`, directly or
transitively, is enough. It is a real SQLite database running this project's
own committed migrations — not a stub — so a test observes the same
constraints, defaults, and column set a device would.

The Drizzle client's own methods (`db.select`, `db.insert`, and the rest) MUST
NOT be stubbed. A service, hook, or component backed by the database is
exercised through real query behavior, the same way it runs on a device.

Pre-existing state a test needs MUST be seeded through Drizzle primitives —
`db.insert(...).run()` and the like — never by calling the unit under test or
a sibling that shares its own write path. A seed that goes through the same
code the assertion is meant to verify carries whatever defect that code has
into the seed, and the assertion passes vacuously against state the defect
already produced correctly.

A test file that writes to the database MUST truncate what it wrote in an
`afterEach`, scoped to only the tables that file writes to — never every
table, and never a `beforeEach` reset that would hide a leftover row a
previous test failed to clean up.

Isolation between test files needs no cleanup step of its own: it is
structural, not a rule this project enforces. Jest gives each test file its
own module registry, so each file that imports the mocked client gets its own
private `:memory:` database that no other test file can see or write to —
there is nothing shared to wipe on open.

## Native Surfaces

A native surface splits its own testing across three tiers, because no
single runner reaches all of it.

- **The two Rust crates** (`modules/espada-engine/lib/espada-engine/` and
  `modules/espada-engine/lib/espada-internal/`, no longer one Cargo workspace
  over both — see
  [decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md](../decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md))
  are each tested on the host with `cargo test`, alongside `cargo fmt --check`
  and `cargo clippy --all-targets -- -D warnings` (see
  [README.md](../../README.md) for the exact invocations). None of the three
  touches a mobile runtime, so they run wherever the Rust toolchain is
  installed; all three also run, against both crates' own manifests, inside
  `rust-merge-checks.yaml`'s `lint` and `test` jobs, on every pull request and
  push to `main` whose diff touches either crate — the `changes` job's `rust`
  filter names both `modules/espada-engine/lib/espada-engine/**` and
  `modules/espada-engine/lib/espada-internal/**`, so a regression in either
  one is caught on the pull request that introduced it.

  **Nothing checks the committed Android `.so` against the crate's FFI
  source files on a pull request.** An `abi-parity` job in
  `merge-checks.yaml` used to compare the two on every pull request and
  push to `main` touching either side; it was removed and nothing replaced
  it. The comparison survives only against a *freshly built* binary, inside
  `espada-engine-artifacts.yaml`'s `build-android` job, which runs only on
  a manual dispatch. So the committed `.so` and every `.rs` file directly
  under `modules/espada-engine/lib/espada-engine/src/` can drift apart and
  stay that way until someone dispatches that workflow.

  **Both crates are held to the same three checks now, and that is a change
  from before.** `espada-internal` used to be a verbatim copy of
  `axross/espada`, so `cargo fmt --check` and `cargo clippy` ran scoped away
  from it: the only way to satisfy a gate the copy failed was to edit the
  copy, and an edited copy was no longer diffable against upstream. It is a
  fork maintained in this repository now, so that reason is gone, and all six
  invocations — format, lint and test, once per crate — run the same way any
  other crate here would be checked.
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
forked Rust crate commits `insta` snapshot fixtures
(`lib/espada-internal/src/**/snapshots/*.snap`), and Jest finds them, claims
all 10 as its own obsolete snapshots on every run, and **deletes them** on
`npm run test:unit -- -u` — taking the expectations the 1267-test Rust suite
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

[`expo-merge-checks.yaml`](../../.github/workflows/expo-merge-checks.yaml),
[`rust-merge-checks.yaml`](../../.github/workflows/rust-merge-checks.yaml),
and [`docs-merge-checks.yaml`](../../.github/workflows/docs-merge-checks.yaml)
are the three workflows that run this project's checks on every pull request
and on every push to the default branch. Which jobs each one runs, and which
command each one runs, is [README.md](../../README.md)'s to state: it holds
the authoritative table of this project's commands. This document used to
restate that list, and the restatement went stale the first time the list
gained a job — so it now points there instead of keeping a second copy.

What belongs here is what CI's coverage means for testing. The
scenario-coverage gate — every catalogued scenario in `e2e/scenarios.md`
having a matching flow file — does run in CI. Maestro itself does not:
`npm run test:e2e` runs the coverage check and then `maestro test e2e/flows`,
and only the coverage-check half has a CI job. Running the flows against a
real device or emulator stays the author's responsibility to do locally
before relying on a change.
