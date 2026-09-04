---
status: accepted
---

# Release to TestFlight Through This Repository's Existing Fastlane Tooling

Issue #171 asked for an iOS equivalent of `android-release.yaml`: a pipeline
that builds a signed release and uploads it to Apple TestFlight for internal
testing, leaving promotion to an actual public release a manual App Store
Connect step. Several questions had more than one reasonable answer: what
reaches TestFlight at all, where the build number baked into each upload
comes from, how the upload authenticates, which certificate and profile sign
it, and where this pipeline's own scope ends.

## Reaching TestFlight Through Fastlane, Not a Hosted Service

`ios-release.yaml` reaches TestFlight the same way this repository's other
three pipelines already reach their own destinations: GitHub Actions driving
this repository's own fastlane setup (`fastlane/Fastfile`), with fastlane's
first-party `app_store_connect_api_key`, `latest_testflight_build_number`,
and `upload_to_testflight` actions doing the actual API work. No new build or
submit service was adopted to do it.

This reinforces two decisions already recorded, rather than opening either
again:
[operations/agent-skills.md's EAS deviation entry](../operations/agent-skills.md)
states plainly that this project does not use EAS in any form, which rules
out the vendor path most Expo projects take to TestFlight; and
[decisions/2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md](./2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md)
already rejected `fastlane match` in favor of storing the signing
certificate and provisioning profile directly as repository secrets — a
choice this pipeline extends to the new App Store provisioning profile
rather than reopening.

A third-party GitHub Action for the TestFlight upload was rejected on the
same narrower ground
[the Google Play release decision record](./2026-09-02-release-google-play-through-existing-fastlane-tooling.md)
already used: `ios-release.yaml`'s `build-number` and `publish` jobs each
hold the App Store Connect API key; `build` holds the distribution
certificate and the new App Store provisioning profile.
[conventions/security.md](../conventions/security.md) treats a job holding a
signing key or a distribution credential as the highest-exposure position a
third-party action can occupy, and placing one there would have required
pinning it to a full commit SHA and adding new rows to that document's
exposure table for no capability fastlane's own first-party actions do not
already provide from inside this repository's existing tooling.

## Deriving the Build Number From the Store, Not the CI Run Number

`ios-release.yaml`'s `build-number` job reads the highest TestFlight build
number App Store Connect currently reports for the app's current version and
uploads one more than it. This is a different source than either preview
pipeline uses:
[decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md](./2026-08-26-derive-build-numbers-from-the-ci-run-number.md)
records `GITHUB_RUN_NUMBER` as this project's build-number source, and that
decision **still holds** for `android-preview.yaml` and `ios-preview.yaml` —
`app.config.ts`'s `resolveBuildNumber` is unchanged by this pipeline, and
both preview pipelines still stamp `GITHUB_RUN_NUMBER` exactly as before.
This record only exercises, for iOS, the pattern
[the Google Play release decision record](./2026-09-02-release-google-play-through-existing-fastlane-tooling.md)
already named as the one a future TestFlight pipeline should follow rather
than inventing a second scheme: "the same store-queried pattern is available
on the iOS side, through the same release tooling this repository already
uses."

The same two failures that motivated Google Play's own store-queried build
number apply here, in the same shape. Apple requires a build's `CFBundleVersion`
to be strictly greater than any previous build already uploaded for the same
marketing version, and once uploaded a build number cannot be reused for
that version — `GITHUB_RUN_NUMBER` has the same two liabilities against that
constraint as it does against Google Play's: it is tied to one workflow's
identity (a rename resets the counter) and it cannot account for a build
uploaded outside this pipeline. Reading the number back from App Store
Connect sidesteps both, the same way reading it back from Google Play's
internal testing track does.

`latest_testflight_build_number` returns its own `initial_build_number`
parameter unmodified, not `initial_build_number + 1`, when the queried
version has no build yet. `next_testflight_build_number`
(`fastlane/Fastfile`) passes `initial_build_number: 0`, not the action's own
default of `1`, specifically so this pipeline's `+ 1` lands on build number
`1` for this app's very first upload of a version — the same empty-state
handling `next_play_version_code` gives Google Play's own empty track.
Leaving the action's default in place is a documented source of confusion
upstream ([fastlane/fastlane#19988](https://github.com/fastlane/fastlane/issues/19988)):
the first-ever build for a version would otherwise silently start at `2`.

## Authenticating With an App Store Connect API Key, Not an Apple ID

`app_store_connect_api_key` (a `.p8` private key, its Key ID, and its Issuer
ID) authenticates every App Store Connect call this pipeline makes, rather
than an Apple ID and an app-specific password. This is fastlane's own
recommended method for CI use — it needs no interactive two-factor session
tied to one person's Apple ID, and it can be scoped to just the App Store
Connect API rather than a full account. [Verified against fastlane's own
App Store Connect API documentation](https://docs.fastlane.tools/app-store-connect-api/)
and confirmed functional against this project's exact pinned fastlane
version (2.238.0, per `Gemfile.lock`): `app_store_connect_api_key`,
`latest_testflight_build_number`, and `upload_to_testflight` all exist and
accept the parameters `fastlane/Fastfile`'s new lanes pass them, checked with
`bundle exec fastlane action <name>` against the installed gem rather than
against documentation alone.

The API key's role governs what this pipeline needs from it. App Store
Connect's own **Developer** role — the narrowest of its named roles that can
touch TestFlight at all — is enough to upload a build and to query existing
build numbers; a broader **App Manager** role is only needed to update build
metadata or manage testers after upload, and specifically to do so
immediately after upload rather than waiting for Apple's own build
processing to finish. `publish_to_testflight` passes
`skip_waiting_for_build_processing: true` (see
[Ending This Pipeline's Scope at the TestFlight Upload](#ending-this-pipelines-scope-at-the-testflight-upload)
below), which removes even that narrower need — pilot's own documentation
states that with this set, no build is distributed to testers regardless of
other settings, so the App Manager capability is never exercised. The
Developer role is therefore what
[ios-testflight-release.md](../operations/ios-testflight-release.md)'s
Maintainer Setup section directs a maintainer to grant, matching this
project's existing preference for narrowing a granted permission set to
exactly what a pipeline uses (see
[google-play-release.md](../operations/google-play-release.md#service-account-setup)'s
own Service-Account Setup section for the reasoning). This has not been
exercised against a real App Store Connect account — see this pipeline's own
"What Has Never Run" section.

## Reusing the Existing Distribution Certificate, and Adding a New App Store Provisioning Profile

`ios-release.yaml`'s `build` job imports the same `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`
/ `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` certificate `ios-preview.yaml`'s
own `build` job already imports, rather than generating or storing a second
one. Apple's current unified certificate model issues one "Apple
Distribution" certificate type that covers both ad-hoc and App Store export;
introducing a second certificate for the same team would duplicate
credential-rotation surface for a distinction Apple's own tooling no longer
draws.

The provisioning profile is not reused, and could not be: TestFlight
requires a build signed against an **App Store** distribution profile, and
the ad-hoc profile `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` holds is
restricted to the device UDIDs registered in it — a shape TestFlight refuses
outright, regardless of which certificate signs the build. A new secret,
`APPLE_APP_STORE_PROVISIONING_PROFILE_BASE64`, holds it, validated the same
way — decoding its signed payload and confirming the bundle identifier it
was issued for — the ad-hoc profile already is.

## Ending This Pipeline's Scope at the TestFlight Upload

`publish_to_testflight` (`fastlane/Fastfile`) uploads the signed IPA and
stops there: `distribute_external` is left at its own default (`false`), no
`groups:` is passed, and `skip_waiting_for_build_processing: true` is set.
The upload lands in App Store Connect's Builds list, available for a
maintainer to assign to a tester group and, separately, submit for Beta App
Review by hand — neither of which this pipeline does. This matches the
original request's own stated scope (issue #171: "TestFlightへの配信後、本リリースは
人間が手作業でApp Store Connect上で行う想定です" — after delivery to TestFlight, the
actual release is expected to be a manual human step in App Store Connect)
and the shape `android-release.yaml` already takes for Google Play: this
pipeline uploads to the internal-testing-equivalent surface and stops, never
reaching an actual public release on its own.

`skip_waiting_for_build_processing: true` additionally bounds the `publish`
job's own runtime: Apple's build processing after upload can run well past
an hour, and waiting for it inside this job's `timeout-minutes` would make
that budget describe Apple's own processing time rather than this pipeline's
actual work.

## Timeout Projections

Every `timeout-minutes` value in `ios-release.yaml` was set on
[conventions/continuous-integration.md](../conventions/continuous-integration.md)'s
fixed ladder, and every one of them is a **projection**, not a measurement:
this workflow has never run, so none of its jobs has a duration of its own
to derive a value from. Each was instead projected from the closest
analogous job already running in `ios-preview.yaml` or `android-release.yaml`,
doubled the same way a real measurement would be and raised to the same
ladder rung that analogous job already carries, since no better basis exists
yet:

| `ios-release.yaml` job | Work | Modelled on | Value |
| --- | --- | --- | --- |
| `preflight` | Scripted checks and two `node -p` reads against `app.json` — no API call to make | `android-release.yaml`'s `preflight` (5, itself a projection for the equivalent job) | 5 (the ladder's smallest rung) |
| `build-number` | Ruby/bundler install plus one App Store Connect API call | `android-release.yaml`'s `version-code` (15, unmeasured — the same Ruby-setup-plus-one-API-call shape) | 15 |
| `prebuild` | `npm ci` plus a bare `expo prebuild --platform ios`, cached | `ios-preview.yaml`'s `prebuild` (15) — identical work | 15 |
| `build` | Certificate and provisioning-profile setup, a CocoaPods install, and a signed `xcodebuild archive` with a Sentry source-map upload, on `macos-latest` | `ios-preview.yaml`'s `build` (60) — the same work, for an App Store export instead of an ad-hoc one, not materially more of it | 60 |
| `publish` | Credential write/validation plus one TestFlight upload (not waiting for Apple's own build processing — see [Ending This Pipeline's Scope at the TestFlight Upload](#ending-this-pipelines-scope-at-the-testflight-upload) above) | `android-release.yaml`'s `publish` (15) — the same shape, a different destination | 15 |

`build`'s value is a documented exception to the doubling formula
[conventions/continuous-integration.md](../conventions/continuous-integration.md)
otherwise requires: `ios-preview.yaml`'s own `build` job is already at 60,
the ladder's largest rung, so doubling it (120) has no covering rung above
it to raise to. This value is therefore left at the ladder's ceiling rather
than exceeding it — a mechanical resolution of a gap that convention's own
derivation rule leaves open once a model job is already at the top rung,
not a claim that 60 minutes was independently measured or re-derived for
this job.

This is a weaker basis than a real measurement, and it is recorded as such
rather than presented as one — the same caveat
[the Google Play release decision record's own Timeout Projections section](./2026-09-02-release-google-play-through-existing-fastlane-tooling.md#timeout-projections)
states for its own values. Each value above stands until this pipeline has
run enough times on its own runner to replace it with a measured one.
