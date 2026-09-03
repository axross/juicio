# Google Play Release

How this project builds a signed Android App Bundle and uploads it to Google
Play's internal testing track — the one pipeline,
[`android-release.yaml`](../../.github/workflows/android-release.yaml), the
secrets it needs, the one-time Google Play Console and service-account setup
a maintainer performs before it can publish anything, and which parts of it
have never run against Google Play.

This is the one production-shaped release path this project has. It is
Android-only and internal-testing-only: no iOS build, no TestFlight, no App
Store submission, and no promotion beyond internal testing — closed testing,
open testing, and production stay a manual Console action. It reuses the same
fastlane-driven, no-EAS approach
[`preview-deployment.md`](./preview-deployment.md) documents for the two
preview pipelines, and the two pipelines share several composite actions
under [`.github/actions/`](../../.github/actions) — but they are otherwise
independent: dispatching this workflow neither reads nor changes anything
about how `android-preview.yaml` or `ios-preview.yaml` behave. See
[decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md](../decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md)
for why this pipeline is built on the same tooling rather than a hosted
service, and why its version code comes from a different source than the
preview pipelines' own.

## What Has Never Run Against Google Play

**State this plainly before anything else:** this pipeline has been written
and verified as far as it can be without Google Play credentials, but no run
of it has ever reached Google Play. The Google Play Console setup below, the
service-account grant, and the first dispatch are the maintainer's follow-up
work, done after this pipeline merges. Concretely, unverified means:

