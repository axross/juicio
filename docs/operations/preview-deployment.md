# Preview Deployment

How this project builds and distributes an Android preview build from a pull
request — the pipeline [`android-preview.yaml`](../../.github/workflows/android-preview.yaml)
runs, the secrets and variables it needs, and what a maintainer sets up once,
out of band, before any of it can publish anything.

This project does not use EAS — no EAS Build, Submit, Update, or Workflows,
and no `eas.json`. Builds and distribution run on
[fastlane](https://fastlane.tools) driven by GitHub Actions instead, entirely
on `ubuntu-latest` runners. A macOS runner bills at roughly 10x a Linux one,
this repository is private so those minutes are paid for once the included
allowance runs out, and avoiding exactly that cost is the reason for this
whole design; see
[agent-skills.md's EAS deviation entry](./agent-skills.md#deviation--this-project-does-not-use-eas-expo-app-development-is-not-a-mandate-to-reach-for-it).

## What It Covers, and What It Deliberately Does Not

The pipeline builds **Android only**, and a **preview build only**. There is
no iOS build, no iOS signing, and no iOS distribution step anywhere in it, and
there is no production release path for either platform — no Play Store
track, no TestFlight upload, no App Store submission. Every pull request gets
an installable Android APK for manual testing; nothing here ships a release.

## The Four Stages

[`android-preview.yaml`](../../.github/workflows/android-preview.yaml) runs on
every `pull_request` event, in one `preview` job, as four stages in sequence:

1. **Prebuild.** Computes the preview version name (below), then runs `expo
   prebuild --platform android --no-install` to generate the `android/`
   project `app.config.ts` needs to read `PREVIEW_VERSION_NAME` from. The
   generated `android/` directory is cached — see
   [`app.config.ts`](../../app.config.ts) for the environment variable it
   reads — keyed on a hash of `app.json`, `app.config.ts`, and
   `package-lock.json` plus the version name itself, so a pull request that
   changes none of those skips regenerating it.
2. **Build.** The fastlane `build` lane (`fastlane/Fastfile`) runs Gradle's
   `assemble` task in `Release` against the generated `android/` project,
   with signing properties injected from environment, and produces a signed
   release APK.
3. **Publish.** The fastlane `publish` lane distributes that APK through the
   `firebase_app_distribution` plugin and reports back the install (testing)
   URI Firebase generated for it.
4. **Report.** The workflow posts a **new** comment on the pull request with
   the install link, prefixed with this project's agent-comment marker
   (`<!-- agent -->`, per [`AGENTS.md`](../../AGENTS.md)). It never edits a
   previous comment in place — every deploy gets its own — and it never posts
   a link when publishing did not happen: the comment step runs only after
   the publish step has already succeeded.

Sentry source-map upload rides inside the build stage rather than being a
fifth stage of its own — see below.

## The Preflight Gate

This workflow has to be mergeable before any Android keystore or Firebase
project exists — stage 4b of this project's own delivery introduces the
pipeline; the account setup described below happens afterward, out of band.
A separate `preflight` job runs first and resolves every required secret and
variable to a plain boolean in one step, because a secret cannot be tested
directly in a workflow `if:` expression. When anything required is absent,
that job's log names exactly which secret or variable is missing (never a
value, only whether it is set), the `preview` job is skipped entirely, and
the run still reports **green**. A missing secret is a decided skip here, not
a failure — the alternative, a workflow that goes red on every pull request
until someone provisions a Firebase project, would block unrelated changes
for a reason that has nothing to do with them. Nothing in this workflow uses
`continue-on-error` to reach that green status: the gate decides up front,
rather than letting a step fail and hiding it.

## Sentry Source-Map Upload (Optional)

Sentry source-map upload for the app's JavaScript is **optional** and gated
**independently** of the preflight gate above: `SENTRY_ORG`, `SENTRY_PROJECT`,
and `SENTRY_AUTH_TOKEN` are never added to what `preflight` requires, so a
missing Sentry token can never block the Android build or the Firebase
publish — only the source-map upload itself is skipped.

A separate `sentry-check` job resolves those three to a boolean the same way
`preflight` does, and its result decides how the `build` stage's environment
is set. The `@sentry/react-native/expo` config plugin already wires the
Sentry Android Gradle Plugin into the generated `android/app/build.gradle` at
prebuild time; when all three are present, that plugin's own upload step
reads them from the environment and uploads the release's source maps (and
Proguard mapping, when one exists) as part of the same `gradle assemble` task
the `build` stage already runs — no separate upload step. When any of the
three is missing, the `build` stage sets `SENTRY_DISABLE_AUTO_UPLOAD=true`
instead, which turns that upload off at the source so the build never
depends on Sentry being configured, and the job log names by name what is
missing.

Without this configured, the build and the Firebase publish still run exactly
as before; the only loss is that any stack trace this build's users report to
Sentry arrives unsymbolicated (minified file and line numbers instead of the
real source).

