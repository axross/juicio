# iOS Native Compile Check

[`ios-native-compile.yaml`](../../.github/workflows/ios-native-compile.yaml)
compiles the iOS app for the Simulator, with code signing disabled, replacing
a manual step the maintainer would otherwise run on their own Mac. It reads
no repository secret and produces no artifact — it exists only to prove
`modules/espada-engine/`'s iOS half actually compiles, which nothing in this
repository had ever done before this workflow existed (see
[native-module-artifacts.md](./native-module-artifacts.md#the-android-binary-exists-the-ios-one-does-not)).

## What It Proves

Four things, none of them previously observed to work:

- **The podspec resolves under CocoaPods.**
  [`EspadaEngine.podspec`](../../modules/espada-engine/EspadaEngine.podspec)
  sits at the module root, with `cpp/` as a sibling directory, so its
  `s.source_files = "cpp/*.{h,hpp,cpp}"` resolves directly — the podspec used
  to live under `ios/` instead and had to copy `../cpp/` into a gitignored
  directory to satisfy CocoaPods' own restriction against `source_files`
  outside the pod's own `:path =>` (see that podspec's own comment). This
  workflow's `pod install` step is what actually exercises that resolution.
- **Nitrogen's generated C++ and the hand-written HybridObject compile.**
  `modules/espada-engine/nitrogen/generated/shared/c++/` and
  `modules/espada-engine/cpp/EspadaEngineHybridObject.cpp` both compile under
  Xcode's own toolchain, not merely under whatever compiler produced them.
- **Nitrogen's generated Objective-C registration links.**
  `modules/espada-engine/nitrogen/generated/ios/EspadaEngineAutolinking.mm`'s
  `+ (void) load` method — Nitro's own autolinking registration — links into
  the compiled app binary.
- **The xcframework is found and linked.**
  `modules/espada-engine/ios/EspadaEngine.xcframework`, referenced by the
  podspec's `s.vendored_frameworks`, is found by CocoaPods and linked into
  the app.

## Why Manual Dispatch Only, With No Signing

`ios-native-compile.yaml` carries a bare `workflow_dispatch:` trigger — no
`pull_request`, `push`, or `schedule` — matching this project's standing
policy that anything spending macOS-runner minutes runs only when a human
explicitly asks for it: a macOS runner bills at roughly 10.3x a
`ubuntu-latest` one ($0.062/minute against $0.006/minute, per
[GitHub's runner pricing reference](https://docs.github.com/billing/reference/actions-runner-pricing)),
the same rate
[preview-deployment.md](./preview-deployment.md#why-both-pipelines-are-manually-dispatched-not-triggered-by-every-pull-request)
already documents for the two preview pipelines.

A Simulator build needs neither a signing identity nor a provisioning
profile, so this workflow needs no secret at all — unlike
[`ios-preview.yaml`](../../.github/workflows/ios-preview.yaml), which builds
a *signed* ad-hoc IPA and therefore needs the Apple and Firebase entries
[secrets.md](./secrets.md) inventories. `CODE_SIGNING_ALLOWED=NO` is what
lets it skip that entirely: without it, the generated Xcode project's default
"Automatically manage signing" setting would still try to resolve a signing
identity and provisioning profile that do not exist here, and fail before
ever reaching the C++ compile this workflow is actually checking.

This is deliberately not a `merge-checks.yaml` job. `merge-checks.yaml` runs
on every pull request and push to `main` on `ubuntu-latest` only — it cannot
compile for iOS at all — which is exactly why `native_android_compile` has no
iOS counterpart there (see [README.md](../../README.md)'s Testing table).
Moving this check onto a macOS runner and running it on every pull request
would repeat the same cost preview-deployment.md already rejected for the
signed preview builds, for a check that changes far less often than an
ordinary pull request.

## Job Structure

One job, `compile`, on `macos-latest`, with each stage its own named step so
a failure names the stage that broke rather than an undifferentiated log:

1. **Select Xcode version** — pins the same `Xcode_26.6.app` path
   `ios-preview.yaml` and `espada-engine-artifacts.yaml`'s `build-ios` job
   both pin, for the same reason: the runner image's default Xcode rotates on
   GitHub's own schedule, so a pinned path plus a logged `xcodebuild
   -version` is what keeps a future image rotation from silently changing
   the toolchain this check compiles with.
2. **Generate native iOS project** — `npx expo prebuild --platform ios
   --no-install`, the same command `ios-preview.yaml`'s `prebuild` job runs.
3. **Install CocoaPods dependencies** — `pod install`, run with
   `working-directory: ios`, against macOS runners' preinstalled CocoaPods
   (the same assumption `ios-preview.yaml`'s own CocoaPods step makes, with
   no explicit install step of its own). This is the step that proves the
   podspec resolves at all.
4. **Resolve workspace and scheme** — globs `ios/*.xcworkspace` and takes the
   scheme as its basename, never a hardcoded name, mirroring
   `fastlane/Fastfile`'s `resolved_ios_project_paths` (see that file's own
   comment for why a hardcoded name is wrong: it silently stops matching the
   moment `app.json`'s name changes). This job does not invoke fastlane at
   all — there is no signed archive to produce, so no lane to call — so the
   same glob-then-fail-loud shape is reimplemented directly in this step
   rather than shared code, the same way `merge-checks.yaml`'s
   `native_android_compile` job bypasses fastlane for a raw Gradle
   invocation instead of calling its `android build` lane.
5. **Compile app for the iOS Simulator** — `xcodebuild build -workspace
   <resolved> -scheme <resolved> -configuration Debug -sdk iphonesimulator
   -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`.
   The `generic/` destination prefix is Apple's own documented mechanism for
   targeting a platform without a specific device present, so this needs no
   simulator booted on the runner. `-configuration Debug` matches every
   other unsigned iOS build in this project (`npm run ios`) and, unlike
   `Release`, does not invoke the React Native bundling build phase, which
   would otherwise need a Metro server this job never starts.

## What This Does Not Prove

This workflow proves the iOS half **compiles and links**. It proves nothing
about runtime behavior — whether the JavaScript thread stays responsive,
whether teardown leaks worker threads, whether the demo workload lands in its
intended duration — all of which still need a real device or a
maintainer-run Simulator, per
[`modules/espada-engine/README.md`](../../modules/espada-engine/README.md#what-cannot-be-checked-here).
It also builds against whatever `.xcframework` is already committed; it
never invokes Cargo and proves nothing about the Rust cross-compile that
produced that binary — that is `espada-engine-artifacts.yaml`'s `build-ios`
job's own verification (see
[native-module-artifacts.md](./native-module-artifacts.md#the-exported-symbol-check)).
And it is not a signed build: it proves nothing about
`ios-preview.yaml`'s code-signing, provisioning, or Firebase distribution
steps, which this workflow does not exercise at all.

## Dispatching It

From the repository's **Actions** tab, select **iOS Native Compile**, choose
the branch to check, and click **Run workflow**. There is no input to fill
in — unlike the two preview pipelines, this workflow takes no pull request
number and posts no comment; its only output is the job's own pass or fail.

## Status: Unverified Until First Dispatch

This workflow has never run. The iOS half it compiles has never compiled in
this repository before (see
[native-module-artifacts.md](./native-module-artifacts.md#the-android-binary-exists-the-ios-one-does-not)),
so treat its first few dispatches as iteration, not as a working pipeline
already proven out. Whoever first dispatches it should expect to fix whatever
it finds, and is the one who gets to update this document once it has
actually passed.
