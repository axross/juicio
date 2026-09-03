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
`preflight` job resolves these six to a boolean before its later jobs
(`prebuild`, `build`, `publish`) run at all; missing any of them **fails the
run** — a human explicitly dispatched this build, so the workflow's log names
by name (never by value) what is missing with an `::error::` annotation, and
none of those later jobs starts.
[preview-deployment.md](./preview-deployment.md) covers both halves of that:
its Preflight Gate section for why a missing secret fails rather than skips,
and its Maintainer Setup section for how a maintainer creates each one.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `ANDROID_KEYSTORE_BASE64` | Secret | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEY_ALIAS` | Variable | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEY_PASSWORD` | Secret | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_ANDROID_APP_ID` | Variable | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_TESTER_GROUPS` | Variable | No | `publish` distributes the build without adding testers or groups to it. |

`ANDROID_KEYSTORE_BASE64` and `FIREBASE_SERVICE_ACCOUNT_JSON` are each
verified before anything downstream trusts them: the `build` job's **Write
Signing Keystore** step strips whitespace before decoding (so a copy-paste
that wrapped the value or picked up a trailing carriage return still works),
then confirms the result with `keytool` — a check that also exercises
`ANDROID_KEYSTORE_PASSWORD` — and the `publish` job's **Write Firebase
Service-Account Credentials** step confirms the file it wrote parses as JSON
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

## Android Release Pipeline

[`android-release.yaml`](../../.github/workflows/android-release.yaml)'s
`preflight` job resolves these five to a boolean before its later jobs run,
but draws two different lines through them rather than one: missing any of
the three `ANDROID_*` secrets or the `ANDROID_KEY_ALIAS` variable **fails
the run** the same way the Android preview table above does, while missing
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` does
**not** — it only skips the `version-code` and `publish` jobs, leaving the
signed Android App Bundle `build` still produces retrievable from the run.
[google-play-release.md](./google-play-release.md) covers all of this: its
Preflight Gate section for why the line falls where it does, its Maintainer
Setup section for how a maintainer creates each credential, and its
First-Upload Problem section for what a missing or not-yet-effective Play
credential looks like once dispatched.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `ANDROID_KEYSTORE_BASE64` | Secret | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEY_ALIAS` | Variable | Yes | The run fails; none of the later jobs starts. |
| `ANDROID_KEY_PASSWORD` | Secret | Yes | The run fails; none of the later jobs starts. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Secret | No (but see above) | The run still builds a signed Android App Bundle and uploads it as a run artifact; the `version-code` and `publish` jobs are skipped, so nothing reaches Google Play. |

`ANDROID_KEYSTORE_BASE64` and `ANDROID_KEY_ALIAS`/`ANDROID_KEY_PASSWORD` are
the same release keystore and credentials the Android Preview table above
names — one keystore reused as the Play upload key, read independently by
each workflow's own `build` job, not a second keystore to create.
`ANDROID_KEY_ALIAS` is a Variable rather than a Secret because it is a plain
identifying label, not a credential — the real credentials are
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, and
`ANDROID_KEY_PASSWORD`, which all stay Secrets, the same reasoning
`SENTRY_ORG`/`SENTRY_PROJECT` get below. Registering it as a Secret is what
is believed to have caused `android-release.yaml`'s `preflight` job to lose
its own `package-name` output (`app.axross.juicio`) during this workflow's
first real dispatch: GitHub Actions masks any job-to-job output that
contains a registered Secret's value as a substring, and `package-name`
went missing in a way that pattern explains — `ANDROID_KEY_ALIAS` is a
keystore alias conventionally set to the app's own name, and is the most
likely registered Secret whose value overlapped a substring of
`app.axross.juicio`. A Variable is never masked regardless of content,
which removes the alias from the masking pool for good regardless of
whether it was the exact secret at fault.
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is verified the same way
`FIREBASE_SERVICE_ACCOUNT_JSON` is: written outside the working tree, then
confirmed to parse as JSON and to carry the fields a service-account key
must have, by
[`.github/actions/write-play-credentials`](../../.github/actions/write-play-credentials/action.yml)
— a step shared by the `version-code` and `publish` jobs, since each is a
separate runner that needs the same credential written and validated on its
own. Either check that fails posts a `::error::` annotation naming the
secret at fault; neither ever prints a secret value or any part of one.

