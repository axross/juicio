# Security

This project's CI supply-chain convention: how a `uses:` reference under
[`.github/`](../../.github) is pinned, why, and the exposure that pinning
defends against. The scope is the whole directory, not `.github/workflows/`
alone: three of this repository's pins live inside its own composite actions
under [`.github/actions/`](../../.github/actions), and a convention that named
only the workflows directory would leave them ungoverned. It does not cover application-level
security — input validation, secret handling in application code, or the
OWASP-style concerns the installed `application-security` capability owns —
and it does not inventory secrets by name; that is
[secrets.md](../operations/secrets.md)'s job.

## Pinning Convention

A third-party action — anything outside the `actions/` GitHub organization —
is pinned to the full 40-character commit SHA behind its latest release, with
that release's tag kept as a trailing comment for a human to read:

```yaml
uses: owner/action@d34db33fd34db33fd34db33fd34db33fd34db33 # v1.2.3
```

A mutable tag (`@v1`, `@v1.2.3`, `@main`) can be repointed by whoever controls
it — a compromised maintainer account or a compromised release pipeline moves
the tag, and every workflow that trusts it runs the new code on its next
dispatch without anyone here changing a line. A commit SHA cannot be
repointed: it names one immutable tree, so a maintainer or an attacker can
only ever add a new tag pointing elsewhere, never rewrite what an existing
pin resolves to.

The SHA MUST be resolved from a release tag with `git ls-remote URL
'refs/tags/vX.Y.Z^{}'`, never guessed or copied from somewhere other than
that resolution. The `^{}` peel matters because a release tag may be an
annotated tag, for which `git ls-remote` returns the tag *object's* SHA
unless the peel is applied — a value `uses:` will not resolve as a commit.
Of the four third-party actions this project pins to a release tag, exactly
one is annotated: `anthropics/claude-code-action`, whose `v1.0.209` names a
tag object (`a130d017…`) that peels to the commit `a60f3e1d…` this repository
actually pins. `dorny/paths-filter`, `android-actions/setup-android`, and
`ruby/setup-ruby` all use lightweight tags, where the peeled and unpeeled
refs give the same SHA. That is a fact about those repositories today, not a
property to rely on: a maintainer can cut the next release either way, so
the peel is always the right thing to write. A SHA that was not resolved this
way MUST NOT be written: a wrong one fails at the run that first uses it, not
at review time, and by then it has already run.

(Re-resolved 2026-08-28 with `git ls-remote URL 'refs/tags/vX.Y.Z'` and
`'refs/tags/vX.Y.Z^{}'` against all four.)

GitHub's own `actions/*` organization stays on a mutable major tag
(`actions/checkout@v7`), never SHA-pinned — a decision this document records
further down, not an inconsistency with the rule above.

## The Exposure Is Per Job, Not Per Repository

GitHub Actions isolates a job into its own runner: a job sees only the
secrets a step in that same job actually references, never a secret used by
some other job in the same workflow. A compromised third-party action runs
arbitrary code inside whichever job invoked it, so what it can reach is
bounded by that job's own secrets — not by which secrets this repository
holds somewhere across every workflow. That is why this convention is
assessed per job: the question for a given `uses:` is "what else is in this
job with it," not "does this repository use secrets at all."

| Third-party action | Job | Secrets in the same job |
| --- | --- | --- |
| `ruby/setup-ruby` | `android-preview.yaml`'s `build` | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `SENTRY_AUTH_TOKEN` |
| `android-actions/setup-android` | `android-preview.yaml`'s `build` | the same |
| `ruby/setup-ruby` | `ios-preview.yaml`'s `build` | `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`, `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`, `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64`, `SENTRY_AUTH_TOKEN` |
| `ruby/setup-ruby` | `android-preview.yaml`'s and `ios-preview.yaml`'s `publish` | `FIREBASE_SERVICE_ACCOUNT_JSON` |
| `ruby/setup-ruby` | `android-release.yaml`'s `version-code` | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| `ruby/setup-ruby` | `android-release.yaml`'s `build` | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `SENTRY_AUTH_TOKEN` |
| `android-actions/setup-android` | `android-release.yaml`'s `build` | the same |
| `ruby/setup-ruby` | `android-release.yaml`'s `publish` | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| `anthropics/claude-code-action` | `claude-review.yaml`'s `review` | `CLAUDE_CODE_OAUTH_TOKEN` |
| `android-actions/setup-android` | `espada-engine-artifacts.yaml`'s `build-android` and `verify-android` | none |
| `dtolnay/rust-toolchain` | `espada-engine-artifacts.yaml`'s `build-android` and `build-ios` | none |
| `dtolnay/rust-toolchain` | `rust-merge-checks.yaml`'s `lint` and `test` | none |
| `dorny/paths-filter` | `expo-merge-checks.yaml`'s, `rust-merge-checks.yaml`'s, and `docs-merge-checks.yaml`'s `changes` | none |

`dorny/paths-filter`, `dtolnay/rust-toolchain`'s two rows, and
`android-actions/setup-android`'s two rows in `espada-engine-artifacts.yaml`
are the least exposed of the table above: none of those jobs references a
secret. `dorny/paths-filter` is the least exposed of all — each of its three
`changes` jobs holds `contents: read` and `pull-requests: read`, nothing
writes, and each job produces only booleans that decide which other jobs in
its own workflow run. Every one of them is
still pinned, for the same reason the rule above names no exception for a
low-exposure job: `dtolnay/rust-toolchain` runs, in
`espada-engine-artifacts.yaml`, in the jobs that produce the binary
`commit-to-branch` goes on to commit, and a supply-chain compromise there
would not need a secret to do damage — poisoning the committed artifact is
damage enough. `dorny/paths-filter` needs no secret either to be worth
compromising: an action that decides which checks run can decide that none
of them do. Exposure changes how urgently a pin matters; it never decides
whether one is owed.

