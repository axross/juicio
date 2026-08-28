# Security

This project's CI supply-chain convention: how a `uses:` reference under
[`.github/workflows/`](../../.github/workflows) is pinned, why, and the
exposure that pinning defends against. It does not cover application-level
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
that resolution. The `^{}` peel matters: several third-party actions this
project uses tag their releases as annotated tags, and `git ls-remote`
returns the tag *object's* SHA for those unless the peel is applied — a value
`uses:` will not resolve as a commit. A SHA that was not resolved this way
MUST NOT be written: a wrong one fails at the run that first uses it, not at
review time, and by then it has already run.

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
| `ruby/setup-ruby` | `android-preview.yaml`'s `build` | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `SENTRY_AUTH_TOKEN` |
| `android-actions/setup-android` | `android-preview.yaml`'s `build` | the same |
| `ruby/setup-ruby` | `ios-preview.yaml`'s `build` | `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`, `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`, `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64`, `SENTRY_AUTH_TOKEN` |
| `ruby/setup-ruby` | `android-preview.yaml`'s and `ios-preview.yaml`'s `publish` | `FIREBASE_SERVICE_ACCOUNT_JSON` |
| `anthropics/claude-code-action` | `claude-review.yaml`'s `review` | `CLAUDE_CODE_OAUTH_TOKEN` |
| `android-actions/setup-android` | `espada-engine-artifacts.yaml`'s `build-android` and `verify-android` | none |
| `dtolnay/rust-toolchain` | `espada-engine-artifacts.yaml`'s `build-android` and `build-ios` | none |

`dtolnay/rust-toolchain` and `android-actions/setup-android`'s two rows in
`espada-engine-artifacts.yaml` are the least exposed of the table above: every
job in it holds `contents: read` and references no secret. Both are still
pinned, for the same reason the rule above names no exception for a
low-exposure job: `dtolnay/rust-toolchain` runs in the job that produces the
binary `open-pull-request` goes on to commit, and a supply-chain compromise
there would not need a secret to do damage — poisoning the committed artifact
is damage enough. Exposure changes how urgently a pin matters; it never
decides whether one is owed.

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
comment reads `# master` and names no version, deliberately: Dependabot moves
a tagless pin forward to the containing branch's current HEAD rather than to
a tagged release, so any version or date written next to it would go silently
wrong at the very first bump. `# master` names what the pin actually tracks
and nothing it does not.

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
