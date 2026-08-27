# Secrets

Every secret and variable this project's automation reads, by exact name, in
one place. Each entry below names what reads it, whether it is required or
optional, and what happens while it is absent. This document owns the
inventory; it does not own how to create the account or credential behind an
entry — [preview-deployment.md](./preview-deployment.md) owns that for both
preview pipelines, and is cross-linked from each entry it covers.

Configured under the repository's Settings → Secrets and variables → Actions,
as either a **Secret** or a **Variable**, exactly as marked.

## Android Preview Pipeline

[`android-preview.yaml`](../../.github/workflows/android-preview.yaml)'s
`preflight` job resolves these six to a boolean before the `preview` job runs
at all; missing any of them **fails the run** — a human explicitly dispatched
this build, so the workflow's log names by name (never by value) what is
missing with an `::error::` annotation, and the `preview` job never starts.
[preview-deployment.md](./preview-deployment.md) covers both halves of that:
its Preflight Gate section for why a missing secret fails rather than skips,
and its Maintainer Setup section for how a maintainer creates each one.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `ANDROID_KEYSTORE_BASE64` | Secret | Yes | The run fails; `preview` never starts. |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Yes | The run fails; `preview` never starts. |
| `ANDROID_KEY_ALIAS` | Secret | Yes | The run fails; `preview` never starts. |
| `ANDROID_KEY_PASSWORD` | Secret | Yes | The run fails; `preview` never starts. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Yes | The run fails; `preview` never starts. |
| `FIREBASE_ANDROID_APP_ID` | Variable | Yes | The run fails; `preview` never starts. |
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

## iOS Preview Pipeline

[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml)'s own
`preflight` job resolves these six to a boolean before its `preview` job runs
— the iOS secret set only, so an unconfigured Android setup can never fail
this dispatch and the reverse is equally true. Missing any of them **fails
the run**, naming what is missing the same way the Android table above does.
[preview-deployment.md](./preview-deployment.md) carries the rest: its
Preflight Gate section for why a missing secret fails, its Maintainer Setup
section for how a maintainer creates each one, and its Ad-Hoc Constraint
section for the procedure that keeps
`APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` current as testers are added.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Secret | Yes | The run fails; `preview` never starts. |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Secret | Yes | The run fails; `preview` never starts. |
| `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` | Secret | Yes | The run fails; `preview` never starts. |
| `APPLE_DEVELOPER_TEAM_ID` | Variable | Yes | The run fails; `preview` never starts. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Yes | The run fails; `preview` never starts. |
| `FIREBASE_IOS_APP_ID` | Variable | Yes | The run fails; `preview` never starts. |
| `FIREBASE_TESTER_GROUPS` | Variable | No | `publish` distributes the build without adding testers or groups to it. |

`FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_TESTER_GROUPS` are the same
values the Android table above names — one Firebase service account and one
tester-group list, read independently by each workflow's own `preflight`
job, not two separate credentials to create.

`APPLE_DISTRIBUTION_CERTIFICATE_BASE64` and
`APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` are each verified before the
`preview` job trusts them, the same way the
Android keystore is: the **Import signing certificate** step strips
whitespace before decoding, imports the result into a throwaway keychain,
and confirms a usable code-signing identity landed in it (also exercising
`APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`); the **Install provisioning
profile** step decodes its signed payload and confirms the bundle identifier
it was issued for matches `app.json`'s `expo.ios.bundleIdentifier`. Either
check that fails posts an `::error::` annotation naming the secret at fault;
neither ever prints a secret value or any part of one. Encode either file the
same way as the Android keystore:

```sh
base64 your-distribution-certificate.p12 | tr -d '\n' > certificate.b64
base64 your-profile.mobileprovision | tr -d '\n' > profile.b64
```

Paste each file's contents into its secret exactly as produced.

## Sentry Source-Map Upload

Both `android-preview.yaml` and `ios-preview.yaml` run their own
`sentry-check` job, resolving these three independently of that workflow's
own preflight gate, so a missing one only skips that platform's source-map
upload — it never blocks the build or the Firebase publish, on either
platform.

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
| `EXPO_PUBLIC_SENTRY_DSN` | Public build-time variable, optional | No | `initSentry` returns before calling `Sentry.init` — the app runs normally with error tracking disabled, whether that is a local run or an Android or iOS preview build. |

`EXPO_PUBLIC_SENTRY_DSN` carries the `EXPO_PUBLIC_` prefix on purpose: a
Sentry DSN identifies the project events are sent to, is designed to ship
inside the built application, and carries no read access — unlike
`SENTRY_AUTH_TOKEN` above, which is a real credential and MUST NOT ever take
this prefix.

`android-preview.yaml` and `ios-preview.yaml` each read this same variable
too, from a repository **Variable** of the same name (Settings → Secrets and
variables → Actions → Variables), alongside `SENTRY_ORG`, `SENTRY_PROJECT`,
and the `FIREBASE_*` values. A Variable rather than a Secret because the
paragraph above is the whole reason: this value is not a credential. Reading
it through the `secrets` context instead would silently resolve to an empty
string and ship a preview build with error tracking disabled — which is
indistinguishable, from the outside, from not having configured it at all.
Each workflow's own **Build signed release APK** (Android) or
**Build signed ad-hoc IPA** (iOS) step carries it in its environment,
because that step — not `expo prebuild` earlier, and not the Firebase
publish step later — is what actually invokes the JS bundler:
`EXPO_PUBLIC_`-prefixed variables are inlined into the JS bundle at the
moment it is produced, and that is where each platform's native build
produces it. It stays exactly as optional there as it is locally: neither
workflow's `preflight` job requires it, so its absence never fails a
dispatch. **This is the switch that decides whether a preview build can
report its own crashes.** While it is absent, that build step's environment
carries no value for it, `initSentry` returns before calling `Sentry.init`
in the resulting build exactly as it does locally, and the preview build
ships and installs normally — but a crash it hits on a real device is
reported nowhere, and nothing in the build log says so either. Configure the
secret once and every later preview build on that platform picks it up.

`.env.example` also documents three variables `app.config.ts`
reads, all commented out, and local development needs none of them because
that file falls back cleanly for each:

- `PREVIEW_VERSION_NAME` and `GITHUB_SHA` are set by
  [`android-preview.yaml`](../../.github/workflows/android-preview.yaml) and
  [`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml) themselves.
- `GITHUB_RUN_NUMBER` is not set by either: GitHub Actions provides it to
  every workflow run, and `app.config.ts` derives `ios.buildNumber` and
  `android.versionCode` from it. It counts runs of **one** workflow rather
  than of the repository, so each platform's build numbers form their own
  sequence — monotonic within a platform, which is what a build number has
  to be, and unrelated across the two.
