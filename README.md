# juicio

An app that helps with playing Texas hold'em poker and reviewing that play
afterwards. juicio runs on Android and iOS as an Expo mobile app: it stores
hand and session data on-device and is meant to help a player look back at
how a session actually went, rather than to run the game itself.

It is early. The app opens on a four-tab shell — Analyze, History, Presets,
Settings — of which Settings is the only one with real content: language,
theme, and build information, each of them working rather than merely
drawn. Analyze renders its board and its empty state — five dashed card
slots and a `Players` heading above a shark illustration and an inert
`New Player` button, all drawn but not wired to anything yet — and History
renders its own empty state. Presets renders no content of its own yet;
what's on screen there is a temporary demo proving a native module runs its
work off the JS thread. The equity engine that a populated board and the
players list are waiting on does not exist yet.

## Getting started

Running the app at all needs a native toolchain — `expo-dev-client` is
adopted throughout this project (see
[decisions/2026-08-26-adopt-expo-dev-client-and-retire-expo-go-now.md](./docs/decisions/2026-08-26-adopt-expo-dev-client-and-retire-expo-go-now.md)),
deliberately raising the barrier to contributing rather than leaving that to
be discovered later.

Prerequisites:

- **Node**, the major version declared in [`package.json`](./package.json)'s
  `engines` field (24), and npm at the major it also declares there (11).
- **A `.env.local`**, seeded from [`.env.example`](./.env.example) — every
  entry in it is optional and the app runs fine with it empty; it only
  carries `EXPO_PUBLIC_SENTRY_DSN` today.
- **The Android SDK and a JDK.** These are no longer optional: step 3 below
  needs them to produce the development build every later step runs against.
  [`.github/actions/setup-android-toolchain`](./.github/actions/setup-android-toolchain/action.yml)
  names the exact versions CI provisions (Temurin 17, `android-actions/setup-android`).
  Every native Android build — this local one included, not only the CI
  preview build — is restricted to the `arm64-v8a` ABI (see
  [docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)),
  so an **x86_64 emulator cannot install it**; use a physical device or an
  arm64 emulator image.
- **A Mac with Xcode**, only if you want to build or run on iOS — step 3
  below needs it on that platform. There is no way around this: Xcode and the
  iOS simulator are macOS-only, and CI's own iOS preview build
  ([`ios-preview.yaml`](./.github/workflows/ios-preview.yaml)) needs a macOS
  runner for the same reason (see
  [docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)).
