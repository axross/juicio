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
for why EAS itself is off the table. The two platforms do not share a runner
for their heaviest work: Android's `build` job runs on `ubuntu-latest`; iOS's
runs on `macos-latest`, because Xcode, `xcodebuild`, and `codesign` are
macOS-only and Apple ships no Linux equivalent — there is no way to produce a
signed iOS build without a Mac. (Both pipelines' lighter `preflight` job runs
on the cheaper `ubuntu-slim` instead, since it only runs a handful of scripted
checks and one GitHub API call — no dependency install, no build.) What that
costs, and why both pipelines are dispatched by hand rather than on every
pull request, is stated next.

## What It Covers, and What It Deliberately Does Not

The two pipelines build **preview builds only**, for both platforms. Neither
one ships a release: a maintainer dispatches a build for a given pull request
by hand (see [Dispatching a Build](#dispatching-a-build)), and the resulting
APK or ad-hoc IPA installs for manual testing. There is still no release path
for iOS — no TestFlight upload, no App Store submission. Android now has one,
in a separate pipeline this document does not cover:
[`android-release.yaml`](../../.github/workflows/android-release.yaml)
builds a signed Android App Bundle from a maintainer-dispatched ref and
uploads it to Google Play's internal testing track — see
[google-play-release.md](./google-play-release.md).

## Why Both Pipelines Are Manually Dispatched, Not Triggered by Every Pull Request

Both pipelines run only on `workflow_dispatch`, taking a required
`pull-request-number` input — neither carries a `pull_request`, `push`, or
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

Cost is the reason the trigger is manual; it is not the whole decision. Why
paying for `macos-latest` was accepted at all, and why a self-hosted Mac,
`fastlane match`, and building iOS on every pull request were each rejected,
is recorded in
[decisions/2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md](../decisions/2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md).

## Dispatching a Build

From the repository's **Actions** tab, select either **Android Preview** or
**iOS Preview** from the workflow list, click **Run workflow**, and enter the
pull request number to build. Each platform is dispatched independently — a
pull request can have an Android build, an iOS build, both, or neither,
whichever a maintainer asks for.

Each workflow's `preflight` job resolves that pull request's real head commit
through the GitHub API — its **Verify Pull Request Origin** step, below,
which refuses a head outside this repository — and outputs it as `head-sha`.
Every later job (`prebuild`, `build`, `publish`) checks out that exact
commit, never the mutable `refs/pull/<number>/head` ref, so a push to the
pull request between jobs cannot change what a later job builds after the
fork-origin guard approved it. `prebuild` and `build` each also export that
commit's real SHA into `GITHUB_SHA` before anything reads `app.config.ts` —
through `npx expo config` and through the native build's own JS bundling —
because a `workflow_dispatch` run's ambient `GITHUB_SHA` otherwise names the
dispatched-from branch, not the pull request head actually built, which would
file the build's source maps under the wrong commit.

**Neither workflow can be dispatched from a pull request branch.** GitHub only
offers a `workflow_dispatch` workflow for dispatch once its file is on the
default branch: *"This event will only trigger a workflow run if the workflow
file exists on the default branch"*
([GitHub's events reference](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)).
A change to either workflow therefore cannot be exercised on the pull request
that makes it — not through the Actions tab, and not through the REST dispatch
endpoint, which cannot resolve a workflow the default branch does not carry.
The first run of any such change happens after it merges. This is the cost of
the manual trigger that is easiest to be surprised by: under the
`pull_request` trigger Android's pipeline tested itself on every pull request,
including the ones that changed it.

## Who May Dispatch, and What a Dispatch Executes

A dispatch runs the named pull request's own code — `npm ci` runs its
lifecycle scripts, `pod install` its Podfile, `bundle exec fastlane` its
Fastfile, Gradle its build scripts — across the `prebuild`, `build`, and
`publish` jobs, which between them hold the signing credentials and the
Firebase service account. Dispatching a build is therefore an act of trust
in that pull request's contents, not a read-only operation on them.

The manual trigger changed this in two opposite directions at once, and both
are worth stating plainly:

- **It closed one hole.** Under `pull_request`, the workflow definition that
  runs is the one from the pull request's own head, so a pull request could
  rewrite the workflow itself and run whatever it liked with the secrets. A
  `workflow_dispatch` run uses the workflow file from the ref it was
  dispatched against — the default branch, in normal use — which a pull
  request cannot alter.
- **It opened another.** A `pull_request` run whose head was a **fork** never
  received repository secrets at all; GitHub withholds them precisely to stop
  a fork's code from reading them. A `workflow_dispatch` run receives every
  secret regardless of which ref it goes on to check out, so nothing about
  the trigger itself would stop a maintainer from dispatching a build for a
  fork's pull request and handing that fork the signing certificate.

Both workflows therefore run a **Verify Pull Request Origin** step in the
`preflight` job, before any later job's checkout and before any of the pull
request's code runs: it resolves the pull request through the API and fails
the run unless the head is in this repository — which, because `prebuild`,
`build`, and `publish` all depend on `preflight`, keeps every one of them
from starting at all. A head whose repository has been deleted resolves to
nothing and is refused too — an origin that cannot be confirmed is not
treated as trusted. This restores what the fork protection used to give, and
nothing more.

Resolving the pull request this way is a REST call, so `preflight` needs a
`pull-requests: read` scope on top of the workflow-level `contents: read`
both files already declare. That scope is granted in `preflight`'s own
`permissions:` block in both workflow files, not at the workflow level, so
`prebuild`, `build`, and `publish` — the three jobs that go on to check out
and execute the pull request's own code with the signing secrets in scope —
never receive it. Removing the grant does not weaken this guard; it breaks
it outright, because every dispatch then fails at this step with `403
Resource not accessible by integration` before any of those later jobs can
run.

**What it does not give.** Anyone with write access can push a branch and
open a pull request from inside this repository, and that head passes the
gate. The remaining control is procedural, and it is the maintainer's:
**dispatch a build only for a pull request whose diff you have read.** A
build dispatched against unreviewed code runs that code with an Apple
distribution certificate and a Firebase App Distribution Admin key in scope,
neither of which is quick to rotate. GitHub's own guidance on this shape — a
privileged trigger executing an untrusted ref — is
[GitHub Security Lab's note on preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/).

A repository on a plan that offers protected environments for private
repositories can close the procedural gap structurally, by putting the
`prebuild`, `build`, and `publish` jobs — the three that execute the pull
request's own code — behind an environment with required reviewers, so a
second person approves before any of them sees a secret. That is a
repository setting rather than a workflow change, and it is not configured
here.

## Job Structure

Both pipelines take the same four jobs, in the same dependency order:
`preflight` → `prebuild` → `build` → `publish`. Job ids and what each job is
responsible for are identical across the two files; only the
platform-specific steps inside `prebuild` and `build` differ, and only
`build` changes runner between them.

### Why Two Files, Not One Matrixed Workflow

[`android-preview.yaml`](../../.github/workflows/android-preview.yaml) and
[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml) stay two
separate files rather than one workflow matrixed across `ubuntu-latest` and
`macos-latest`. A matrix would have to branch on platform at nearly every
step — the signing mechanism, the cache paths, the fastlane lane, the runner
itself all differ — and it would couple the two platforms' failure domains,
so a broken iOS signing setup could take an Android preview down with it.
Keeping the files separate costs some duplication (the `preflight` shape,
the fork-origin guard, the report step) in exchange for that isolation.

### The Stages

1. **Preflight** (`ubuntu-slim`, both platforms — a handful of scripted
   checks and one GitHub API call, no dependency install and no build,
   so it doesn't need `ubuntu-latest`'s larger runner). Resolves that
   platform's required secrets and variables, and the optional Sentry set,
   to booleans in one step — see
   [The Preflight Gate](#the-preflight-gate) below.
   Resolves the pull request's real head commit through the GitHub API and
   refuses a head outside this repository — see
   [Who May Dispatch, and What a Dispatch Executes](#who-may-dispatch-and-what-a-dispatch-executes)
   above. Computes the preview version name (see
   [The Version-Naming Scheme](#the-version-naming-scheme) below). Outputs
   `head-sha`, `version-name`, and `sentry-configured` for every later job to
   read.
2. **Prebuild** (`ubuntu-latest`, both platforms). Checks out `head-sha`,
   installs dependencies, resolves the Sentry release string — see
   [Sentry Source-Map Upload](#sentry-source-map-upload-optional) below —
   and runs `expo prebuild --platform <platform> --no-install`, cached; see
   [Prebuild and CocoaPods Caching](#prebuild-and-cocoapods-caching) below.
   The generated directory is archived as a tar file before upload — plain
   `actions/upload-artifact` normalises every uploaded file's permissions,
   which would strip `android/gradlew`'s executable bit — and uploaded as an
   artifact with **1-day retention**: Firebase App Distribution, not this
   artifact, is where the built binary is meant to be consumed from.
3. **Build** (`ubuntu-latest` for Android, `macos-latest` for iOS). Checks
   out `head-sha`, downloads and extracts the `prebuild` job's artifact,
   stamps the run's build number into it — see
   [Build Numbers and the Prebuild Cache](#build-numbers-and-the-prebuild-cache)
   below — then runs the platform's own signing and build steps. The
   fastlane `build` lane (`fastlane/Fastfile`) assembles a signed release
   APK (Gradle's `assemble` task in `Release`, on Android) or ad-hoc IPA
   (`build_app` with `export_method: "ad-hoc"`, on iOS) and writes its path
   to a job output. That binary is uploaded as an artifact, again with
   1-day retention. `build` runs on a different runner than `publish`, so
   this job copies the built binary to a fixed, known filename before
   uploading it, rather than relying on its own fastlane output path — a
   path on this job's own disk — surviving into the next job.
   - iOS only, before the fastlane call: imports the base64 distribution
     certificate (`APPLE_DISTRIBUTION_CERTIFICATE_BASE64`) into a throwaway
     keychain created for the run only, verifying a usable code-signing
     identity actually landed in it; installs the base64 ad-hoc
     provisioning profile (`APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64`),
     reading its UUID, name, and bundle identifier back out of its own
     signed payload and confirming that bundle identifier matches
     `app.json`'s `expo.ios.bundleIdentifier`. Both checks name the secret
     at fault on failure and never print a value, the same rule the Android
     job's `keytool` check follows for the release keystore. iOS's `build`
     job also pins its Xcode version explicitly, through the
     [`setup-xcode`](../../.github/actions/setup-xcode/action.yml) composite
     action, rather than inheriting whatever the runner image's default
     happens to be, so a future image rotation cannot silently change the
     toolchain the build compiles with. The pinned version — and the
     rationale for pinning it — lives in that one file, not here, so a
     version bump touches a single place.
4. **Publish** (`ubuntu-latest`, both platforms). Checks out `head-sha` (for
   `fastlane/Fastfile`), downloads the `build` job's binary artifact under
   the same fixed filename that job uploaded, writes and validates the
   Firebase service-account credentials, and runs the fastlane `publish`
   lane, which distributes the binary through the `firebase_app_distribution`
   plugin and reports back the install (testing) URI. On success, this job
   posts a **new** comment on the pull request with that link, prefixed with
   this project's agent-comment marker (`<!-- agent -->`, per
   [`AGENTS.md`](../../AGENTS.md)) — it never edits a previous comment in
   place, and it never posts a link when publishing did not happen, since the
   comment step runs only after the publish step has already succeeded — and
   repeats the same link as a `::notice::` and a run-summary entry.

`preflight` carries `contents: read` and `pull-requests: read`, the latter
for the fork-origin guard's API call; `publish` carries `contents: read`
and `pull-requests: write`, to post that comment. `prebuild` and `build`
carry `contents: read` only.

## Android ABI: arm64-v8a Only

The Android `build` job's native compile is restricted to **`arm64-v8a`** —
not the default React Native architecture set (`armeabi-v7a`, `arm64-v8a`,
`x86`, `x86_64`). Building all four produced four full NDK C++ compiles per
run, which exhausted the CI runner's disk entirely (`No space left on
device`, mid-compile, after ~27 minutes) rather than merely running slowly.

Every physical Android device a tester installs this build on is arm64, so
this costs nothing for that path. **The cost is real and worth stating
plainly: an x86_64 emulator cannot install the resulting APK.** Test a
preview build on a physical device, or on an arm64 emulator image, not an
x86_64 one.

The restriction is set through the `expo-build-properties` config plugin's
Android `buildArchs` option, declared in [`app.json`](../../app.json)'s
`plugins` array, rather than edited directly into `android/gradle.properties`
— that file is generated output, absent from version control, and a hand
edit to it is silently reverted the next time anything runs `expo prebuild`.
`buildArchs` overrides the generated `reactNativeArchitectures` gradle
property to `arm64-v8a`, which is what `react-native`'s own Gradle build
script reads to set the NDK `abiFilters` list for the native compile. This
restriction is Android-specific; nothing analogous applies to the iOS build.

Adopting `expo-build-properties` has a cost worth stating in the same plain
terms as the iOS cost above. It is one added dependency, published by Expo
on the same release train as the `expo` package this project already pins
(`~57.0.15` against SDK 57); it runs at prebuild time only and ships no
runtime code into the app, and it is MIT-licensed, declares no lifecycle
scripts, and adds two entries to `package-lock.json`. What it actually costs
is not that weight but control: the restriction's mechanism is now versioned
and maintained by Expo rather than by this project, so a future change to
`buildArchs`'s own behaviour arrives with an SDK bump rather than as a diff
reviewable in this repository. Why `expo-build-properties` was chosen over a
Gradle invocation-time override or inlining the plugin — the reasoning
behind paying that cost — is recorded in
[decisions/2026-08-27-use-expo-build-properties-to-restrict-the-android-abi.md](../decisions/2026-08-27-use-expo-build-properties-to-restrict-the-android-abi.md).

## Reclaiming Runner Disk Space

The Android `build` job also frees space from several large preinstalled
toolchains `ubuntu-latest` ships that this build never touches — the .NET
SDK, the Haskell/GHC toolchain, and cached CodeQL analysis bundles — before
the signing and Gradle steps run. It never touches the Android SDK, the NDK,
the JDK, Node, or Ruby, all of which the build genuinely needs. This is a
project-authored step, not a third-party action, so it stays part of the
supply-chain surface this project already reviews itself, rather than adding
one more marketplace dependency. Free disk space is logged before and after
this step, and again after the Gradle build, so a run that fails this way
again says so in its own output instead of needing to be reproduced to
diagnose. iOS's `build` job carries no equivalent step: `macos-latest` has
not shown the same disk pressure, and a `pod install` plus one architecture's
Xcode archive is a smaller compile than four Android ABIs' worth of NDK C++
ever was.

## Build Numbers and the Prebuild Cache

Every preview build's `versionCode` (Android) or `CFBundleVersion` (iOS) is
`GITHUB_RUN_NUMBER` — the run number of the workflow run that produced it —
stamped directly into the generated project by the `build` job, right before
the platform's own signing and build steps: `android/app/build.gradle`'s
`versionCode` line on Android, `ios/juicio/Info.plist`'s `CFBundleVersion`
key (via `PlistBuddy`) on iOS. Both locations were confirmed empirically
against Expo SDK 57's actual prebuild output, and they are the complete set
— nothing else in either generated tree varies with the run number. The step
reads the value back afterward and fails with an `::error::` if it did not
land.

This exists to fix a defect the prebuild cache would otherwise cause: the
cache is keyed on a hash of `app.json`, `app.config.ts`, and
`package-lock.json` plus the preview version name (see
[Prebuild and CocoaPods Caching](#prebuild-and-cocoapods-caching) below),
none of which changes between two dispatches of the same pull request. A
second dispatch with no source change would therefore hit the same cache
entry and restore a native project still carrying the *first* dispatch's run
number, baked in by that earlier `expo prebuild`. Firebase App Distribution
does not require build numbers to be unique, so nothing failed loudly before
this — the build simply misreported which run produced it. Stamping the
value directly, unconditionally on both a cache hit and a cache miss, makes
the value correct regardless of what the cache restored.

## Prebuild and CocoaPods Caching

`prebuild`, on `ubuntu-latest` for both platforms, caches the bare `expo
prebuild` output — the generated `android/` or `ios/` directory, with no
signing and, on iOS, no `pod install` yet — keyed on a hash of `app.json`,
`app.config.ts`, and `package-lock.json` plus the preview version name. A
pull request that changes none of those skips regenerating it.

`pod install`'s own cost is billed at the macOS rate, so iOS's `build` job
caches a second, larger snapshot: the whole `ios/` directory — where
`ios/Pods`, the generated `.xcworkspace`, and `Podfile.lock` all live —
together with CocoaPods' own download and spec cache
(`~/Library/Caches/CocoaPods`), keyed the same shape as the `prebuild` cache
above but under its own key, so the two caches never collide. Restoring this
cache overlays the freshly extracted `prebuild` artifact — safe, because
both are generated from the same three hashed inputs and the same version
name — and a hit skips "Install CocoaPods Dependencies" entirely.

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
dispatch and the reverse is equally true. Its one **Resolve Required
Configuration** step resolves every required secret and variable — and,
alongside them, the optional Sentry set — to a plain boolean each, because a
secret cannot be tested directly in a workflow `if:` expression. It writes a
configuration table to the run summary (`$GITHUB_STEP_SUMMARY`) naming what
is present, never a value, before deciding anything.

**A missing required secret fails the run; the pipeline's other jobs never
start.** A human explicitly asked for this exact build by dispatching it, so
a run whose required configuration is absent **fails**, and the step's log
names every missing secret or variable by name (never by value) with one
`::error::` annotation per entry. Because `prebuild`, `build`, and `publish`
all depend on `preflight`, none of them starts once it has failed. Nothing in
either workflow uses `continue-on-error` to mask that: a decided, visible
failure is the point, not a hidden one.

The Sentry set is resolved, and its own `::warning::` emitted, *before* this
exit — never as a second job, and never lost to the failure — which is what
lets one job carry both gates: see
[Sentry Source-Map Upload](#sentry-source-map-upload-optional) below for what
an incomplete Sentry set does instead of failing the run.

## Sentry Source-Map Upload (Optional)

Sentry source-map upload for the app's JavaScript is **optional** and gated
**independently** of each platform's required configuration: `SENTRY_ORG`,
`SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` are never added to what makes
`preflight` fail, so a missing Sentry token can never block a build or a
Firebase publish — only the source-map upload itself is skipped.

`preflight`'s own **Resolve Required Configuration** step (above) resolves
those three the same way it resolves the required set, and outputs the
result as `sentry-configured` for the `build` job to read. On Android, the
`@sentry/react-native/expo` config plugin wires the Sentry Android Gradle
Plugin into the generated `android/app/build.gradle` at prebuild time; on
iOS, the same plugin wires an Xcode build-phase script into the generated
project instead. When all three are present, that platform's own upload step
reads them from the environment and uploads the release's source maps as
part of the same `build` job that already runs — no separate upload step, on
either platform. When any of the three is missing, `build` sets
`SENTRY_DISABLE_AUTO_UPLOAD=true` instead, which turns that upload off at the
source so the build never depends on Sentry being configured; `preflight`'s
own `::warning::` already named by name what is missing.

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
`expo-constants` at runtime; each workflow's `prebuild` job runs a **Resolve
Sentry Release** step that reads the identical field from `npx expo config
--type public --json` and exposes it as a job output, which the `build`
job's `SENTRY_RELEASE` environment variable reads directly — each platform's
own Sentry build-tool step then reads that ahead of its own default
release-naming scheme. Neither side reconstructs the format independently.

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
   `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64` repository secret** with the new
   value (see [secrets.md](./secrets.md) for the exact encoding command).
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
  contents become `ANDROID_KEYSTORE_BASE64`, its keystore password and key
  password become the other two `ANDROID_KEY_*` secrets
  (`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`), and its key alias
  becomes the `ANDROID_KEY_ALIAS` variable — a plain label, not a credential,
  so it is a Variable rather than a Secret; see
  [secrets.md](./secrets.md#android-preview-pipeline) for why.
- **An Apple Developer Program membership** — $99/year, per
  [Apple's own program page](https://developer.apple.com/programs/). This is
  the only path to an ad-hoc distribution certificate and to registering
  tester devices at all; nothing in the iOS pipeline can be exercised without
  it, and it is a real recurring cost separate from the macOS runner minutes
  above.
- **An Apple Distribution certificate**, generated under that membership and
  exported as a `.p12` with its private key included; its base64-encoded
  contents become `APPLE_DISTRIBUTION_CERTIFICATE_BASE64`, and the export
  password becomes `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD`.
- **An ad-hoc provisioning profile**, generated for this project's bundle
  identifier (`app.axross.juicio`, `app.json`'s `expo.ios.bundleIdentifier`)
  against the distribution certificate above and whatever devices are
  registered so far; its base64-encoded contents become
  `APPLE_AD_HOC_PROVISIONING_PROFILE_BASE64`, and the membership's Team ID
  becomes `APPLE_DEVELOPER_TEAM_ID`.
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
workflow computes it once, in its `preflight` job, from the
`pull-request-number` input it was dispatched with (not from any
`pull_request` event payload — neither workflow has one), and outputs it as
`version-name` for every later job to read; `prebuild` and `build` each set
it as their own `PREVIEW_VERSION_NAME` environment variable from that output.
[`app.config.ts`](../../app.config.ts) reads that same variable and, when it
is set, uses it as the app config's `version` instead of the static value in
`app.json`. That is also the value each prebuild cache key folds in, so a
version bump (a new pull request, or the base `app.json` version changing)
never reuses another pull request's cached native project.