## iOS Preview Pipeline

[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml)'s own
`preflight` job resolves these six to a boolean before its later jobs
(`prebuild`, `build`, `publish`) run — the iOS secret set only, so an
unconfigured Android setup can never fail this dispatch and the reverse is
equally true. Missing any of them **fails the run**, naming what is missing
the same way the Android table above does.
[preview-deployment.md](./preview-deployment.md) carries the rest: its
Preflight Gate section for why a missing secret fails, its Maintainer Setup
section for how a maintainer creates each one, and its Ad-Hoc Constraint
section for the procedure that keeps
`APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` current as testers are added.

| Name | Kind | Required | While absent |
| ---- | ---- | -------- | ------------ |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Secret | Yes | The run fails; none of the later jobs starts. |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Secret | Yes | The run fails; none of the later jobs starts. |
| `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` | Secret | Yes | The run fails; none of the later jobs starts. |
| `APPLE_DEVELOPER_TEAM_ID` | Variable | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Secret | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_IOS_APP_ID` | Variable | Yes | The run fails; none of the later jobs starts. |
| `FIREBASE_TESTER_GROUPS` | Variable | No | `publish` distributes the build without adding testers or groups to it. |

`FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_TESTER_GROUPS` are the same
values the Android table above names — one Firebase service account and one
tester-group list, read independently by each workflow's own `preflight`
job, not two separate credentials to create.

`APPLE_DISTRIBUTION_CERTIFICATE_BASE64` and
`APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` are each verified before the
`build` job trusts them, the same way the
Android keystore is: the **Import Signing Certificate** step strips
whitespace before decoding, imports the result into a throwaway keychain,
and confirms a usable code-signing identity landed in it (also exercising
`APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`); the **Install Provisioning
Profile** step decodes its signed payload and confirms the bundle identifier
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

All three of `android-preview.yaml`, `ios-preview.yaml`, and
`android-release.yaml` resolve these three in their own `preflight` job,
alongside but independently of that job's required-configuration set, so a
missing one only skips that pipeline's source-map upload — it never blocks
the build, and never blocks the Firebase publish or the Google Play upload
either.

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
| `EXPO_PUBLIC_SENTRY_DSN` | Public build-time variable, optional | No | `initSentry` returns before calling `Sentry.init` — the app runs normally with error tracking disabled, whether that is a local run, an Android or iOS preview build, or an Android release build. |

`EXPO_PUBLIC_SENTRY_DSN` carries the `EXPO_PUBLIC_` prefix on purpose: a
Sentry DSN identifies the project events are sent to, is designed to ship
inside the built application, and carries no read access — unlike
`SENTRY_AUTH_TOKEN` above, which is a real credential and MUST NOT ever take
this prefix.

`android-preview.yaml`, `ios-preview.yaml`, and `android-release.yaml` each
read this same variable too, from a repository **Variable** of the same name
(Settings → Secrets and variables → Actions → Variables), alongside
`SENTRY_ORG` and `SENTRY_PROJECT` on all three, and the `FIREBASE_*` values
on the two preview pipelines only — `android-release.yaml` has no Firebase
step. A Variable rather than a Secret because the paragraph above is the
whole reason: this value is not a credential. Reading it through the
`secrets` context instead would silently resolve to an empty string and
ship a build with error tracking disabled — which is indistinguishable,
from the outside, from not having configured it at all. Each workflow's
own **Build Signed Release APK** (Android preview), **Build Signed Ad-Hoc
IPA** (iOS), or **Assemble
Signed Release Bundle** (Android release) step carries it in its
environment, because that step — not `expo prebuild` earlier, and not the
Firebase or Google Play publish step later — is what actually invokes the
JS bundler: `EXPO_PUBLIC_`-prefixed variables are inlined into the JS bundle
at the moment it is produced, and that is where each platform's native
build produces it. It stays exactly as optional there as it is locally:
none of the three workflows' `preflight` jobs require it, so its absence
never fails a dispatch. **This is the switch that decides whether a preview
or release build can report its own crashes.** While it is absent, that
build step's environment carries no value for it, `initSentry` returns
before calling `Sentry.init` in the resulting build exactly as it does
locally, and the build ships and installs normally — but a crash it hits on
a real device is reported nowhere, and nothing in the build log says so
either. Configure the Variable once and every later build on that platform
picks it up.

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
