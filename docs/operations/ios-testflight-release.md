# iOS TestFlight Release

How this project builds a signed, App Store-exported IPA and uploads it to
Apple TestFlight — the one pipeline,
[`ios-release.yaml`](../../.github/workflows/ios-release.yaml), the secrets
it needs, the one-time App Store Connect setup a maintainer performs before
it can publish anything, and which parts of it have never run against App
Store Connect.

This is the release-shaped path this project has for iOS. It stops at
TestFlight: no Beta App Review submission, no tester group assignment, and
no App Store release — assigning testers, submitting for review, and any
actual public release stay manual App Store Connect actions. It reuses the
same fastlane-driven, no-EAS approach
[`preview-deployment.md`](./preview-deployment.md) documents for the two
preview pipelines and
[`google-play-release.md`](./google-play-release.md) documents for the
Android release pipeline, and shares several composite actions under
[`.github/actions/`](../../.github/actions) with all three — but it is
otherwise independent: dispatching this workflow neither reads nor changes
anything about how `android-preview.yaml`, `ios-preview.yaml`, or
`android-release.yaml` behave. See
[decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md](../decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md)
for why this pipeline is built on the same tooling rather than a hosted
service, why its build number comes from a different source than the
preview pipelines' own, why it authenticates with an App Store Connect API
key, and why its `build` job's timeout stays at this project's timeout
ladder's ceiling rather than doubling past it.

## What Remains Unverified Against App Store Connect