- The `version-code` job's Google Play read — `bundle exec fastlane android
  next_play_version_code` — has never executed against a real Play account.
  Whether the permission set [Service-Account Setup](#service-account-setup)
  below grants is enough to open the edit session that read needs is not
  known.
- The `publish` job's upload — `bundle exec fastlane android
  publish_to_play` — has never executed against a real Play account. Whether
  the API accepts this app's first upload, or rejects it the way
  [The First-Upload Problem](#the-first-upload-problem) below describes, is
  not known.
- No release produced by this pipeline has ever reached an internal tester's
  device.

What has been verified, without Play credentials, is the rest of the
pipeline's shape: that `preflight` fails correctly and completely when a
required secret is absent, that a signed Android App Bundle is produced and
uploaded as a run artifact when the Play credential specifically is what's
missing, and that a second dispatch queues behind a run already in progress
rather than cancelling it. See this document's own
[Verification](#verification) section for exactly what was exercised and how.

## The Stages

`android-release.yaml` runs five jobs, in dependency order:

1. **Preflight** (`ubuntu-slim`). Resolves the three Android signing secrets,
   the Android signing variable, and the one Play secret to booleans, in one
   step, and writes a
   configuration table to the run summary before deciding anything — see
   [The Preflight Gate](#the-preflight-gate) below. The same step separately
   resolves the optional Sentry set (`SENTRY_ORG`, `SENTRY_PROJECT`,
   `SENTRY_AUTH_TOKEN`) to its own boolean. Also resolves the release
   version name and the Android package name, both read directly from
   `app.json`, and outputs all of it — `version-name`, `package-name`,
   `play-configured`, `sentry-configured` — for every later job to read.
2. **Version Code** (`ubuntu-latest`). Runs only when Google Play is
   configured. Writes the Play service-account credentials to a file outside
   the working tree, validates them, and runs `bundle exec fastlane android
   next_play_version_code`, which reads the highest version code the
   internal testing track currently reports and returns one more than it —
   see [The Version-Code Rule](#the-version-code-rule) below. Its own read
   opens and closes a Google Play edit session, which is why this pipeline
   serialises its runs — see
   [Why Cancellation Is Unsafe Here](#why-cancellation-is-unsafe-here) below.
3. **Prebuild** (`ubuntu-latest`). Installs dependencies and runs `expo
   prebuild --platform android --no-install`, cached the same way
   `android-preview.yaml`'s own `prebuild` job is — see that document's
   [Prebuild and CocoaPods Caching](./preview-deployment.md#prebuild-and-cocoapods-caching)
   section for the caching mechanics, which this job shares. It also resolves
   the Sentry release string the same way `android-preview.yaml`'s `prebuild`
   job does — see
   [preview-deployment.md's "Sentry Source-Map Upload (Optional)"](./preview-deployment.md#sentry-source-map-upload-optional)
   — and outputs it as `sentry-release`. The generated
   `android/` directory is archived as a tar file (to carry `gradlew`'s
   executable bit through the upload) and uploaded as an artifact.
4. **Build** (`ubuntu-latest`). Downloads and extracts the `prebuild`
   artifact, stamps a version code into `android/app/build.gradle` — the
   Play-derived one from `version-code` when Google Play is configured, or
   this run's own `GITHUB_RUN_NUMBER` otherwise — writes and verifies the
   release keystore, and runs `bundle exec fastlane android bundle_release`,
   which assembles a **signed Android App Bundle** (Gradle's `bundle` task,
   in `Release`) rather than the APK `android-preview.yaml` produces. The
   Sentry Android Gradle Plugin that `expo prebuild` wires in rides inside
   that same Gradle invocation — this job passes it the Sentry set `preflight`
   resolved (and `SENTRY_DISABLE_AUTO_UPLOAD` when that set is incomplete, so
   the build never depends on it), the same mechanism
   [preview-deployment.md's "Sentry Source-Map Upload (Optional)"](./preview-deployment.md#sentry-source-map-upload-optional)
   describes. The resulting `.aab` is uploaded as a run artifact with **7-day
   retention** — longer than either preview pipeline's 1-day retention on its
   own equivalent artifact, because this one may be the thing a maintainer
   comes back for once Google Play is configured, not only a same-run
   hand-off to the next job.
5. **Publish** (`ubuntu-latest`). Runs only when Google Play is configured
   and both `version-code` and `build` actually succeeded. Downloads the
   signed bundle, writes and validates the Play service-account credentials
   again (this job is a separate runner from `version-code`, so the same
   credential is written and validated twice, not once), and runs `bundle
   exec fastlane android publish_to_play`, which uploads the bundle to the
   **internal** testing track with release status **completed** — available
   to enrolled testers within minutes, with nothing left waiting in the
   Console for a human to publish. The run summary states the version name,
   the version code, and the track.

Signing is not reinvented anywhere in this pipeline: the same repository
release keystore `android-preview.yaml` already injects into Gradle through
`android.injected.signing.*` properties is injected the same way here, for
the `bundle` task instead of `assemble`. Google Play App Signing holds the
actual app signing key on Google's side; this keystore is only the upload
key, which is why reusing it introduces no new signing material and no new
risk to the app signing key itself.

## Why This Workflow Differs From the Preview Pipelines

`android-release.yaml` is modelled closely on `android-preview.yaml` — the
job shape, the preflight-resolves-secrets-to-booleans pattern, the keystore
write-and-verify step, the tar-archived artifact hand-off between jobs — but
differs in ways the release use case requires:

- **Trigger.** `workflow_dispatch` with no inputs. The dispatcher picks the
  ref to release directly in the Actions UI; there is no pull request to
  name, so there is nothing analogous to `android-preview.yaml`'s
  `pull-request-number` input or its **Verify Pull Request Origin** step.
  `workflow_dispatch` always resolves against the exact ref it was dispatched
  for, and that resolved commit is what every job's default checkout (no
  `ref:` override) and the ambient `github.sha` / `GITHUB_SHA` already name —
  so, unlike the preview pipelines, no job here threads a `head-sha` output
  of its own.
- **Concurrency.** `cancel-in-progress: false` — the opposite of both preview
  pipelines' `cancel-in-progress: true`. See
  [Why Cancellation Is Unsafe Here](#why-cancellation-is-unsafe-here) below.
- **Output.** An Android App Bundle (Gradle's `bundle` task), not the APK
  `android-preview.yaml`'s `assemble` task produces — Google Play requires a
  bundle for a new app.
- **An extra stage.** The `version-code` job has no analogue in either
  preview pipeline; it exists because the version code has to be settled
  before the bundle is built, since it is compiled into the artifact.
- **The destination.** Google Play's internal testing track, through
  fastlane's `upload_to_play_store` action, rather than Firebase App
  Distribution through `firebase_app_distribution`.
- **What a missing credential does.** A missing Android signing secret fails
  `preflight` outright, exactly as either preview pipeline's own required set
  does. A missing Play credential does not: `preflight` still passes, the
  bundle still gets built, and only the `version-code` and `publish` jobs are
  skipped — see [The Preflight Gate](#the-preflight-gate) below for why this
  pipeline draws that line differently from the preview pipelines' single
  all-or-nothing gate.

## Why Cancellation Is Unsafe Here

Both preview pipelines cancel an in-flight run when a new one is dispatched
for the same pull request (`cancel-in-progress: true`), and say why in their
own `concurrency:` comment: a cancellation landing after an external call
returns but before the job finishes can leave that call's effect in place
with nothing in the run's own output to say so. This pipeline has the same
problem in a sharper form. Reading version codes from Google Play opens an
edit session against the app and closes it again; Google Play permits
exactly **one open edit per account**. If a second run's `version-code` read
— or worse, its `publish` job's upload, which keeps its own edit open for the
whole upload — lands while a first run's edit is still open, the two collide.
`cancel-in-progress: false` is what keeps that from happening: a second
dispatch queues behind the first rather than racing it. This is a correctness
requirement this pipeline has and the preview pipelines do not, not a cost
control — nothing about it is about spending fewer Actions minutes.

## The Preflight Gate

`preflight`'s **Resolve Required Configuration** step resolves eight things to
a boolean each — the three Android signing secrets, the Android signing
variable, the one Play secret, and the three optional Sentry entries — and
writes all eight to one table in the run summary
naming what is present, never a value,
before deciding anything. It draws two different lines through the five
required entries in that table, not one:

- **Missing an Android signing secret or the Android signing variable fails
  the run outright**, the same way either preview pipeline's own preflight
  does: the log names every missing entry by name with one `::error::`
  annotation, and nothing after `preflight` runs.
- **Missing the Play secret does not fail the run.** It emits an
  `::warning::` instead, and outputs `play-configured=false` for every later
  job to read. `prebuild` and `build` are unconditional on that output — the
  bundle gets built regardless — while `version-code` and `publish` are
  each conditioned on it and are skipped.

This is a deliberate difference from the preview pipelines' single
all-or-nothing gate, not a relaxation of it applied inconsistently. It exists
to serve one specific acceptance requirement: a run with the signing secrets
present and the Play credential absent still has to leave a signed,
retrievable bundle behind, because that bundle is the manual first-upload
route's whole input — see
[The First-Upload Problem](#the-first-upload-problem) below. A signing
secret has no equivalent fallback path, so it stays in the all-or-nothing
set.

Sentry configuration (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) is
optional here too, the same way it already is for both preview pipelines:
`preflight` writes its three rows into that same table, but resolves
whether it passes independently of the five required entries above — a
missing Sentry entry only warns and skips the `build` job's source-map
upload, never joins the `missing` list that fails the run. See
[preview-deployment.md's "Sentry Source-Map Upload (Optional)"](./preview-deployment.md#sentry-source-map-upload-optional)
for the mechanism and
[secrets.md's "Sentry Source-Map Upload"](./secrets.md#sentry-source-map-upload)
for the credentials table.

## The Version-Code Rule

```
next_version_code = (highest version code the internal testing track reports) + 1
                    # or 1 when the track reports none
