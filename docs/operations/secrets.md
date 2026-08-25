# Secrets

Every secret and variable this project's automation reads, by exact name, in
one place. Each entry below names what reads it, whether it is required or
optional, and what happens while it is absent. This document owns the
inventory; it does not own how to create the account or credential behind an
entry — [preview-deployment.md](./preview-deployment.md) owns that for the
Android preview pipeline, and is cross-linked from each entry it covers.

Configured under the repository's Settings → Secrets and variables → Actions,
as either a **Secret** or a **Variable**, exactly as marked.

## Android Preview Pipeline

[`android-preview.yaml`](../../.github/workflows/android-preview.yaml)'s
`preflight` job resolves these six to a boolean before the `preview` job runs
at all; missing any of them is a decided skip, not a failure — the workflow
still reports green, and its log names by name what is missing. See
[preview-deployment.md's Preflight Gate](./preview-deployment.md#the-preflight-gate)
for why, and its
[Maintainer Setup](./preview-deployment.md#maintainer-setup-out-of-band)
section for how a maintainer creates each one.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `ANDROID_KEYSTORE_BASE64` | Secret | Yes | `preview` job is skipped entirely. |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Yes | `preview` job is skipped entirely. |
| `ANDROID_KEY_ALIAS` | Secret | Yes | `preview` job is skipped entirely. |
| `ANDROID_KEY_PASSWORD` | Secret | Yes | `preview` job is skipped entirely. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Yes | `preview` job is skipped entirely. |
| `FIREBASE_ANDROID_APP_ID` | Variable | Yes | `preview` job is skipped entirely. |
| `FIREBASE_TESTER_GROUPS` | Variable | No | `publish` distributes the build without adding testers or groups to it. |

`ANDROID_KEYSTORE_BASE64` and `FIREBASE_SERVICE_ACCOUNT_JSON` are each
verified before the rest of the `preview` job trusts them: the workflow's
**Write signing keystore** step strips whitespace before decoding (so a
copy-paste that wrapped the value or picked up a trailing carriage return
still works), then confirms the result with `keytool` — a check that also
exercises `ANDROID_KEYSTORE_PASSWORD` — and its **Write Firebase
service-account credentials** step confirms the file it wrote parses as JSON
and carries the fields a service-account key must have. Either check that
fails posts a `::error::` annotation naming the secret at fault; neither ever
prints a secret value or any part of one. Verify a keystore round-trips
correctly before pasting it in:

```sh
base64 -w0 your-release.keystore > keystore.b64          # macOS: base64 -i your-release.keystore -o keystore.b64
base64 -w0 your-release.keystore | base64 --decode | cmp - your-release.keystore   # no output means it matches
```

Paste `keystore.b64`'s contents into `ANDROID_KEYSTORE_BASE64` exactly as
produced — the decode step tolerates line wrapping and a stray `\r`, but not
a payload that was never valid base64 to begin with.

## Sentry Source-Map Upload

A separate `sentry-check` job resolves these three independently of the
preflight gate above, so a missing one only skips the source-map upload — it
never blocks the Android build or the Firebase publish.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `SENTRY_ORG` | Variable | No (all three together) | Build sets `SENTRY_DISABLE_AUTO_UPLOAD=true`; the app ships, but a stack trace this build's users report arrives unsymbolicated. |
| `SENTRY_PROJECT` | Variable | No (all three together) | Same as `SENTRY_ORG`. |
| `SENTRY_AUTH_TOKEN` | Secret | No (all three together) | Same as `SENTRY_ORG`. |

`SENTRY_ORG` and `SENTRY_PROJECT` are plain slugs, not secrets — masking them
would only make build logs harder to read. `SENTRY_AUTH_TOKEN` is the one
build-time credential here; it authenticates the upload and never ships
inside the app, unlike `EXPO_PUBLIC_SENTRY_DSN` below.

## Independent Review

[`claude-review.yaml`](../../.github/workflows/claude-review.yaml) reads
`CLAUDE_CODE_OAUTH_TOKEN` to run the CI reviewer against a pull request.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `CLAUDE_CODE_OAUTH_TOKEN` | Secret | Yes (for the reviewer to run) | The reviewer silently no-ops rather than failing — its absence looks identical to a clean review, so a run that gets no review comment MUST confirm setup rather than reading the silence as approval. |

Generated once with `claude setup-token`, alongside installing the
[Claude GitHub App](https://github.com/apps/claude) — see
[development-workflow.md's Independent Review](./development-workflow.md#the-independent-review)
section. A maintainer who wants pay-as-you-go API billing instead of
subscription billing can edit the workflow to read an `ANTHROPIC_API_KEY`
secret in place of `CLAUDE_CODE_OAUTH_TOKEN` (per the workflow's own header
comment); as shipped, only `CLAUDE_CODE_OAUTH_TOKEN` is read.

## Local Development

[`.env.example`](../../.env.example) is the template; `cp .env.example
.env.local` seeds the gitignored file every command in
[README.md](../../README.md#getting-started) reads from. Every entry in it is
optional, and the app runs fine with `.env.local` empty or missing entirely.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `EXPO_PUBLIC_SENTRY_DSN` | Public build-time variable, optional | No | `initSentry` returns without calling `Sentry.init` — the app runs normally with error tracking disabled. |

`EXPO_PUBLIC_SENTRY_DSN` carries the `EXPO_PUBLIC_` prefix on purpose: a
Sentry DSN identifies the project events are sent to, is designed to ship
inside the built application, and carries no read access — unlike
`SENTRY_AUTH_TOKEN` above, which is a real credential and MUST NOT ever take
this prefix. `.env.example` also documents `PREVIEW_VERSION_NAME` and
`GITHUB_SHA`, commented out: both are set by
[`android-preview.yaml`](../../.github/workflows/android-preview.yaml) and
`app.config.ts` falls back cleanly when neither is set, so local development
needs neither.