Its `rust-merge-checks.yaml` row is the exception among its own call sites,
but not because a compromise there would be contained. Both of that row's
jobs hold the workflow's `contents: read`, reference no secret, and produce
no artifact anything downstream commits; a compromise reaches the same
source tree every other job in that workflow already checks out, and can
make its own check pass. What it also reaches is a cache that outlives the
run.

`rust-merge-checks.yaml`'s `lint` and `test` jobs each call
[`.github/actions/setup-rust`](../../.github/actions/setup-rust/action.yml),
whose `dtolnay/rust-toolchain` step runs first in each and whose
`actions/cache` step then covers `~/.cargo/registry`, `~/.cargo/git`,
`modules/espada-engine/lib/espada-engine/target`, and
`modules/espada-engine/lib/espada-internal/target` — so whatever the
toolchain action writes into those four paths in either job is inside what
that job saves at the end of its own run. The two jobs pass distinct
`cache-key-prefix` values (`cargo-rust-lint` and `cargo-rust-test` — see that
workflow's own comment for why they must stay distinct), so this writes two
separate cache entries rather than one. `rust-merge-checks.yaml` runs on
`push` to `main` as well as on `pull_request`, so a run on the default
branch writes both entries into the default branch's cache scope. [GitHub's
own dependency-caching
reference](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
states that "workflow runs can restore caches created in either the current
branch or the default branch (usually `main`)", which is what makes each
entry reachable from a later run on any branch — each entry's key carries no
branch, only its own `cache-key-prefix` (`cargo-rust-lint` or
`cargo-rust-test`) and a hash of both
`modules/espada-engine/lib/espada-engine/Cargo.lock` and
`modules/espada-engine/lib/espada-internal/Cargo.lock`, which both jobs
share identically. A planted crate source or a prebuilt `target/` artifact in
either entry is therefore restored and compiled against long after the run
that wrote it ended.

So the reach is narrower than the two `espada-engine-artifacts.yaml` rows
above — nothing here is committed to the repository — but it is not confined
to one run, and this row is stated separately for that reason rather than
because it is harmless. That there are now two cache entries instead of one
does not change the argument; it changes only how many entries carry it.

(Verified 2026-08-28 against the dependency-caching reference above,
`.github/actions/setup-rust/action.yml`'s step order and cache paths, and
`rust-merge-checks.yaml`'s `on:` triggers.)

## Dependabot Coverage of the Composite Actions

`dtolnay/rust-toolchain`, `ruby/setup-ruby`, and `android-actions/setup-android`
are pinned inside this project's own composite actions under
`.github/actions/*/action.yml`, not directly in a workflow file. [GitHub's own
Dependabot options
reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
states that for the `github-actions` ecosystem, `directory: "/"` reaches
`.github/workflows/` and a root-level `action.yml` only — never a nested
`.github/actions/<name>/action.yml`. So these three pins may not be reachable
by Dependabot at all:
[`dependabot-core#6704`](https://github.com/dependabot/dependabot-core/issues/6704),
an open feature request since 2023-02-21, tracks exactly this gap upstream.

[`dependabot.yml`](../../.github/dependabot.yml)'s `github-actions` entry uses
`directories` (a documented, glob-supporting alternative to `directory`) with
both `"/"` and `"/.github/actions/*"`, as an attempt at coverage. Whether that
glob actually makes Dependabot scan a nested `action.yml` for this ecosystem
is undocumented — no primary source confirms or denies it, and the open
upstream issue above suggests it may not. Until that is confirmed, a
maintainer should check these three pins by hand from time to time, and
confirm empirically whether Dependabot ever opens a pull request bumping any
of them.

(Verified 2026-08-28 against the Dependabot options reference and
`dependabot-core#6704`'s open state above.)

## The `dtolnay/rust-toolchain` Exception

`dtolnay/rust-toolchain` cannot be pinned by the convention above literally,
and is handled as a documented exception rather than bent to fit. It
publishes no *versioned release tag* to resolve a SHA from: its one tag,
`v1`, is a floating major alias its owner repoints — the same shape as any
`@v1` — not a tag naming one immutable release. `@stable` also selects both
the action's own revision and the Rust toolchain channel at once, so even a
real `vX.Y.Z` release would not by itself pin the channel this project
relies on.

It is pinned instead at a `master` branch commit SHA, with `with: { toolchain:
stable }` restoring the channel selection `@stable` used to carry — the form
the action's own README pairs with the `toolchain:` input. Its trailing
comment reads `# master` and names no version, deliberately: on a tagless
pin, Dependabot moves the pin forward to the containing branch's current HEAD
rather than to a tagged release, so any version or date written next to it
would go silently wrong at the very first bump it makes. Whether Dependabot
currently bumps this particular pin at all is a separate, unresolved question
— see [Dependabot Coverage of the Composite
Actions](#dependabot-coverage-of-the-composite-actions) above — but `# master`
is what stays true regardless: it names what the pin tracks and nothing it
does not, so it costs nothing to keep even if bumping turns out not to reach
it.

## `actions/*` Stays on Major Tags

GitHub's own `actions/` organization is excluded from the SHA-pinning rule
above and kept on a plain major-version tag (`actions/checkout@v7`), across
every workflow in this repository. This is a recorded decision, not an
oversight the SHA-pinning convention simply failed to reach: GitHub itself
owns both the `actions/` organization and the GitHub-hosted runner that
executes it, so trusting `actions/*`'s own tag is trusting the same party
this project already trusts to run the workflow at all — a materially
different position from trusting an independent third-party maintainer's
tag. A future review finding this file's `actions/*` references unpinned is
seeing this decision working as intended, not a gap.