This pipeline's first real dispatch (run
[33838314320](https://github.com/axross/juicio/actions/runs/33838314320),
2026-09-04) reached App Store Connect and confirmed several things this
section used to list as unverified, and a second dispatch (run
[33855345323](https://github.com/axross/juicio/actions/runs/33855345323),
2026-09-04, after [#184](https://github.com/axross/juicio/pull/184) merged)
confirmed most of the rest: `publish` now completes end-to-end, and
fastlane's own job log confirms the upload call to App Store Connect
succeeded for build `1` of version `0.1.0`. **State plainly what is still
unverified after both, before anything else:** two things — whether
`next_testflight_build_number` increments correctly on a dispatch that
follows one that already landed a build for the same version, and whether
that upload is actually visible in App Store Connect's own TestFlight
Builds list, since every confirmation so far comes from fastlane's own CI
job log output rather than from App Store Connect's UI or API directly.

Concretely, still unverified:

- **The build-number increment past a build that already landed.**
  `next_testflight_build_number` computed build `1` on both the first
  dispatch (which crashed before uploading) and the second (which
  succeeded) — App Store Connect reported a maximum of `0` for version
  `0.1.0` both times, since no build had landed yet. Whether it correctly
  computes build `2` once App Store Connect actually reports a maximum of
  `1` is unverified until a further dispatch for the same version confirms
  it.
- **Visibility in App Store Connect's own TestFlight Builds list.** Issue
  [#187](https://github.com/axross/juicio/issues/187)'s acceptance criteria
  ask for the upload to be "confirmed visible in App Store Connect's
  TestFlight Builds list," not merely for the `publish` job to exit
  successfully. Every confirmation this document makes below comes from
  fastlane's own CI job log text (`Successfully uploaded package to App
  Store Connect`, `Uploaded to TestFlight: dist/juicio-release.ipa`), which
  is evidence the upload API call succeeded, not independent confirmation
  from App Store Connect's own UI or API that the resulting build appears
  in its TestFlight Builds list. That check needs a maintainer with App
  Store Connect access and remains open.

What the two dispatches together confirmed, and no longer belongs on the
unverified list above:

- **The `build-number` job's App Store Connect read.**
  `bundle exec fastlane ios next_testflight_build_number` executed
  successfully against a real App Store Connect account, logging `Next
  TestFlight build number: 1 (App Store Connect currently reports a maximum
  of 0 for version 0.1.0)` — including the empty-state handling
  (`initial_build_number: 0`) landing on build `1` for this app's very first
  upload, exactly as designed.
- **The API key's role.** The **Developer** role
  [Maintainer Setup](#maintainer-setup-out-of-band) below grants is
  confirmed sufficient for both operations this pipeline performs: the
  `build-number` read completed with no permission error, and the second
  dispatch's `publish` job completed a full, successfully authorized upload.
  See
  [the decision record's own section on this](../decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md#authenticating-with-an-app-store-connect-api-key-not-an-apple-id)
  for the full account.
- **A complete, successful `publish` job run.** The second dispatch's
  `publish` job, on `macos-latest` (see
  [The `publish` Job Now Runs on `macos-latest`](#the-publish-job-now-runs-on-macos-latest)
  below), logged `Successfully uploaded package to App Store Connect`,
  `Successfully uploaded the new binary to App Store Connect`, and `Uploaded
  to TestFlight: dist/juicio-release.ipa` — fastlane's own upload call to
  App Store Connect completed for the first time. This confirms the CI job
  succeeded; it does not by itself confirm the build is visible in App
  Store Connect's TestFlight Builds list — see the still-unverified bullet
  above.
- **`skip_waiting_for_build_processing: true`'s own effect on the job's
  runtime.** The second dispatch's `upload_to_testflight` step logged
  `` `skip_waiting_for_build_processing` used and no `changelog` supplied -
  skipping waiting for build processing `` and returned in 105 seconds,
  confirming the job does not block on Apple's own build-processing time.
  Whether it also guarantees no external distribution, as pilot's own
  documentation separately claims, is not something a CI log can observe —
  that half of the claim stands on fastlane's own documentation, as it did
  before either dispatch, not on anything this pipeline's runs have shown
  directly.

What has additionally been verified, without needing App Store Connect
itself, is the rest of the pipeline's shape: the workflow file parses as
valid YAML; the Fastfile parses as valid Ruby and loads correctly under this
project's pinned fastlane version (`bundle exec fastlane lanes` lists
`build_release`, `next_testflight_build_number`, and
`publish_to_testflight` alongside every existing lane, with no load error);
the three App Store Connect actions this pipeline calls
(`app_store_connect_api_key`, `latest_testflight_build_number`,
`upload_to_testflight`) exist in that exact pinned version and accept every
parameter the new lanes pass them, confirmed with `bundle exec fastlane
action <name>` against the installed gem; and that `preflight` fails
correctly and completely when a required secret is absent, worked through
by hand against every acceptance scenario this pipeline's plan named. See
this document's own [Verification](#verification) section for exactly what
was exercised and how.

## The `publish` Job Now Runs on `macos-latest`

The first dispatch's `publish` job reached App Store Connect and started its
upload, then crashed with `Errno::ENOENT: No such file or directory @
dir_chdir0` — a known, unresolved fastlane limitation on non-macOS runners
(fastlane/fastlane
[#12411](https://github.com/fastlane/fastlane/issues/12411),
[#14256](https://github.com/fastlane/fastlane/issues/14256),
[#15895](https://github.com/fastlane/fastlane/issues/15895),
[#16996](https://github.com/fastlane/fastlane/issues/16996)), not a defect
in this pipeline's own credentials, role grant, or configuration. See
[the decision record's own section on this](../decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md#the-first-dispatchs-publish-failure-was-a-linuxfastlane-platform-defect-not-a-credential-problem)
for the root cause traced against the pinned fastlane gem source. The fix —
already reflected everywhere else in this document — is that `publish` now
runs on `macos-latest`, the same runner `build` already uses, rather than
`ubuntu-latest`. A second dispatch (run
[33855345323](https://github.com/axross/juicio/actions/runs/33855345323),
2026-09-04) confirmed the fix works: `publish` ran to completion with no
platform-related error, and fastlane's own log confirms the upload call to
App Store Connect succeeded — see
[What Remains Unverified Against App Store Connect](#what-remains-unverified-against-app-store-connect)
above for what that log evidence does and does not confirm.

## The Stages

`ios-release.yaml` runs five jobs, in dependency order:

1. **Preflight** (`ubuntu-slim`). Resolves the Apple distribution
   certificate, its password, the new App Store provisioning profile, and
   the Apple Developer team ID to booleans, in one step, and writes a
   configuration table to the run summary before deciding anything — see
   [The Preflight Gate](#the-preflight-gate) below. The same step separately
   resolves the App Store Connect API key set (`APPLE_APP_STORE_CONNECT_API_KEY_BASE64`,
   `APPLE_APP_STORE_CONNECT_KEY_ID`, `APPLE_APP_STORE_CONNECT_ISSUER_ID`)
   and the optional Sentry set (`SENTRY_ORG`, `SENTRY_PROJECT`,
   `SENTRY_AUTH_TOKEN`), each to its own boolean. Also resolves the release
   version name and the iOS bundle identifier, both read directly from
   `app.json`, and outputs all of it — `version-name`, `bundle-identifier`,
   `app-store-connect-configured`, `sentry-configured` — for every later job
   to read.
2. **Build Number** (`ubuntu-latest`). Runs only when App Store Connect is
   configured. Writes the App Store Connect API key to a file outside the
   working tree, validates it, and runs `bundle exec fastlane ios
   next_testflight_build_number`, which reads the highest TestFlight build
   number App Store Connect currently reports for the app's current version
   and returns one more than it — see
   [The Build-Number Rule](#the-build-number-rule) below.
3. **Prebuild** (`ubuntu-latest`). Installs dependencies and runs `expo
   prebuild --platform ios --no-install`, cached the same way
   `ios-preview.yaml`'s own `prebuild` job is — see that document's
   [Prebuild and CocoaPods Caching](./preview-deployment.md#prebuild-and-cocoapods-caching)
   section for the caching mechanics, which this job shares. It also resolves
   the Sentry release string the same way `ios-preview.yaml`'s `prebuild`
   job does — see
   [preview-deployment.md's "Sentry Source-Map Upload"](./preview-deployment.md#sentry-source-map-upload-optional)
   — and outputs it as `sentry-release`. The generated `ios/` directory is
   archived as a tar file and uploaded as an artifact.
4. **Build** (`macos-latest`). Downloads and extracts the `prebuild`
   artifact, imports the Apple distribution certificate into a throwaway
   keychain (the same certificate and the same steps
   `ios-preview.yaml`'s own `build` job already uses — Apple's unified
   certificate model covers both ad-hoc and App Store export with one
   certificate type), installs the App Store provisioning profile (a
   separate secret from the ad-hoc one — see
   [Why This Workflow Differs From the Preview Pipelines](#why-this-workflow-differs-from-the-preview-pipelines)
   below), stamps a build number into `ios/juicio/Info.plist`'s
   `CFBundleVersion` — the App Store Connect-derived one from `build-number`
   when it is configured, or this run's own `GITHUB_RUN_NUMBER` otherwise —
   and runs `bundle exec fastlane ios build_release`, which assembles a
   **signed, App Store-exported IPA** (`build_app` with `export_method:
   "app-store"`) rather than the ad-hoc IPA `ios-preview.yaml` produces. The
   Sentry Xcode build-phase script `expo prebuild` wires in rides inside
   that same `xcodebuild archive` — this job passes it the Sentry set
   `preflight` resolved (and `SENTRY_DISABLE_AUTO_UPLOAD` when that set is
   incomplete, so the build never depends on it), the same mechanism
   [preview-deployment.md's "Sentry Source-Map Upload"](./preview-deployment.md#sentry-source-map-upload-optional)
   describes. The resulting `.ipa` is uploaded as a run artifact with
   **7-day retention** — longer than `ios-preview.yaml`'s 1-day retention on
   its own equivalent artifact, because this one may be the thing a
   maintainer comes back for once App Store Connect is configured, not only
   a same-run hand-off to the next job.
5. **Publish** (`macos-latest`). Runs only when App Store Connect is
   configured and both `build-number` and `build` actually succeeded.
   Downloads the signed IPA, writes and validates the App Store Connect API
   key again (this job is a separate runner from `build-number`, so the
   same credential is written and validated twice, not once), and runs
   `bundle exec fastlane ios publish_to_testflight`, which uploads the IPA
   to TestFlight without submitting it for Beta App Review or assigning it
   to any tester group — see
   [Ending This Pipeline's Scope at the TestFlight Upload](../decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md#ending-this-pipelines-scope-at-the-testflight-upload)
   in the decision record for why. The run summary states the version name
   and the build number.

Signing is not reinvented anywhere in this pipeline: the same "Apple
Distribution" certificate `ios-preview.yaml` already imports is imported the
same way here. Only the provisioning profile differs, because TestFlight
requires an App Store distribution profile that the ad-hoc profile cannot
substitute for.

## Why This Workflow Differs From the Preview Pipelines

`ios-release.yaml` is modelled closely on `ios-preview.yaml`'s `build`
job — the certificate import, the provisioning-profile validation, the
CocoaPods caching — and on `android-release.yaml`'s overall job shape, but
differs in ways the release use case requires:

- **Trigger.** `workflow_dispatch` with no inputs. The dispatcher picks the
  ref to release directly in the Actions UI; there is no pull request to
  name, so there is nothing analogous to `ios-preview.yaml`'s
  `pull-request-number` input or its **Verify Pull Request Origin** step.
  Every job's default checkout (no `ref:` override) and the ambient
  `github.sha` / `GITHUB_SHA` already name the ref this run was dispatched
  against — so, unlike `ios-preview.yaml`, no job here threads a `head-sha`
  output of its own.
- **Concurrency.** `cancel-in-progress: false`, the opposite of
  `ios-preview.yaml`'s `cancel-in-progress: true` — see
  [Why Cancellation Is Unsafe Here](#why-cancellation-is-unsafe-here) below.
- **Output.** An App Store-exported IPA (`export_method: "app-store"`), not
  the ad-hoc IPA `ios-preview.yaml`'s `build` lane produces — TestFlight
  refuses an ad-hoc build regardless of which certificate signs it.
- **The provisioning profile.** A new secret,
  `APPLE_APP_STORE_PROVISIONING_PROFILE_BASE64`, rather than
  `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` — see the decision record's own
  section on this.
- **An extra stage.** The `build-number` job has no analogue in either
  preview pipeline; it exists because the build number has to be settled
  before the IPA is built, since it is compiled into the artifact.
- **The destination.** Apple TestFlight, through fastlane's
  `upload_to_testflight` action, rather than Firebase App Distribution
  through `firebase_app_distribution`.
- **What a missing credential does.** A missing Apple signing secret fails
  `preflight` outright, exactly as `ios-preview.yaml`'s own required set
  does. A missing App Store Connect credential does not: `preflight` still
  passes, the IPA still gets built, and only the `build-number` and
  `publish` jobs are skipped — see
  [The Preflight Gate](#the-preflight-gate) below for why this pipeline
  draws that line differently from the preview pipelines' single
  all-or-nothing gate — the same shape `android-release.yaml` already takes
  for a missing Google Play credential.

## Why Cancellation Is Unsafe Here

`ios-preview.yaml` cancels an in-flight run when a new one is dispatched for
the same pull request (`cancel-in-progress: true`), and says why in its own
`concurrency:` comment: a cancellation landing after an external call
returns but before the job finishes can leave that call's effect in place
with nothing in the run's own output to say so. This pipeline avoids a
sharper version of the same problem, in a different shape than
`android-release.yaml`'s: App Store Connect carries no single-open-edit
constraint of its own to collide on, but two runs computing "next TestFlight
build number" from the same App Store Connect state before either has
uploaded would independently compute the *same* next build number — and the
second upload then collides with the first, since Apple refuses to reuse a
build number for the same version. `cancel-in-progress: false` is what keeps
that from happening: a second dispatch queues behind the first rather than
racing it, the same policy `android-release.yaml` adopts for the same class
of reason.

## The Preflight Gate

`preflight`'s **Resolve Required Configuration** step resolves ten things to
a boolean each — the Apple distribution certificate, its password, the App
Store provisioning profile, the Apple Developer team ID, the three App
Store Connect entries, and the three optional Sentry entries — and writes
all ten to one table in the run summary naming what is present, never a
value, before deciding anything. It draws two different lines through the
seven required-or-optional entries in that table, not one:

- **Missing the certificate, its password, the provisioning profile, or the
  team ID fails the run outright**, the same way `ios-preview.yaml`'s own
  preflight does: the log names every missing entry by name with one
  `::error::` annotation, and nothing after `preflight` runs.
- **Missing any of the three App Store Connect entries does not fail the
  run.** It emits an `::warning::` instead, and outputs
  `app-store-connect-configured=false` for every later job to read.
  `prebuild` and `build` are unconditional on that output — the IPA gets
  built regardless — while `build-number` and `publish` are each
  conditioned on it and are skipped.

This is a deliberate difference from the preview pipelines' single
all-or-nothing gate, not a relaxation of it applied inconsistently — the
same shape `android-release.yaml` already takes for a missing Google Play
credential. It exists to serve the same acceptance requirement: a run with
the signing secrets present and the App Store Connect credential absent
still has to leave a signed, retrievable IPA behind, because a maintainer
can upload that IPA through App Store Connect's own web UI or through
Transporter by hand once the credential is configured. A signing secret has
no equivalent fallback path, so it stays in the all-or-nothing set.

Sentry configuration (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) is
optional here too, the same way it already is for the other three
pipelines: `preflight` writes its three rows into that same table, but
resolves whether it passes independently of the required entries above — a
missing Sentry entry only warns and skips the `build` job's source-map
upload, never joins the `missing` list that fails the run. See
[preview-deployment.md's "Sentry Source-Map Upload"](./preview-deployment.md#sentry-source-map-upload-optional)
for the mechanism and
[secrets.md's "Sentry Source-Map Upload"](./secrets.md#sentry-source-map-upload)
for the credentials table.

## The Build-Number Rule

```
next_build_number = (highest TestFlight build number App Store Connect reports for this version) + 1
                    # or 1 when App Store Connect reports no build for this version yet
```

`next_testflight_build_number` (`fastlane/Fastfile`) computes this with
fastlane's `latest_testflight_build_number` action, scoped to the app's
current marketing version (`app.json`'s `expo.version`) — Apple's build
number uniqueness constraint applies per version string, not globally, so a
version bump is free to restart from a low build number. The action itself
returns its own `initial_build_number` parameter unmodified — never
`initial_build_number + 1` — when the queried version has no build yet;
`next_testflight_build_number` passes `initial_build_number: 0` specifically
so the `+ 1` this lane applies afterward lands on `1` for this app's very
first upload of a version, not `2`. See the decision record's own section
on this for why the action's own default (`1`) is a documented source of
confusion left uncorrected.

This differs from how both preview pipelines derive their own build
numbers: `android-preview.yaml` and `ios-preview.yaml` stamp
`GITHUB_RUN_NUMBER` directly, unconditionally, to defeat a stale
prebuild-cache hit — see
[preview-deployment.md's own section on this](./preview-deployment.md#build-numbers-and-the-prebuild-cache).
This pipeline's `build` job reuses that exact stamping mechanism (the same
`PlistBuddy` call against `ios/juicio/Info.plist`'s `CFBundleVersion`, for
the same reason — a cache hit can restore a build number an earlier run
already baked in), but stamps a different value: the store-derived number
from `build-number` when App Store Connect is configured, or this run's own
`GITHUB_RUN_NUMBER` — the value `app.config.ts` would already have used —
when it is not. `app.config.ts`'s own `resolveBuildNumber` behaviour is
unchanged by this pipeline; see
[decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md](../decisions/2026-09-04-release-to-testflight-through-existing-fastlane-tooling.md)
for why the store, not the run number, is this pipeline's own source.

## Maintainer Setup (Out of Band)

None of this is created by the pipeline; a maintainer performs it once,
before `APPLE_APP_STORE_CONNECT_API_KEY_BASE64` has anything real to hold.
The Apple Developer Program membership and the "Apple Distribution"
certificate are already covered by
[preview-deployment.md's own Maintainer Setup section](./preview-deployment.md#maintainer-setup-out-of-band)
— this pipeline reuses both rather than creating either again. What follows
is only what this pipeline adds.

### App Store Provisioning Profile

Generate an **App Store** distribution provisioning profile (not ad-hoc) for
this project's bundle identifier (`app.axross.juicio`, `app.json`'s
`expo.ios.bundleIdentifier`), against the same "Apple Distribution"
certificate `preview-deployment.md` already directs a maintainer to create,
in the [Apple Developer portal](https://developer.apple.com/account/resources/profiles/list)
under **Certificates, Identifiers & Profiles → Profiles**. Its
base64-encoded contents become `APPLE_APP_STORE_PROVISIONING_PROFILE_BASE64`:

```sh
base64 your-app-store-profile.mobileprovision | tr -d '\n' > profile.b64
```

Paste `profile.b64`'s contents into the secret exactly as produced.

### App Store Connect API Key

1. In [App Store Connect](https://appstoreconnect.apple.com/), under **Users
   and Access → Integrations → App Store Connect API** (the **Team Keys**
   tab), click the add button and create a new key.
2. Grant it the **Developer** role — the narrowest role that can upload a
   build and query existing build numbers. A broader **App Manager** role is
   only needed to update build metadata or manage testers immediately after
   upload, neither of which this pipeline does (`publish_to_testflight`
   passes `skip_waiting_for_build_processing: true`, which the decision
   record's own section on this explains removes even that narrower need).
3. Download the generated `.p8` key file immediately — **App Store Connect
   allows downloading it only once, at creation time.** If it is lost,
   revoke the key and generate a new one; there is no way to re-download an
   existing key's file.
4. Its base64-encoded contents become `APPLE_APP_STORE_CONNECT_API_KEY_BASE64`:

   ```sh
   base64 your-AuthKey.p8 | tr -d '\n' > api-key.b64
   ```

   Paste `api-key.b64`'s contents into the secret exactly as produced.
5. The Key ID shown next to the key becomes the `APPLE_APP_STORE_CONNECT_KEY_ID`
   repository variable; the Issuer ID shown at the top of the same Integrations
   page (shared across every key in the account) becomes
   `APPLE_APP_STORE_CONNECT_ISSUER_ID`.

**The Developer role is confirmed sufficient** for this pipeline's own
`build-number` read and `publish` upload — this project's first real
dispatch reached both with no authorization failure; see
[What Remains Unverified Against App Store Connect](#what-remains-unverified-against-app-store-connect)
above for the full account. No broader role grant is needed.

## Dispatching a Release

From the repository's **Actions** tab, select **iOS Release**, click **Run
workflow**, and pick the ref to release — no other input is needed. A
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
so `ios-release.yaml` cannot be dispatched, from the Actions tab or the REST
API, until after the pull request that adds it merges — the same constraint
that already makes every change to either preview pipeline or to
`android-release.yaml` untestable on its own pull request. What was checked
before this pipeline merged was therefore its written correctness, not its
runtime behaviour:

- The workflow file parses as valid YAML.
- `fastlane/Fastfile` parses as valid Ruby (`ruby -c`) and, more than a
  syntax check, actually **loads under this project's exact pinned fastlane
  version** (`bundle exec fastlane lanes`, run against a real `bundle
  install` of `Gemfile.lock`): every existing lane still lists correctly,
  and the three new `:ios` lanes (`build_release`,
  `next_testflight_build_number`, `publish_to_testflight`) register with no
  load error.
- The three App Store Connect actions the new lanes call
  (`app_store_connect_api_key`, `latest_testflight_build_number`,
  `upload_to_testflight`) were confirmed to exist in that exact pinned
  version and to accept every parameter passed to them, with `bundle exec
  fastlane action <name>` run against the installed gem rather than taken
  from documentation alone — including confirming that `export_method:
  "app-store"` (not the newer `"app-store-connect"` name recent Xcode
  versions advertise) is the value this pinned fastlane version's own
  `export_method` option still validates against.
- The job graph and every `if:` condition were worked through by hand
  against every acceptance scenario this pipeline's plan named, and the
  change was reviewed the same way any other change in this repository is.

This described the state at the point this pipeline merged: its preflight
gate, its signed-IPA build with the App Store Connect credential absent, its
concurrency behaviour under two near-simultaneous dispatches, and its App
Store Connect build-number read and TestFlight upload were all still open,
tracked in the follow-up issue (#173) linked from the pull request that
introduced this pipeline. That issue's dispatch, and the follow-up dispatch
issue [#187](https://github.com/axross/juicio/issues/187) tracked after it,
have since exercised the build-number read and, per fastlane's own job log,
completed the upload call to App Store Connect — see
[What Remains Unverified Against App Store Connect](#what-remains-unverified-against-app-store-connect)
above for exactly what they confirmed, and what still remains open.
