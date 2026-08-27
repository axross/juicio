# juicio

An app that helps with playing Texas hold'em poker and reviewing that play
afterwards. juicio runs on Android and iOS as an Expo mobile app: it stores
hand and session data on-device and is meant to help a player look back at
how a session actually went, rather than to run the game itself.

It is early. The app opens on a four-tab shell — Analyze, History, Presets,
Settings — of which only Settings has content: language, theme, and build
information, each of them working rather than merely drawn. Analyze and
History render their empty states, Presets renders nothing, and the equity
engine those three are waiting on does not exist yet.

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
  [`android-preview.yaml`](./.github/workflows/android-preview.yaml) names
  the exact versions CI provisions (Temurin 17, `android-actions/setup-android`).
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
  that happens only in CI.** Steps 1–5 below need no Rust toolchain, no NDK,
  and no local build step: both platforms build against the `.so` and
  `.xcframework` already committed under
  [`modules/espada-engine/`](./modules/espada-engine). Producing those
  binaries (and this module's generated Nitro bindings) is dispatched through
  [`espada-engine-artifacts.yaml`](./.github/workflows/espada-engine-artifacts.yaml)
  — see
  [docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md)
  for what it builds and how it resolves the NDK.

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
tests (Maestro) drive the running app through a real user journey. Format,
lint, type-check, unit tests, and the e2e scenario-coverage gate all run in
[`merge-checks.yaml`](./.github/workflows/merge-checks.yaml) and gate merges
to `main`. **Maestro itself does not run in CI** — only the coverage check
that every catalogued scenario in [`e2e/scenarios.md`](./e2e/scenarios.md)
has a matching flow file does; running the flows against a real device or
emulator stays the author's responsibility to do locally before relying on a
change. See [docs/conventions/testing.md](./docs/conventions/testing.md) for
where a test lives and what the scenario catalog owes the suite.

| Check | Command | Runs in CI |
| ----- | ------- | ---------- |
| Format | `npm run format` | no |
| Lint | `npm run lint` | yes |
| Type-check | `npm run typecheck` | yes |
| Unit tests | `npm run test:unit` | yes |
| E2E scenario coverage | `npm run test:e2e:coverage` | yes |
| E2E tests (coverage check + Maestro) | `npm run test:e2e` | no — Maestro half only runs locally |
| Documentation validators | `for f in .claude/skills/living-project-documentation/scripts/check-*.mjs; do node "$f"; done` | yes |
| Relative-link integrity | `node .claude/skills/agent-skill-authoring/scripts/check-links.mjs` | yes |
| Native project path resolution | `npx expo prebuild --platform android --no-install && npx expo prebuild --platform ios --no-install && bundle exec fastlane android verify_paths && bundle exec fastlane ios verify_paths` | yes |
| Native Android compile | `npx expo prebuild --platform android --no-install && cd android && ./gradlew --no-daemon assembleDebug --stacktrace` | yes |
| Rust ABI parity check | `diff <(grep -oE '^pub (unsafe )?extern "C" fn [A-Za-z0-9_]+' modules/espada-engine/lib/espada-engine/src/ffi.rs \| awk '{print $NF}' \| sort -u) <(readelf -sW modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so \| awk '$4=="FUNC"&&$5=="GLOBAL"&&$7!="UND"{print $NF}' \| sort -u)` | yes |
| Rust format check | `cargo fmt --check -p espada-engine --manifest-path modules/espada-engine/lib/Cargo.toml` | yes |
| Rust lint | `cargo clippy -p espada-engine --all-targets --manifest-path modules/espada-engine/lib/Cargo.toml -- -D warnings` | yes |
| Rust unit tests | `cargo test --workspace --manifest-path modules/espada-engine/lib/Cargo.toml` | yes |
| Nitrogen drift check | `npm run nitrogen:espada-engine && git add -A && git diff --cached --exit-code` | yes |
| iOS native compile (unsigned) | `npx expo prebuild --platform ios --no-install && cd ios && pod install && cd .. && xcodebuild build -workspace <resolved .xcworkspace> -scheme <its basename> -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO` | no — `ios-native-compile.yaml`, manual dispatch only, never gates a merge |

That is every check `merge-checks.yaml` runs — its ten jobs are `lint`,
`typecheck`, `test`, `e2e_coverage`, `docs`, `links`, `nitrogen_drift`,
`native_paths`, `native_android_compile`, and `rust_checks` — plus `format`,
which runs locally rather than in CI, and the iOS native compile row above,
which runs in its own manually dispatched workflow instead (see
[docs/operations/ios-native-compile-check.md](./docs/operations/ios-native-compile-check.md)).
Rebuilding the native Rust library
does not run locally at all: producing
`modules/espada-engine/`'s committed binaries and generated bindings happens
entirely in
[`espada-engine-artifacts.yaml`](./.github/workflows/espada-engine-artifacts.yaml),
a separate, manually dispatched workflow — see
[docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md).
The `nitrogen_drift` job regenerates `modules/espada-engine`'s Nitrogen
output from its `.nitro.ts` spec and fails on any resulting diff — nothing
else in this workflow runs the generator, so a spec change committed without
regenerating, or a hand-edit to generated output, would otherwise drift
silently. The `native_paths` job only proves that
`fastlane/Fastfile` resolves the generated `android/` and `ios/` project
paths correctly under fastlane's own two-working-directory rule (see the
comment at `generated_native_dir` in `fastlane/Fastfile`); it stands a stub
directory in for the `.xcworkspace` `pod install` would produce, so it never
runs CocoaPods and is not evidence that either preview build succeeds.
`native_android_compile` is the check that actually compiles the C++:
`modules/espada-engine`'s `HybridObject`, its CMake wiring, and Nitro's
prefab link, packaging whatever `.so` is committed at
`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/` — see
[docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md)
for how that binary itself is produced. `rust_checks` is the job that runs
the Rust ABI parity check plus the three Rust commands above against
`modules/espada-engine/lib/` — needing no Android toolchain, no macOS
runner, and no repository secret. The ABI parity check needs no Rust
toolchain either: it compares, as sorted sets, the `extern "C"` function
names `ffi.rs` declares against the committed `.so`'s own exported dynamic
symbols, and exists because that binary once silently went stale — it kept
exporting the old `juicio_native_*` names after the C ABI was renamed to
`espada_engine_*`, and nothing in CI caught it.
[docs/operations/native-module-artifacts.md](./docs/operations/native-module-artifacts.md)
covers `espada-engine-artifacts.yaml`'s own copy of the same check, run against
each build's own output before that workflow ever uploads it as an artifact,
which keeps a wrong-symbol binary from being committed in the first place. Note
that the three Cargo commands are scoped differently on purpose: the tests
run `--workspace`, so a vendored crate's own suite runs too, while format and
lint are scoped to `-p espada-engine`, this project's own crate. A vendored
copy is not held to this project's lint settings — see
[docs/conventions/testing.md](./docs/conventions/testing.md). No *merge check*
compiles the iOS native half — `merge-checks.yaml` runs on `ubuntu-latest`,
which cannot — but the manually dispatched `ios-native-compile.yaml` does, on
`macos-latest`, unsigned; see
[docs/operations/ios-native-compile-check.md](./docs/operations/ios-native-compile-check.md)
for what it proves and why it never gates a merge. This table is the
authoritative list of the project's commands, for human contributors and agents
alike. Run format and lint after every change, and the
suites relevant to the changed surface before opening a pull request; the
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
| Poker evaluation | [`axross/espada`](https://github.com/axross/espada), vendored verbatim as `modules/espada-engine/lib/espada-internal/` (see its `PROVENANCE.md`) |
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
