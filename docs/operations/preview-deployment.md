# Preview Deployment

How this project builds and distributes an Android or iOS preview build for a
pull request — the two pipelines,
[`android-preview.yaml`](../../.github/workflows/android-preview.yaml) and
[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml), the secrets
and variables each needs, and what a maintainer sets up once, out of band,
before either can publish anything.

This project does not use EAS — no EAS Build, Submit, Update, or Workflows,
and no `eas.json`. Both platforms build and distribute through
[fastlane](https://fastlane.tools) driven by GitHub Actions instead; see
[agent-skills.md's EAS deviation entry](./agent-skills.md)
for why EAS itself is off the table. The two platforms do not share a runner:
Android builds entirely on `ubuntu-latest`; iOS builds on `macos-latest`,
because Xcode, `xcodebuild`, and `codesign` are macOS-only and Apple ships no
Linux equivalent — there is no way to produce a signed iOS build without a
Mac. What that costs, and why both pipelines are dispatched by hand rather
than on every pull request, is stated next.

## What It Covers, and What It Deliberately Does Not

The two pipelines build **preview builds only**, for both platforms. There is
no production release path for either — no Play Store track, no TestFlight
upload, no App Store submission. A maintainer dispatches a build for a given
pull request by hand (see [Dispatching a Build](#dispatching-a-build)); the
resulting APK or ad-hoc IPA installs for manual testing, and nothing here
ships a release.

## Why Both Pipelines Are Manually Dispatched, Not Triggered by Every Pull Request

Both pipelines run only on `workflow_dispatch`, taking a required
`pull_request_number` input — neither carries a `pull_request`, `push`, or
`schedule` trigger. Android used to build on every `pull_request` event; it
was moved to the same manual trigger as iOS so both platforms follow one
policy.

**The reason is cost, and it is real enough to state in numbers.** GitHub
bills a standard macOS runner at $0.062/minute against $0.006/minute for
`ubuntu-latest` — roughly 10.3x — per
[GitHub's runner pricing reference](https://docs.github.com/billing/reference/actions-runner-pricing).
A React Native archive runs long enough (roughly 15–30 minutes) that one iOS
build costs on the order of $1–2, and this repository is private, so those
minutes are paid for once the included Actions allowance for the month is
gone. Building iOS on every pull request, the way Android used to, would
multiply that cost by every push to every open pull request. The manual
trigger is what bounds it: a maintainer spends macOS minutes only when they
actually want a build to test, not on every commit.

Android's own per-minute cost stayed at the `ubuntu-latest` rate throughout —
moving it to the same manual trigger was a policy choice for consistency, not
a cost necessity on its own. iOS is the platform the cost is actually about.

## Dispatching a Build

From the repository's **Actions** tab, select either **Android Preview** or
**iOS Preview** from the workflow list, click **Run workflow**, and enter the
pull request number to build. Each platform is dispatched independently — a
pull request can have an Android build, an iOS build, both, or neither,
whichever a maintainer asks for.

Both workflows check out that pull request's head commit at
`refs/pull/<number>/head` rather than the ref the dispatch itself ran from,
and export that commit's real SHA into `GITHUB_SHA` before the Sentry-release
step reads it — a `workflow_dispatch` run's ambient `GITHUB_SHA` otherwise
names the dispatched-from branch, not the pull request head actually built,
which would file every build's source maps under the wrong commit.

## The Stages

### Android — four stages, one `ubuntu-latest` job

[`android-preview.yaml`](../../.github/workflows/android-preview.yaml) runs
its `preview` job as four stages in sequence:

1. **Prebuild.** Computes the preview version name (below), then runs `expo
   prebuild --platform android --no-install` to generate the `android/`
   project `app.config.ts` needs to read `PREVIEW_VERSION_NAME` from. The
   generated `android/` directory is cached — see
   [`app.config.ts`](../../app.config.ts) for the environment variable it
   reads — keyed on a hash of `app.json`, `app.config.ts`, and
   `package-lock.json` plus the version name itself, so a pull request that
   changes none of those skips regenerating it.
2. **Build.** The fastlane `android build` lane (`fastlane/Fastfile`) runs
   Gradle's `assemble` task in `Release` against the generated `android/`
   project, with signing properties injected from environment, and produces a
   signed release APK.
3. **Publish.** The fastlane `android publish` lane distributes that APK
   through the `firebase_app_distribution` plugin and reports back the
   install (testing) URI Firebase generated for it.
4. **Report.** The workflow posts a **new** comment on the named pull request
   with the install link, prefixed with this project's agent-comment marker
   (`<!-- agent -->`, per [`AGENTS.md`](../../AGENTS.md)). It never edits a
   previous comment in place — every deploy gets its own — and it never posts
   a link when publishing did not happen: the comment step runs only after
   the publish step has already succeeded.

Sentry source-map upload rides inside the build stage rather than being a
fifth stage of its own — see [Sentry Source-Map Upload](#sentry-source-map-upload-optional)
below.

### iOS — signing, prebuild, build, publish, report, one `macos-latest` job

[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml) mirrors that
shape on a macOS runner, with one extra stage in front for signing:

1. **Signing setup.** Decodes the base64 distribution certificate
   (`IOS_DISTRIBUTION_CERTIFICATE_BASE64`) into a throwaway keychain created
   for the run only, then verifies a usable code-signing identity actually
   landed in it. Decodes the base64 ad-hoc provisioning profile
   (`IOS_PROVISIONING_PROFILE_BASE64`), reads its UUID, name, and bundle
   identifier back out of its own signed payload, confirms that bundle
   identifier matches `app.json`'s `expo.ios.bundleIdentifier`, and installs
   it under `~/Library/MobileDevice/Provisioning Profiles/`. Both checks name
   the secret at fault on failure and never print a value, matching how the
   Android job verifies its keystore with `keytool`.
2. **Prebuild.** Generates `ios/` with `expo prebuild --platform ios
   --no-install`, then runs `pod install`. The whole `ios/` directory plus
   CocoaPods' own cache (`~/Library/Caches/CocoaPods`) are cached together,
   keyed the same shape as Android's prebuild cache — see
   [CocoaPods and Native Project Caching](#cocoapods-and-native-project-caching)
   below for why the whole directory, not just `ios/Pods`.
3. **Build.** The fastlane `ios build` lane runs `build_app` against the
   generated workspace with manual signing pinned to the certificate and
   profile the signing-setup stage installed, and `export_method: "ad-hoc"`,
   writing the resulting IPA path to `$GITHUB_OUTPUT`.
4. **Publish.** The fastlane `ios publish` lane calls
   `firebase_app_distribution` with the built IPA and `FIREBASE_IOS_APP_ID`,
   reusing `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_TESTER_GROUPS`
   exactly as the Android lane does, and writes the testing URI back the same
   way.
5. **Report.** A fresh `<!-- agent -->`-prefixed comment on the named pull
   request, carrying the install link and the version name — identical rule
   to Android's report stage.

The job also pins its Xcode version explicitly (`sudo xcode-select -s
/Applications/Xcode_26.6.app`, verified against the `macos-latest` image on
2026-08-26, which selects Xcode 26.6 by default on macOS 26) rather than
inheriting whatever the runner image's default happens to be, so a future
image rotation cannot silently change the toolchain this build compiles
with.

## Android ABI: arm64-v8a Only

The Android `build` stage's native compile is restricted to **`arm64-v8a`** —
not the default React Native architecture set (`armeabi-v7a`, `arm64-v8a`,
`x86`, `x86_64`). Building all four produced four full NDK C++ compiles per
run, which exhausted the CI runner's disk entirely (`No space left on
device`, mid-compile, after ~27 minutes) rather than merely running slowly.

Every physical Android device a tester installs this build on is arm64, so
this costs nothing for that path. **The cost is real and worth stating
plainly: an x86_64 emulator cannot install the resulting APK.** Test a
preview build on a physical device, or on an arm64 emulator image, not an
x86_64 one.

The restriction is set in
[`plugins/with-android-abi-filter.ts`](../../plugins/with-android-abi-filter.ts),
an Expo config plugin listed in [`app.config.ts`](../../app.config.ts)'s
`plugins` array, rather than edited directly into `android/gradle.properties`
— that file is generated output, absent from version control, and a hand
edit to it is silently reverted the next time anything runs `expo prebuild`.
The plugin overrides the generated `reactNativeArchitectures` gradle property
to `arm64-v8a`, which is what `react-native`'s own Gradle build script reads
to set the NDK `abiFilters` list for the native compile. This restriction is
Android-specific; nothing analogous applies to the iOS build.

## Reclaiming Runner Disk Space

The Android `preview` job also frees space from several large preinstalled
toolchains `ubuntu-latest` ships that this build never touches — the .NET
SDK, the Haskell/GHC toolchain, and cached CodeQL analysis bundles — before
the prebuild stage runs. It never touches the Android SDK, the NDK, the JDK,
Node, or Ruby, all of which the build genuinely needs. This is a
project-authored step, not a third-party action, so it stays part of the
supply-chain surface this project already reviews itself, rather than adding
one more marketplace dependency. Free disk space is logged before and after
this step, and again after the build stage, so a run that fails this way
again says so in its own output instead of needing to be reproduced to
diagnose. The iOS job carries no equivalent step: `macos-latest` has not
shown the same disk pressure, and a `pod install` plus one architecture's
Xcode archive is a smaller compile than four Android ABIs' worth of NDK C++
ever was.

## CocoaPods and Native Project Caching

`pod install`'s cost is billed at the macOS rate, so the iOS job caches the
whole generated `ios/` directory — where `ios/Pods`, the generated
`.xcworkspace`, and `Podfile.lock` all live — together with CocoaPods' own
download and spec cache, keyed the same shape as Android's prebuild cache. A
cache hit skips both the "Generate native iOS project" and "Install
CocoaPods dependencies" steps entirely.

Caching only `ios/Pods` and passing `expo prebuild`'s `--no-clean` flag to
reuse it was tried first and rejected: verified against Expo SDK 57's actual
prebuild output, a restored `ios/Pods` directory with no matching
`.xcodeproj`/`Podfile` next to it is detected as a malformed native project
and cleared anyway — deleting the very cache directory `--no-clean` was meant
to preserve, before `pod install` ever ran. Caching the whole `ios/`
directory as one self-consistent unit, and skipping regeneration entirely on
a hit, sidesteps that failure mode completely.

## The Preflight Gate

Each pipeline has its own `preflight` job, checking only that platform's own
secrets and variables, so an unconfigured iOS setup can never fail an Android
dispatch and the reverse is equally true. Each resolves every required secret
and variable to a plain boolean in one step, because a secret cannot be
tested directly in a workflow `if:` expression.

**A missing required secret now fails the run, rather than skipping it
silently.** Under the old `pull_request` trigger this had to be a silent,
green skip: going red on every pull request until someone provisioned a
Firebase project or a keystore would have blocked unrelated changes for a
reason that had nothing to do with them. Under `workflow_dispatch` that
reasoning no longer holds — nothing unrelated is at stake, because a human
explicitly asked for this exact build by dispatching it — so a run whose
required configuration is absent now **fails**, and its log names every
missing secret or variable by name (never by value) with an `::error::`
annotation per entry. Nothing in either workflow uses `continue-on-error` to
mask that: a decided, visible failure is the point, not a hidden one.

## Sentry Source-Map Upload (Optional)

Sentry source-map upload for the app's JavaScript is **optional** and gated
**independently** of each platform's preflight gate: `SENTRY_ORG`,
`SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` are never added to what either
`preflight` job requires, so a missing Sentry token can never block a build
or a Firebase publish — only the source-map upload itself is skipped.

Both workflows run their own `sentry-check` job, identically: it resolves
those three to a boolean the same way `preflight` does, and its result
decides how the `build` stage's environment is set. On Android, the
`@sentry/react-native/expo` config plugin wires the Sentry Android Gradle
Plugin into the generated `android/app/build.gradle` at prebuild time; on
iOS, the same plugin wires an Xcode build-phase script into the generated
project instead. When all three are present, that platform's own upload step
reads them from the environment and uploads the release's source maps as
part of the same build the `build` stage already runs — no separate upload
step, on either platform. When any of the three is missing, the `build`
stage sets `SENTRY_DISABLE_AUTO_UPLOAD=true` instead, which turns that upload
off at the source so the build never depends on Sentry being configured, and
the job log names by name what is missing.

Without this configured, the build and the Firebase publish still run
exactly as before; the only loss is that any stack trace that build's users
report to Sentry arrives unsymbolicated (minified file and line numbers
instead of the real source).

The release string a build reports and the release string its upload is
filed under are the same value from the same source, never composed twice,
on either platform. [`app.config.ts`](../../app.config.ts) resolves it once —
`resolveSentryRelease` in
[`src/core/instrumentation/sentry-identity.ts`](../../src/core/instrumentation/sentry-identity.ts),
combining the app version with the commit hash — and exposes it at
`extra.sentryRelease`. `Sentry.init` reads that field through
`expo-constants` at runtime; each workflow's **Resolve Sentry release** step
reads the identical field from `npx expo config --type public --json` and
exports it as `SENTRY_RELEASE`, which each platform's own Sentry build-tool
step reads ahead of its own default release-naming scheme. Neither side
reconstructs the format independently.

## The Ad-Hoc Constraint, and Registering a New Tester's Device

Firebase App Distribution accepts an `.ipa` only when it is signed **ad-hoc**
(or enterprise, which this project does not use), and an ad-hoc build
installs solely on devices whose UDID was already registered in Apple's
system and included in the provisioning profile **at the time the build was
signed**. Firebase collects the UDID of every device that opens an install
link and registers a tester, but it does not register that UDID with Apple —
a maintainer still has to do that by hand, per
[Firebase's own documentation on registering additional devices](https://firebase.google.com/docs/app-distribution/register-additional-devices).

Adding a new tester to an existing preview therefore takes a fixed procedure,
end to end:

1. **Export the UDIDs Firebase has collected.** From a maintainer's own
   machine (not CI — this is a local fastlane lane, not a workflow step;
   automating only this half would still leave every remaining step manual):

   ```sh
   bundle exec fastlane ios udids service_credentials_file:/path/to/firebase-service-account.json
   ```

   This writes every registered tester's UDID to
   `fastlane/firebase-tester-udids.csv` by default (pass
   `output_file:some/other/path.csv` to change it), using the same Firebase
   service-account key `FIREBASE_SERVICE_ACCOUNT_JSON` holds, with
   `FIREBASE_IOS_APP_ID` set in the environment locally.
2. **Register the new device's UDID in the Apple Developer portal** — under
   **Certificates, Identifiers & Profiles → Devices**, click the add button
   (**+**), and enter the device's name and the UDID the export above
   surfaced. Apple caps this at **100 devices per product family per
   membership year** (see
   [Apple's devices-overview documentation](https://developer.apple.com/help/account/devices/devices-overview)),
   which this project treats as ample for a preview audience and has not
   designed around.
3. **Regenerate the ad-hoc provisioning profile** in the same portal, now
   that the new device is registered — an existing profile does not pick up
   a newly registered device on its own; it has to be regenerated.
4. **Download the regenerated profile, base64-encode it, and replace the
   `IOS_PROVISIONING_PROFILE_BASE64` repository secret** with the new value
   (see [secrets.md](./secrets.md) for the exact
   encoding command).
5. **Dispatch a fresh iOS Preview build** for the pull request the new
   tester needs (see [Dispatching a Build](#dispatching-a-build)).

**Step 5 is not optional, and it is the part a maintainer is likely to be
surprised by:** an ad-hoc IPA is signed against the exact provisioning
profile that existed when it was built. A build produced before a device was
registered cannot install on that device no matter how the profile is
updated afterward — only a build produced *after* the profile was
regenerated carries the new device. Updating the secret alone does not help
any tester already waiting on a link; a new build has to be dispatched for
the update to reach them.

## The Secrets and Variables Each Pipeline Reads

Their names, kinds, and what happens when each is absent are stated once, in
[secrets.md](./secrets.md), alongside every other secret this project's
automation reads. This document does not repeat that table: two inventories of
one set of names drift the first time only one of them is corrected, and a
secrets table that has silently gone wrong is worse than no table, because a
maintainer configures what it says and then debugs a pipeline that looks
correctly configured.

What belongs here rather than there is the procedure below — creating the
accounts and artifacts those names point at.

## Maintainer Setup (Out of Band)

None of this is created by either pipeline; a maintainer sets it up once,
before the secrets and variables above have anything real to hold:

- **An Android release keystore.** Generated once (for example with
  `keytool -genkeypair`) and kept outside this repository; its base64-encoded
  contents become `ANDROID_KEYSTORE_BASE64`, and its password and key alias
  become the other three `ANDROID_KEY_*` secrets.
- **An Apple Developer Program membership** — $99/year, per
  [Apple's own program page](https://developer.apple.com/programs/). This is
  the only path to an ad-hoc distribution certificate and to registering
  tester devices at all; nothing in the iOS pipeline can be exercised without
  it, and it is a real recurring cost separate from the macOS runner minutes
  above.
- **An iOS distribution certificate**, generated under that membership and
  exported as a `.p12` with its private key included; its base64-encoded
  contents become `IOS_DISTRIBUTION_CERTIFICATE_BASE64`, and the export
  password becomes `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`.
- **An ad-hoc provisioning profile**, generated for this project's bundle
  identifier (`app.axross.juicio`, `app.json`'s `expo.ios.bundleIdentifier`)
  against the distribution certificate above and whatever devices are
  registered so far; its base64-encoded contents become
  `IOS_PROVISIONING_PROFILE_BASE64`. The team's Apple Developer Team ID
  becomes `IOS_TEAM_ID`.
- **A Firebase project with an App Distribution Android app and an App
  Distribution iOS app.** The Android app registered there (matching this
  project's `app.axross.juicio` package) is what `FIREBASE_ANDROID_APP_ID`
  names; the iOS app (matching the same bundle identifier) is what
  `FIREBASE_IOS_APP_ID` names. App Distribution itself must be enabled for
  both — free on both Firebase pricing tiers, and it accepts an APK or an
  ad-hoc IPA directly, which is why this project distributes through it
  rather than through a store track.
- **A service account holding the Firebase App Distribution Admin role.**
  Created in that same Firebase project (or its underlying Google Cloud
  project), with a JSON key downloaded for it; that key's contents, pasted in
  verbatim (not base64-encoded), become `FIREBASE_SERVICE_ACCOUNT_JSON` and
  are read by both pipelines. A role short of Admin can read releases but
  cannot upload or distribute one, so either `publish` lane fails
  authorization without it.
- **A Sentry project, and an auth token scoped to it, if source-map upload is
  wanted.** The project's slug and its organization's slug become
  `SENTRY_PROJECT` and `SENTRY_ORG`; a token with the `project:releases` scope
  (created under the organization's Settings → Auth Tokens) becomes
  `SENTRY_AUTH_TOKEN`. This one is entirely optional for either platform —
  skip it and both pipelines run exactly as documented above, just without
  symbolicated stack traces in Sentry.

## The Version-Naming Scheme

Each preview build's version name is `<version from app.json>-pr-<pull
request number>` — for example `0.1.0-pr-42` — on both platforms. Each
workflow computes it once, early in the `preview` job, from the
`pull_request_number` input it was dispatched with (not from any
`pull_request` event payload — neither workflow has one), and exports it as
`PREVIEW_VERSION_NAME` for every later step; [`app.config.ts`](../../app.config.ts)
reads that same variable and, when it is set, uses it as the app config's
`version` instead of the static value in `app.json`. That is also the value
each prebuild cache key folds in, so a version bump (a new pull request, or
the base `app.json` version changing) never reuses another pull request's
cached native project.
