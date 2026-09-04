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
own Service-Account Setup section for the reasoning). **This is now
confirmed**, not merely assumed by construction: this pipeline's first real
dispatch (run
[33838314320](https://github.com/axross/juicio/actions/runs/33838314320),
2026-09-04) reached both operations the Developer role has to cover. The
`build-number` job's `latest_testflight_build_number` read completed with no
permission error, logging `Next TestFlight build number: 1 (App Store
Connect currently reports a maximum of 0 for version 0.1.0)`. The `publish`
job's log shows `Creating authorization token for App Store Connect API`,
`Ready to upload new build to TestFlight (App: 6808004988)...`, and `Going
to upload updated app to App Store Connect` — the upload itself was already
under way, past every point an insufficient role would have rejected it,
when the job crashed on an unrelated platform defect (see
[The First Dispatch's `publish` Failure Was a Linux/fastlane Platform Defect, Not a Credential Problem](#the-first-dispatchs-publish-failure-was-a-linuxfastlane-platform-defect-not-a-credential-problem)
below). See this pipeline's own
[What Has Never Run Against App Store Connect](../operations/ios-testflight-release.md#what-has-never-run-against-app-store-connect)
section for what this dispatch still leaves unverified.

## The First Dispatch's `publish` Failure Was a Linux/fastlane Platform Defect, Not a Credential Problem

The first dispatch's `publish` job crashed after the upload had already
started (see above), with `Errno::ENOENT: No such file or directory @
dir_chdir0`. This traces to a runner-platform gap in the pinned fastlane
gem, not to anything this pipeline configures or supplies.

`upload_to_testflight` routes through pilot, which hands the actual upload
to `FastlaneCore::ItunesTransporter`. Its Java-based execution path
(`fastlane_core/itunes_transporter.rb:730`, `JavaTransporterExecutor#execute`)
runs `FileUtils.cd(Helper.itms_path) do` before invoking the transporter.
`Helper.itms_path`
(`fastlane_core/helper.rb:234-262`) branches on `Helper.mac?` and
`Helper.windows?`; on neither platform — every Linux runner, `ubuntu-latest`
included — it falls through to its final `else` and returns `''`
(`helper.rb:259-262`). `FileUtils.cd('')` is exactly what raises
`Errno::ENOENT`, since an empty string names no directory to change into.

Fastlane's own newer `AltoolTransporterExecutor` has no such gap — it shells
out to Apple's `altool`/`notarytool` rather than the legacy Java transporter
— but `should_use_altool?` (`itunes_transporter.rb:993-996`) only selects it
when `Helper.mac?` is also true:

```ruby
def should_use_altool?(altool_compatible_command, use_shell_script)
  # Xcode 14 no longer supports iTMSTransporter. Use altool instead
  !use_shell_script && altool_compatible_command && !Helper.user_defined_itms_path? && Helper.mac? && Helper.xcode_at_least?(14)
end
```

On `ubuntu-latest`, `Helper.mac?` is false regardless of every other
condition, so this branch is never taken and the broken `itms_path` path is
the only one left — with no App Store Connect credential, role, or fastlane
configuration able to avoid it. All three line numbers above were confirmed
directly against this project's pinned `fastlane-2.238.0` gem source (the
same version `Gemfile.lock` pins and
["Authenticating With an App Store Connect API Key, Not an Apple ID"](#authenticating-with-an-app-store-connect-api-key-not-an-apple-id)
above already verified other claims against), not taken from documentation
or a changelog.

This is a known, unresolved, multi-year limitation of fastlane's Java-based
transporter on non-Apple platforms, not a defect specific to this project:
see fastlane/fastlane
[#12411](https://github.com/fastlane/fastlane/issues/12411),
[#14256](https://github.com/fastlane/fastlane/issues/14256),
[#15895](https://github.com/fastlane/fastlane/issues/15895), and
[#16996](https://github.com/fastlane/fastlane/issues/16996). `publish` was
modelled directly on `android-release.yaml`'s own `publish` job, a pure HTTP
call to Google Play with no such platform constraint — Apple's TestFlight
upload has no equivalent platform-agnostic path in this project's pinned
fastlane version.

The fix is to run `publish` on `macos-latest` instead of `ubuntu-latest`,
the same runner `build` already uses: with `Helper.mac?` true and the
`setup-xcode` step already provisioning Xcode 14+, `should_use_altool?`
evaluates true and the upload routes through `AltoolTransporterExecutor`,
never reaching the broken `itms_path` branch. No other step in `publish` is
Linux-specific, and no change to `fastlane/Fastfile`'s
`publish_to_testflight` lane is needed. This reverses this record's own
[Timeout Projections](#timeout-projections) table, which had assumed only
`build` needed a macOS runner and priced `publish` as a Linux job — see that
section, updated alongside this one.

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
| `publish` | Credential write/validation plus one TestFlight upload, on `macos-latest` (not waiting for Apple's own build processing — see [Ending This Pipeline's Scope at the TestFlight Upload](#ending-this-pipelines-scope-at-the-testflight-upload) above) | `android-release.yaml`'s `publish` (15) — the same shape, a different destination | 15 |

`build`'s value is a documented exception to the doubling formula
[conventions/continuous-integration.md](../conventions/continuous-integration.md)
otherwise requires: `ios-preview.yaml`'s own `build` job is already at 60,
the ladder's largest rung, so doubling it (120) has no covering rung above
it to raise to. This value is therefore left at the ladder's ceiling rather
than exceeding it — a mechanical resolution of a gap that convention's own
derivation rule leaves open once a model job is already at the top rung,
not a claim that 60 minutes was independently measured or re-derived for
this job.

`publish`'s value is likewise carried over unchanged, not re-derived, from
when this table was first written against a `ubuntu-latest` projection: the
first dispatch showed `publish` has to run on `macos-latest` instead (see
[The First Dispatch's `publish` Failure Was a Linux/fastlane Platform
Defect, Not a Credential Problem](#the-first-dispatchs-publish-failure-was-a-linuxfastlane-platform-defect-not-a-credential-problem)
above), reversing this table's own original assumption that only `build`
needed a macOS runner, but that dispatch's `publish` job still failed
before the upload completed — before anything about this job's own runtime
on macOS could be measured. 15 minutes stays a reasonable ceiling for this
job's actual work (download the artifact, write the credential, upload the
IPA) on either runner; no better timing basis exists yet.

This is a weaker basis than a real measurement, and it is recorded as such
rather than presented as one — the same caveat
[the Google Play release decision record's own Timeout Projections section](./2026-09-02-release-google-play-through-existing-fastlane-tooling.md#timeout-projections)
states for its own values. Each value above stands until this pipeline has
run enough times on its own runner to replace it with a measured one.