```

`next_play_version_code` (`fastlane/Fastfile`) computes this with fastlane's
`google_play_track_version_codes` action, which returns an empty array —
never an error — when the track has no release yet. Falling back to `1` in
that case is what makes the app's first upload possible at all through this
pipeline, not a defensive branch for an error condition.

This differs from how both preview pipelines derive their own build numbers:
`android-preview.yaml` and `ios-preview.yaml` stamp `GITHUB_RUN_NUMBER`
directly, unconditionally, to defeat a stale prebuild-cache hit — see
[preview-deployment.md's own section on this](./preview-deployment.md#build-numbers-and-the-prebuild-cache).
This pipeline's `build` job reuses that exact stamping mechanism (the same
`sed` pattern against `android/app/build.gradle`'s `versionCode` line, for
the same reason — a cache hit can restore a version code an earlier run
already baked in), but stamps a different value: the store-derived code from
`version-code` when Google Play is configured, or this run's own
`GITHUB_RUN_NUMBER` — the value `app.config.ts` would already have used —
when it is not. `app.config.ts`'s own `resolveBuildNumber` behaviour is
unchanged by this pipeline; see
[decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md](../decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md)
for why the store, not the run number, is this pipeline's own source.

A Google Play version code is consumed **permanently**: once used for this
package on any track, it can never be reused, and a track refuses a release
whose code is not strictly greater than what it already carries. The maximum
permitted value is **2,100,000,000**; `next_play_version_code` fails loudly
rather than returning a code above it.

## The First-Upload Problem

Google's Play Developer API documentation states that the API can only
change an app that already has at least one artifact uploaded to it. This
project's Android package (`app.axross.juicio`) already exists in the Google
Play Console, and nothing has been uploaded to it yet — which is exactly the
state that constraint bites on. Whether the API genuinely refuses this app's
very first upload, or whether Expo's own documentation (which describes a
first release being created through the same API) turns out to be the
accurate reading instead, is not something either vendor's documentation
settles on its own, and this project has not yet found out empirically.

**Route 1 — attempt the API upload first.** Dispatch the pipeline normally.
If the API accepts the upload, nothing further is needed, and every dispatch
after that goes through the API unchanged.

**Route 2 — the manual fallback, if the API refuses it.** Widely reported by
other projects hitting this exact Google Play Developer API constraint (not
yet confirmed against this project's own Play account) is a rejection
shaped like this, surfaced through fastlane's own error wrapping:

```
Google Api Error: badRequest: Only releases with status draft may be created on draft app.
```

— corresponding to the API's `rolloutNotPermittedOnDraftApp` error reason. If
this pipeline hits it: download the `release-binary-android` artifact from
the run that produced it (retrievable for 7 days — see
[The Stages](#the-stages) above), upload that `.aab` once by hand through the
Play Console (**Testing → Internal testing → Create new release**), and
dispatch the pipeline again. The version code that manual upload consumes
needs no accounting on your part: the next dispatch's `version-code` job
reads it straight back from the track, because the query reports the version
codes of *every* release the track holds — draft, halted, in-progress, and
completed alike, with no status filter — and this pipeline uploads only to
this one track.

**A different rejection — insufficient permission, not a missing first
artifact.** Also widely reported for a freshly granted service account,
shaped like this:

```
Google Api Error: forbidden: The caller does not have permission
```

Community reports on this specific error commonly describe permission
propagation taking up to **36 hours** after a service account is granted
access in the Play Console — not an official Google SLA, but a widely
observed figure. **A first dispatch that fails this way shortly after
granting the service account its permissions is expected, not a
misconfiguration to debug.** Wait and retry before assuming the permission
set itself is wrong. If it still fails well after that window, see
[Service-Account Setup](#service-account-setup) below for the permission set
this pipeline was granted, and the fallback if that set proves insufficient.

These two rejections look different specifically so a maintainer can tell
them apart without guessing: `rolloutNotPermittedOnDraftApp` /
"draft app" names the *app's* state, and it is Route 2 above that resolves
it; "The caller does not have permission" names the *service account's*
state, and waiting out the propagation window (or widening the granted
permission set) is what resolves that one instead.

## Maintainer Setup (Out of Band)

None of this is created by the pipeline; a maintainer performs it once,
before `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` has anything real to hold. Nothing below
is automated, on purpose — see
[decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md](../decisions/2026-09-02-release-google-play-through-existing-fastlane-tooling.md).

### Google Play Console

1. Confirm the app already exists in the Google Play Console under this
   project's Android package name (`app.axross.juicio`, `app.json`'s
   `expo.android.package`) — it does, per this document's own
   [The First-Upload Problem](#the-first-upload-problem) section above.
2. Under **Testing → Internal testing**, create the internal testing track if
   it does not already exist, and enrol testers (individually by email, or
   through a tester list / Google Group) so an uploaded build actually has
   someone able to install it.

### Service-Account Setup

1. In the [Google Cloud console](https://console.cloud.google.com/), in the
   project linked to this app's Play Console account, create a service
   account (**IAM & Admin → Service Accounts → Create Service Account**).
2. Create a JSON key for it (**Keys → Add Key → Create new key → JSON**) and
   download it. Its contents, pasted in verbatim — not base64-encoded — are
   what `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` holds.
3. In the [Play Console's own **Users and permissions**
   page](https://play.google.com/console/users-and-permissions), click
   **Invite new users**, enter that service account's email address (the
   `client_email` field in the downloaded JSON), and grant exactly this
   permission set — the one
   [Expo's own service-account guide](https://expo.fyi/creating-google-service-account)
   names for this API, narrowed to what this pipeline actually needs, and
   nothing wider:
   - **App access:** View app information (read-only)
   - **Draft apps:** Edit and delete draft apps
   - **Releases:** Release apps to testing tracks; Manage testing tracks and
     edit tester lists
   - **Store presence:** Manage store presence
   Deliberately **not** granted: "Release to production, exclude devices, and
   use Play App Signing" — a wider release permission Expo's guide also
   lists, covering production releases this pipeline never makes (see this
   change's non-goals — no promotion beyond internal testing). Grant it only
   if a future change adds a production or closed/open-testing release path.
   Do not grant account-wide administration or financial access either —
   neither is needed for anything this pipeline does.
4. Expect the grant to take time to become effective — see
   [The First-Upload Problem](#the-first-upload-problem) above for how that
   surfaces and what to do about it.
5. Paste the JSON key's contents into the `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
   repository secret (**Settings → Secrets and variables → Actions →
   Secrets**).

