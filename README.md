# juicio

An app that helps with playing Texas hold'em poker and reviewing that play
afterwards. juicio is an Expo mobile app targeting Android and iOS: it stores
hand and session data on-device and is meant to help a player look back at
how a session actually went, rather than to run the game itself. Only Android
has a build and distribution pipeline; iOS is a code-level target built by
hand (see [Getting started](#getting-started)).

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

- **Node**, the version pinned in [`.nvmrc`](./.nvmrc) (22).
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
- **Xcode, and therefore macOS, to run the app on iOS** — `expo run:ios`
  needs Xcode, and Xcode needs macOS; there is no way around that on Linux
  or Windows. This project still has no iOS build or distribution pipeline
  of any kind: iOS stays a code-level target that must compile and run
  correctly, built and run locally by hand rather than through CI.

Steps:

1. Install dependencies: `npm install`
2. Copy the environment template: `cp .env.example .env.local`
3. Produce a development build: `npm run android` (needs the Android SDK and
   a connected device or emulator, per the prerequisites above). This step
   now comes before starting the dev server, because the dev server targets
   a development build that has to already exist.
4. Start the dev server: `npm run dev` — it connects to the development
   build step 3 installed; press `a` in the terminal to relaunch it on a
   connected Android device or emulator. No `--dev-client` flag is needed:
   with `expo-dev-client` installed, `expo start` targets a development
   build automatically.
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

### Preview environments — review every PR live

Every pull request gets its own signed Android preview build, distributed
through Firebase App Distribution with an install link posted as a fresh
comment on every deploy (recording the deployed commit) — no per-PR web
preview, since this project has no web deployment target. The pipeline is
inert until its signing and distribution secrets are configured; see
[docs/operations/preview-deployment.md](./docs/operations/preview-deployment.md)
for the stages, the preflight gate, and every secret and variable it needs.

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

That is every check `merge-checks.yaml` runs — its six jobs are `lint`,
`typecheck`, `test`, `e2e_coverage`, `docs`, and `links` — plus `format`, which
runs locally and through the edit hook rather than in CI. This table is the
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
| Development builds | expo-dev-client; Expo Go is not supported |
| Error tracking | Sentry (`@sentry/react-native`) |
| Unit tests | Jest, with the `jest-expo` preset |
| E2E tests | Maestro, plus a scenario-coverage gate |
| Android preview distribution | fastlane + Firebase App Distribution (no EAS — Android preview builds only) |

## Related links

Design file: [Figma](https://www.figma.com/design/vkZzv1l45PBcVi5Wp92Eqg).
This section will hold any other real link (issue tracker, deployment
dashboard, staging URL) once one exists; nothing here is a placeholder.

Every secret and variable this repository's automation reads is inventoried,
by exact name, in [docs/operations/secrets.md](./docs/operations/secrets.md).