- **Nothing extra to rebuild `modules/espada-engine/lib`'s own binaries —
  that happens only in CI.** Steps 1–5 below need no Rust toolchain and no
  local build step to reproduce those: both platforms build against the
  `.so` and `.xcframework` already committed under
  [`modules/espada-engine/`](./modules/espada-engine). Producing those
  binaries (and this module's generated Nitro bindings) is dispatched through
  [`espada-engine-artifacts.yaml`](./.github/workflows/espada-engine-artifacts.yaml)
  — see
  [docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md)
  for what it builds and how it resolves the NDK. **That is not true of the
  NDK itself, though**: any Android build compiles C++ regardless of this
  module — React Native autolinks ten native modules that ship C++ straight
  into `:app`, and `react-native-gesture-handler` builds its own — so
  Gradle fetches NDK `27.1.12297006` on its own to do it, at 2.0 GB on disk.
  This project's own local build in fact fetched a second NDK
  (`27.0.12077973`) as well, for roughly 4 GB in total.

Steps:

1. Install dependencies: `npm install`
2. Copy the environment template: `cp .env.example .env.local`
3. Produce a development build and install it: `npm run android`, or
   `npm run ios` on a Mac with Xcode. Both need the corresponding toolchain
   and a connected device, emulator, or simulator, per the prerequisites
   above. This comes before starting the dev server, because the dev server
   targets a development build that has to already exist.
4. Start the dev server: `npm run dev` — it connects to the development
   build step 3 installed; press `a` or `i` in the terminal to relaunch it
   there. No `--dev-client` flag is needed: with `expo-dev-client`
   installed, `expo start` targets a development build automatically.
5. Produce a distributable JS bundle: `npm run build`. It runs a bare `expo
   export`, which exports the Android and iOS bundles only — `app.json`
   declares `platforms: ["android", "ios"]`, which is the set `expo export`
   defaults to when no `--platform` flag is given. Web is not a target of
   this project and carries no `web` block in `app.json`.

## Development workflow

Development in this repository is agent-assisted via
[Claude Code](https://claude.com/claude-code). The working agreement lives in
[`AGENTS.md`](./AGENTS.md) (loaded through `CLAUDE.md`), which routes to the
installed skills under [`.claude/skills/`](./.claude/skills) and to this
project's own documents under [`docs/`](./docs/index.md). Human and agent
contributors follow the same loop.

### The change loop

Every change — code or document, one line or one feature — goes through the
`loop-engineering` skill: **plan → approve → code → verify → independent review
→ address → ready**.

There is no command to type. The skill is model-invoked, so naming the work is
what starts it: *"deliver issue #42"*, *"pick up PR 57"*, or a description of a
change with no issue behind it yet. To carry on after it stops, continue the
session and tell it to.

1. **Plan** — reads the issue and its thread, asks you the product and scope
   questions the spec leaves open, and rewrites the issue body into a
   reviewable plan with acceptance criteria. It then **always stops for your
   approval**: nothing gets built until you review the plan and resume.
2. **Code + verify** — implements the approved plan on an agent-namespaced
   branch (on a separate worktree when it shares your working copy, so it never
   blocks you), runs the checks the changed surface requires, and self-reviews
   the diff. Implementation runs in the `implementer` subagent where the
   harness allows one.
3. **Independent review** — opens a draft pull request and requests the CI
   reviewer, a separate session under a separate identity, so the code's author
   never certifies its own work.
4. **Address** — fixes review findings and CI failures, tying each resolved
   thread to the resolving commit, for a capped number of rounds.
5. **Ready** — flips the pull request to ready once CI is green and the review
   is clean. Merging always stays a human decision.

[docs/operations/development-workflow.md](./docs/operations/development-workflow.md)
holds this project's own part: the branch prefix, what audits the loop from
outside a session, and how the review is requested.

### Get review findings on any PR

Post the review trigger phrase as a top-level comment on a pull request to
run this repository's review policy ([`REVIEW.md`](./REVIEW.md)) — severity-tagged
findings with `file:line` evidence and concrete fixes, posted as inline
comments by the CI reviewer ([`claude-review.yaml`](./.github/workflows/claude-review.yaml),
which names the phrase). Use it for a pre-merge check on a hand-written
change or a second opinion before merging; it is the same reviewer the
change loop requests for itself. Write the phrase in that one comment only —
a comment-triggered workflow matches it anywhere in a comment body, so a
second mention elsewhere fires a duplicate review.

The reviewer needs a one-time operator setup before it runs — the
[Claude GitHub App](https://github.com/apps/claude) installed, plus a
`CLAUDE_CODE_OAUTH_TOKEN` repository secret (`claude setup-token`) or an
`ANTHROPIC_API_KEY` for pay-as-you-go billing — and until then it silently
no-ops rather than failing. See `claude-review.yaml`'s header comment for the
exact steps.

### Preview environments — dispatch a signed build for any PR

A maintainer can dispatch a signed Android or iOS preview build for any pull
request from the repository's **Actions** tab — run the **Android Preview**
or **iOS Preview** workflow and give it the pull request's number — and get
it distributed through Firebase App Distribution, with an install link
posted as a fresh comment on the pull request (recording the deployed
commit). No per-PR web preview, since this project has no web deployment
target. Neither workflow runs automatically on a pull request; both are
manual, because an iOS build runs on a macOS runner that bills at roughly
10x a Linux one, and the manual trigger is what keeps that cost bounded.
Each pipeline is inert until its own signing and distribution secrets are
configured; see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)
for the stages, the preflight gate, and every secret and variable each
pipeline needs.

Changes made without an agent follow the same bar: branch, implement, run the
checks below, open a pull request, and get it reviewed before merge.

## Testing

Unit tests (Jest) cover isolated logic close to what it tests; end-to-end
tests (Maestro) drive the running app through a real user journey. Lint,
type-check, unit tests, and the e2e scenario-coverage gate each run in
[`expo-merge-checks.yaml`](./.github/workflows/expo-merge-checks.yaml) on
every pull request — but, per the table's own "Runs in CI" column, only when
the change touches the paths that workflow's `changes` job cares about; see
[the decision record on gating jobs this way](./docs/decisions/2026-08-28-scope-ci-jobs-by-job-level-if-not-workflow-paths-filters.md)
for why a job-level `if:` is used instead of a workflow-level `paths:`
filter, and
[the decision record on the three-workflow split](./docs/decisions/2026-08-28-split-merge-checks-into-three-domain-workflows.md)
for why that same scheme is now replicated across
[`expo-merge-checks.yaml`](./.github/workflows/expo-merge-checks.yaml),
[`rust-merge-checks.yaml`](./.github/workflows/rust-merge-checks.yaml), and
[`docs-merge-checks.yaml`](./.github/workflows/docs-merge-checks.yaml) rather
than collapsed into one workflow-level `paths:` filter. **Maestro itself does
not run in CI** — only the coverage check
that every catalogued scenario in [`e2e/scenarios.md`](./e2e/scenarios.md)
has a matching flow file does; running the flows against a real device or
emulator stays the author's responsibility to do locally before relying on a
change. See [docs/conventions/testing.md](./docs/conventions/testing.md) for
where a test lives and what the scenario catalog owes the suite.

| Check | Command | Runs in CI |
| ----- | ------- | ---------- |
| Format | `npm run format` | no |
| Lint | `npm run lint` | yes — when Expo Merge Checks' `changes` job's `lint` filter matches |
| Type-check | `npm run typecheck` | yes — when Expo Merge Checks' `changes` job's `typecheck` filter matches |
| Unit tests | `npm run test:unit` | yes — when Expo Merge Checks' `changes` job's `test` filter matches |
| E2E scenario coverage | `npm run test:e2e:coverage` | yes — when Expo Merge Checks' `changes` job's `e2e-coverage` filter matches, which includes the checker script this command runs |
| E2E tests (coverage check + Maestro) | `npm run test:e2e` | no — Maestro half only runs locally |
| Documentation validators | `for f in .claude/skills/living-project-documentation/scripts/check-*.mjs; do node "$f"; done` | yes — when Docs Merge Checks' `changes` job's `docs` filter matches, which includes the five validators this command runs |
| Relative-link integrity | `node .claude/skills/agent-skill-authoring/scripts/check-links.mjs .claude README.md AGENTS.md REVIEW.md` | yes — when Docs Merge Checks' `changes` job's `links` filter matches |
| Rust format check (`espada-engine`) | `cargo fmt --check --manifest-path modules/espada-engine/lib/espada-engine/Cargo.toml` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `lint` job |
| Rust lint (`espada-engine`) | `cargo clippy --all-targets --manifest-path modules/espada-engine/lib/espada-engine/Cargo.toml -- -D warnings` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `lint` job |
| Rust unit tests (`espada-engine`) | `cargo test --manifest-path modules/espada-engine/lib/espada-engine/Cargo.toml` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `test` job |
| Rust format check (`espada-internal`) | `cargo fmt --check --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `lint` job |
| Rust lint (`espada-internal`) | `cargo clippy --all-targets --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml -- -D warnings` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `lint` job |
| Rust unit tests (`espada-internal`) | `cargo test --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | yes — when Rust Merge Checks' `changes` job's `rust` filter matches, in its `test` job |
| Rust benchmarks (`espada-internal`) | `cargo bench --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | no — Rust Merge Checks' `lint` and `test` jobs run the six Cargo commands above and nothing else |
| Rust snapshot review (`espada-internal`) | `cargo insta test --review --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | no — it is interactive; `cargo test` is what asserts the snapshots in CI |
| Rust coverage (`espada-internal`) | `cargo llvm-cov --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | no — nothing in this project's merge-check workflows measures coverage |
| Rust example end to end (`espada-internal`) | `cargo run --release --example multi-thread --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml -- Qs8d2h JJ+ A2s+` | no — run by hand to exercise the equity evaluator end to end |
| Native Android compile | `npx expo prebuild --platform android --no-install && cd android && ./gradlew --no-daemon assembleDebug --stacktrace` | yes — only when `espada-engine-artifacts.yaml` is dispatched by hand |
| iOS native compile (unsigned) | `npx expo prebuild --platform ios --no-install && cd ios && pod install && cd .. && xcodebuild build -workspace <resolved .xcworkspace> -scheme <its basename> -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO` | yes — only when `espada-engine-artifacts.yaml` is dispatched by hand |

That is every check this project's three merge-check workflows run — Expo
Merge Checks' `changes`, `lint`, `typecheck`, `test`, and `e2e-coverage`;
Rust Merge Checks' `changes`, `lint`, and `test`; and Docs Merge Checks'
`changes`, `docs`, and `links` — plus every row above marked `no`, which runs
locally rather than in CI. Every job but each workflow's own `changes`
declares `needs: changes` and an `if:` reading one boolean output that
workflow's own `changes` job computes with `dorny/paths-filter`, so a job
whose own paths did not change does no work and reaches a `skipped`
conclusion — one of the three statuses GitHub counts as successful — which
still appears in the pull request's checks list, rendered as its own grey
"This check was skipped" rather than as a green tick. No job carries a
condition of its own outside that scheme; see the
[decision record](./docs/decisions/2026-08-28-scope-ci-jobs-by-job-level-if-not-workflow-paths-filters.md)
for why the scoping is done with a job-level `if:` at all, and
[the decision record on the three-workflow split](./docs/decisions/2026-08-28-split-merge-checks-into-three-domain-workflows.md)
for why each of the three workflows carries its own `changes` job rather than
sharing one.

Nothing guards any of the three `changes` jobs against failing. If one does
fail, every dependent job in that workflow lands as `skipped` and the only
red entry in that workflow's run is `changes` itself, so that run is red but
no entry in it reports on the change. That is an accepted property rather
than an oversight — the same decision record explains why.

None of these three workflows' jobs compile the native project on either
platform. Rust Merge Checks' `lint` and `test` jobs together run the six
Cargo commands above, with no NDK and no Xcode either way — `lint` on
`ubuntu-slim`, `test` on `ubuntu-latest` — whenever its `changes` job's
`rust` filter matches. Rebuilding the native Rust library
does not run locally at all, and neither does compiling against it: producing
`modules/espada-engine/`'s committed binaries and generated bindings, and
proving each one builds against a real Android and iOS toolchain, all happen
entirely in
[`espada-engine-artifacts.yaml`](./.github/workflows/espada-engine-artifacts.yaml),
a separate, manually dispatched workflow — see
[docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md).
Its `verify-android` and `verify-ios` jobs run the Native Android compile row
and the iOS native compile row above, and both gate that workflow's own
`open-pull-request` job: no binary is committed until it has been shown to
build and to link on both platforms.

**That guarantee is weaker than it was.** The three Cargo commands used to
run in that workflow too, gating the same `open-pull-request` job, so no
binary reached a commit until it had also passed format, lint, and tests.
They now run only in Rust Merge Checks' `lint` and `test` jobs, on a pull
request. Because `espada-engine-artifacts.yaml` can be dispatched against any
ref, a dispatch against a branch whose Rust never went through such a pull
request commits binaries no Cargo command has vetted.

**Nothing in these merge-check workflows looks at `modules/espada-engine/`'s
committed artifacts any more.** Three jobs used to, and all three were
removed with nothing replacing them:

- `nitrogen-drift` regenerated `modules/espada-engine`'s Nitrogen output from
  its `.nitro.ts` spec and failed on any diff. Nothing now catches a spec
  change committed without regenerating, or a hand-edit to generated output;
  `modules/espada-engine/nitrogen/generated/**` can sit stale against the
  spec indefinitely. Regenerating locally with
  `npm run nitrogen:espada-engine` before committing is the only thing
  standing in for it, and nothing checks that anyone did.
- `abi-parity` compared, as sorted sets, the `extern "C"` function names
  `ffi.rs` declares against the **committed** Android `.so`'s exported
  dynamic symbols. That comparison is gone for the committed binary. It
  survives only at build time: `espada-engine-artifacts.yaml`'s
  `build-android` job still runs its own `Verify Exported C ABI` step against
  the `.so` it has just built and refuses to upload a mismatch, so a dispatch
  cannot produce a wrong-symbol binary — but between dispatches nothing
  compares what is committed against `ffi.rs`. That is exactly the failure
  this check was added for: the committed binary once kept exporting the old
  `juicio_native_*` names after the C ABI was renamed to `espada_engine_*`,
  and nothing in CI caught it.
- `committed-binaries` failed a pull request that changed
  `modules/espada-engine/android/src/main/jniLibs/**` or
  `modules/espada-engine/ios/EspadaEngine.xcframework/**` outside
  `espada-engine-artifacts.yaml`. A hand-edited committed binary is now
  flagged by nothing.

**Nothing in this repository validates the contents of `.github/` any more.**
There was a `workflows` job that parsed every file under
`.github/workflows/` and `.github/actions/` as YAML; it has been removed, and
no check replaced it. A malformed workflow or composite-action file — a YAML
syntax error, let alone a schema mistake such as an unknown key or a bad
`uses:` reference — passes every check this project has, and surfaces only
when GitHub next tries to run the file.

There are six Cargo commands, split across Rust Merge Checks' `lint` and
`test` jobs now — `lint` runs the two `cargo fmt --check` and two `cargo
clippy` commands, `test` runs the two `cargo test` commands — each scoped to
its own crate's `--manifest-path` — `modules/espada-engine/lib/` no longer
holds one Cargo workspace over both crates, so there is no `--workspace` or
`-p` flag left to scope with. Format and lint cover
`espada-internal` too, because it is a fork maintained in this repository now,
not a copy held away from this project's own lint settings — see
[docs/conventions/testing.md](./docs/conventions/testing.md). This table is
the authoritative list of the project's commands, for human contributors and
agents alike. Run format and lint after every change, and the suites relevant
to the changed surface before opening a pull request; the
`software-development` skill owns why, and [`AGENTS.md`](./AGENTS.md) requires
reading this file before running any of them.

If a required command cannot be run, say so — naming the command, the reason,
and the residual risk — rather than presenting the change as fully verified.

## Tech stack

| Area | Tool |
| ---- | ---- |
| Language | TypeScript |
| App framework / runtime | Expo (SDK 57, expo-router) |
| Package manager | npm |
| Linting & formatting | ESLint / Prettier |
| Validation | Zod |
| Styling & theming | react-native-unistyles |
| Vector graphics | react-native-svg (icons and illustrations, drawn in-tree) |
| Localisation | i18next + react-i18next, defaulting from expo-localization |
| Client state | Zustand |
| Data / content layer | Drizzle ORM over expo-sqlite |
| User settings | AsyncStorage (language and theme only — see the decision record) |
| Development builds | expo-dev-client |
| Error tracking | Sentry (`@sentry/react-native`) |
| Native code | Rust (`modules/espada-engine/lib/`), a C ABI cross-compiled to Android's `.so` and iOS's `.xcframework` (see [docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md)) |
| Poker evaluation | [`axross/espada`](https://github.com/axross/espada), forked as `modules/espada-engine/lib/espada-internal/` and maintained here since (see [decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md](./docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md)) |
| Native bridging | react-native-nitro-modules, with Nitrogen generating the bindings and registration from a `.nitro.ts` spec |
| Unit tests | Jest, with the `jest-expo` preset |
| E2E tests | Maestro, plus a scenario-coverage gate |
| Android + iOS preview distribution | fastlane + Firebase App Distribution (no EAS) |

## Related links

Design file: [Figma](https://www.figma.com/design/vkZzv1l45PBcVi5Wp92Eqg).
This section will hold any other real link (issue tracker, deployment
dashboard, staging URL) once one exists; nothing here is a placeholder.

Every secret and variable this repository's automation reads is inventoried,
by exact name, in [docs/operations/secrets.md](./docs/operations/secrets.md).