**If the permission set above turns out not to cover the edit session the
`version-code` job's read opens** — this pipeline has not yet confirmed that
it does — grant one further permission from the list above and record here
which one was needed, once that is known.

## Dispatching a Release

From the repository's **Actions** tab, select **Android Release**, click
**Run workflow**, and pick the ref to release — no other input is needed. A
release is not gated behind reviewing a pull request's diff the way
dispatching either preview pipeline is (see
[preview-deployment.md's own section on this](./preview-deployment.md#who-may-dispatch-and-what-a-dispatch-executes)):
whoever can dispatch this workflow already has write access to this
repository, and a `workflow_dispatch` run always executes the workflow file
from the ref it is dispatched against — never a ref's own possibly-altered
copy of it.

## Verification

**Nothing in this pipeline has been exercised by dispatching it — not even
its preflight gate.** GitHub only offers `workflow_dispatch` for a workflow
once its file exists on the default branch (see
[preview-deployment.md's own section on exactly this constraint](./preview-deployment.md#dispatching-a-build)),
so `android-release.yaml` cannot be dispatched, from the Actions tab or the
REST API, until after the pull request that adds it merges — the same
constraint that already makes every change to either preview pipeline
untestable on its own pull request. What was checked before this pipeline
merged was therefore its written correctness, not its runtime behaviour: the
workflow file parses as valid YAML, its job graph and `if:` conditions were
worked through by hand against every acceptance scenario named in this
document, and it was reviewed the same way any other change in this
repository is. Its preflight gate, its signed-bundle build with the Play
credential absent, its concurrency behaviour under two near-simultaneous
dispatches, and — separately — its Google Play read and its Google Play
upload (see
[What Has Never Run Against Google Play](#what-has-never-run-against-google-play)
above) are all still open. What a maintainer does next, and what the first
real dispatch must record, is tracked in the follow-up issue linked from the
pull request that introduced this pipeline.