The release string this build reports and the release string the upload is
filed under are the same value from the same source, never composed twice.
[`app.config.ts`](../../app.config.ts) resolves it once — `resolveSentryRelease`
in [`src/core/instrumentation/sentry-identity.ts`](../../src/core/instrumentation/sentry-identity.ts),
combining the app version with the commit hash — and exposes it at
`extra.sentryRelease`. `Sentry.init` reads that field through
`expo-constants` at runtime; the **Resolve Sentry release** step earlier in
this job reads the identical field from `npx expo config --type public
--json` and exports it as `SENTRY_RELEASE`, which the Sentry Android Gradle
Plugin's upload step reads ahead of its own
`<applicationId>@<versionName>+<versionCode>` default. Neither side
reconstructs the format independently.

## Required Secrets and Variables

Configured under the repository's Settings → Secrets and variables → Actions,
as either a **Secret** or a **Variable** exactly as marked. Every name below
is read verbatim by [`android-preview.yaml`](../../.github/workflows/android-preview.yaml)
or by [`fastlane/Fastfile`](../../fastlane/Fastfile).

| Name                                    | Kind               | What it is                                                                                                       |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                | Secret             | The release keystore file, base64-encoded. The workflow decodes it to a path outside the checked-out working tree and hands fastlane that path as `ANDROID_KEYSTORE_PATH` — the keystore's bytes are never checked in and never appear in a log. |
| `ANDROID_KEYSTORE_PASSWORD`              | Secret             | The keystore's password.                                                                                          |
| `ANDROID_KEY_ALIAS`                      | Secret             | The signing key's alias inside that keystore.                                                                     |
| `ANDROID_KEY_PASSWORD`                   | Secret             | That signing key's own password.                                                                                  |
| `FIREBASE_SERVICE_ACCOUNT_JSON`          | Secret             | A Firebase service-account credentials JSON file, held **verbatim** (not base64-encoded — unlike the Android keystore above, which is binary and has no verbatim form). Written as-is to a path outside the working tree and handed to fastlane as `FIREBASE_SERVICE_ACCOUNT_CREDENTIALS_PATH`. |
| `FIREBASE_ANDROID_APP_ID`                | Variable, required | The Firebase App ID (from the Firebase console's General Settings page) of the Android app receiving preview builds. Not a secret: it is the same identifier that ships inside a built app's own Firebase configuration. |
| `FIREBASE_TESTER_GROUPS`                 | Variable, optional | Comma-separated Firebase App Distribution tester group aliases to distribute each preview build to. Left unset, `publish` distributes the release without adding testers or groups to it. |
| `SENTRY_ORG`                              | Variable, optional | The Sentry organization slug source maps upload to. Left unset (with either of the other two below), the build sets `SENTRY_DISABLE_AUTO_UPLOAD=true` and skips the upload — see [Sentry Source-Map Upload](#sentry-source-map-upload-optional) above. |
| `SENTRY_PROJECT`                          | Variable, optional | The Sentry project slug within that organization. Same optional-together rule as `SENTRY_ORG`. |
| `SENTRY_AUTH_TOKEN`                       | Secret, optional   | A Sentry auth token scoped to upload releases and source maps for that project. Same optional-together rule as `SENTRY_ORG`. |

## Maintainer Setup (Out of Band)

None of this is created by the pipeline; a maintainer sets it up once, before
the secrets and variables above have anything real to hold:

- **An Android release keystore.** Generated once (for example with
  `keytool -genkeypair`) and kept outside this repository; its base64-encoded
  contents become `ANDROID_KEYSTORE_BASE64`, and its password and key alias
  become the other three `ANDROID_KEY_*` secrets.
- **A Firebase project with an App Distribution Android app.** The Android
  app registered there (matching this project's `app.axross.juicio` package)
  is what `FIREBASE_ANDROID_APP_ID` names, and App Distribution itself must be
  enabled for it — free on both Firebase pricing tiers, and it accepts an APK
  directly, which is why this project distributes through it rather than
  through a store track.
- **A service account holding the Firebase App Distribution Admin role.**
  Created in that same Firebase project (or its underlying Google Cloud
  project), with a JSON key downloaded for it; that key's contents, pasted in
  verbatim (not base64-encoded), become `FIREBASE_SERVICE_ACCOUNT_JSON`. A
  role short of Admin can read releases but cannot upload or distribute one,
  so the `publish` lane fails authorization without it.
- **A Sentry project, and an auth token scoped to it, if source-map upload is
  wanted.** The project's slug and its organization's slug become
  `SENTRY_PROJECT` and `SENTRY_ORG`; a token with the `project:releases` scope
  (created under the organization's Settings → Auth Tokens) becomes
  `SENTRY_AUTH_TOKEN`. This one is entirely optional — skip it and the
  pipeline runs exactly as it does today, just without symbolicated stack
  traces in Sentry.

## The Version-Naming Scheme

Each preview build's version name is `<version from app.json>-pr-<pull
request number>` — for example `0.1.0-pr-42`. The workflow computes it once,
early in the `preview` job, and exports it as `PREVIEW_VERSION_NAME` for every
later step; [`app.config.ts`](../../app.config.ts) reads that same variable
and, when it is set, uses it as the app config's `version` instead of the
static value in `app.json`. That is also the value the prebuild cache key
folds in, so a version bump (a new pull request, or the base `app.json`
version changing) never reuses another pull request's cached native project.
