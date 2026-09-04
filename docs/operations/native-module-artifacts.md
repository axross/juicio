# Native Library Build

How this project produces the two binaries `modules/espada-engine/` ships —
`libespada_engine.so` for Android and `EspadaEngine.xcframework` for iOS —
from the Rust crate at `modules/espada-engine/lib/espada-engine/`, and this
module's generated Nitro bindings: all three are produced entirely by the
[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)
workflow, which cross-compiles both binaries, regenerates the bindings, and
commits all three directly onto whichever branch a maintainer dispatches it
against. There is no local script that
reproduces any of this on a maintainer's own machine — a contributor who
never touches `modules/espada-engine/` needs no Rust toolchain and no local
step to produce these two binaries. An Android build still fetches an NDK,
though: this module's own Nitro C++ bridge compiles through its own CMake
target on every Android build (see What It Builds, and Why Both Binaries
Are Committed below — Cargo is never invoked, since the Rust `.so` it links
is `IMPORTED`), and React Native's own autolinked native modules compile
C++ into `:app` as well. See
[conventions/directory-structure.md](../conventions/directory-structure.md)
for where the crate and the module live, and
[decisions/2026-08-27-generate-nitro-bindings-and-registration-with-nitrogen.md](../decisions/2026-08-27-generate-nitro-bindings-and-registration-with-nitrogen.md)
for why the binding between them is a Nitro `HybridObject` at all, and
[decisions/2026-08-27-produce-the-committed-native-artifacts-in-ci-not-locally.md](../decisions/2026-08-27-produce-the-committed-native-artifacts-in-ci-not-locally.md)
for why these binaries are committed rather than built by the app — note
that decision record's own title and body describe a local rebuild script
that this workflow-only approach has since replaced; it is linked here only
for why the binaries are committed at all, not for how they are produced
today.

**Nitrogen produces none of this.** Nitrogen generates the module's C++
bindings, its registration and its per-platform autolinking files from the
`.nitro.ts` spec — it generates no binary, cross-compiles nothing, and does
not remove the need for a macOS host to produce the `.xcframework`. Below
the JS-facing spec, the C ABI and these two binaries are exactly what they
would be without it.

**There are two crates, and both are built here.** `espada-engine` produces
the shipped library; `espada-internal` is a fork of `axross/espada`,
maintained in this repository, that `espada-engine` depends on by path — each
crate carries its own `Cargo.toml` and `Cargo.lock` (see
[conventions/directory-structure.md](../conventions/directory-structure.md)).
Cargo compiles a path dependency whether or not the dependent calls it, so
every cross-compilation described below compiles the fork too — which is
what proves it builds for these targets at all.

## Both Binaries Now Exist, and How They Got Here

Both are committed, and this workflow produced them. Its first end-to-end
run built the Android `.so`, both Apple slices and the `.xcframework`,
regenerated the Nitro bindings, and opened the pull request that committed
all three — back when this workflow opened a new pull request of its own for
that commit, a mechanism since replaced twice over: first by committing onto
a pull request a maintainer already had open, then by committing directly
onto whichever branch a maintainer dispatches it against, with no pull
request required at all; see
[Dispatching the Workflow](#dispatching-the-workflow) below for the
mechanism as it exists today.

`espada-engine-artifacts.yaml`'s `verify-android` and `verify-ios` jobs each
link and package the platform they build — an actual `expo prebuild` plus
`gradlew assembleDebug` for Android, an actual `expo prebuild` plus
`pod install` and an unsigned `xcodebuild build` for iOS — every time the
workflow runs, gating its own `commit-to-branch` job so that no binary
reaches a commit until it has been shown to link. Both platforms are
observed the same way and on the same cadence: only when a maintainer
dispatches this workflow, never on an ordinary pull request. No job in this
project's merge-check workflows compiles either platform any more.

## What Compiling the iOS Half Proves

Compiling `modules/espada-engine/`'s iOS half — `verify-ios`'s job, on every
dispatch of this workflow — proves four things that nothing checked before
that job existed:

- **The podspec resolves under CocoaPods.**
  [`EspadaEngine.podspec`](../../modules/espada-engine/EspadaEngine.podspec)
  sits at the module root, with `lib/bridge/` inside its own directory, so its
  `s.source_files = "lib/bridge/*.{h,hpp,cpp}"` resolves directly — the
  podspec used to live under `ios/` instead and had to copy a module-root
  `cpp/` into a gitignored directory to satisfy CocoaPods' own restriction
  against `source_files` outside the pod's own `:path =>` (see that podspec's
  own comment). A `pod install` against it is what actually exercises that
  resolution.
- **Nitrogen's generated C++ and the hand-written HybridObject compile.**
  `modules/espada-engine/nitrogen/generated/shared/c++/` and
  `modules/espada-engine/lib/bridge/EspadaEngineHybridObject.cpp` both
  compile under Xcode's own toolchain, not merely under whatever compiler
  produced them.
- **Nitrogen's generated Objective-C registration links.**
  `modules/espada-engine/nitrogen/generated/ios/EspadaEngineAutolinking.mm`'s
  `+ (void) load` method — Nitro's own autolinking registration — links into
  the compiled app binary.
- **The xcframework is found and linked.**
  `modules/espada-engine/ios/EspadaEngine.xcframework`, referenced by the
  podspec's `s.vendored_frameworks`, is found by CocoaPods and linked into the
  app.

Compiling the iOS half proves only that it **compiles and links**. It proves
nothing about runtime behavior — whether the JavaScript thread stays
responsive, whether teardown leaks worker threads, whether the demo workload
lands in its intended duration — all of which still need a real device or a
maintainer-run Simulator, per
[`modules/espada-engine/README.md`](../../modules/espada-engine/README.md#what-cannot-be-checked-here).
It builds against the `.xcframework` that same dispatch's own `build-ios`
job just produced, downloaded fresh rather than read from whatever was
previously committed — so it proves that this run's own binary links, not
merely that some past one did. It does not itself invoke Cargo and proves
nothing about the Rust cross-compile that produced that binary — that is
`build-ios`'s own verification (see
[The Exported-Symbol Check](#the-exported-symbol-check) below). And it is
not a signed build: it proves nothing about `ios-preview.yaml`'s
code-signing, provisioning, or Firebase distribution steps.

## What It Builds, and Why Both Binaries Are Committed

Android's binary is a `cdylib` cross-compiled for `aarch64-linux-android`
(this project's only supported ABI, `arm64-v8a`) and committed at
`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so`.
Android's CMake target (`modules/espada-engine/android/CMakeLists.txt`) links
it as an `IMPORTED` library — a binary a separate toolchain produced, not one
CMake compiles itself — so an ordinary Android build never invokes Cargo at
all.

iOS's binary is two `staticlib` slices, `aarch64-apple-ios` (device) and
`aarch64-apple-ios-sim` (Apple-silicon simulator), assembled with
`xcodebuild -create-xcframework` into
`modules/espada-engine/ios/EspadaEngine.xcframework`. `lipo` cannot merge
those two slices itself: it keys on CPU architecture alone, and both report
as `arm64`, so an `.xcframework` is the only mechanism that can carry both,
not a preference. The module's podspec references it directly through
`s.vendored_frameworks`, so an ordinary iOS build links a prebuilt archive
rather than compiling Rust.

Both binaries are committed, rather than produced as part of an ordinary app
build, for the same reason this project's iOS preview pipeline exists on a
`macos-latest` runner at all (see
[preview-deployment.md](./preview-deployment.md)): producing the iOS slices
needs a macOS host, and paying for that on every ordinary build — every
`npm run ios`, and every Android or iOS preview dispatch — would spend it far
more often than the Rust crate actually changes. Committing both binaries
means neither app-build
path needs a Rust toolchain, an NDK, or Xcode at all unless the crate itself
changed.

## Dispatching the Workflow

[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)
runs only on `workflow_dispatch`, taking no inputs at all: the branch this
run's artifacts land on is whichever ref a maintainer names through GitHub's
own "Use workflow from" ref selector when dispatching, exactly the branch
`android-release.yaml` already lets its own dispatcher pick the same way — no
pull request needs to already exist naming that branch. There is still no
`pull_request`, `push`, or `schedule` trigger, matching this project's
standing policy (see [preview-deployment.md](./preview-deployment.md)) that
anything spending macOS-runner minutes runs only when a human explicitly asks
for it. Its concurrency group is keyed on the dispatched branch name
(`github.ref_name`), with `cancel-in-progress: true`.

It runs seven jobs. `preflight` (`ubuntu-slim`) refuses the run, before any
other job starts, when the dispatched ref is not eligible: `github.ref_type`
must be `branch` (a tag fails here — a pull request's own branch could never
have been one, so the pull-request-based version of this workflow never
needed this check), and `github.ref_name` must not equal this repository's
own default branch, `main` (`github.event.repository.default_branch`). It
makes no GitHub API call to do this, unlike the pull-request-resolution guard
it replaces — `github.ref_type`, `github.ref_name`, and
`github.event.repository.default_branch` are all already available on the
run's own context, the same no-API-call idiom `android-release.yaml`'s header
comment documents for resolving its own dispatched commit. The guard itself
is new to this workflow, though, not something `android-release.yaml` shares:
that workflow carries no default-branch or tag check at all, since releasing
from `main` is its whole point. `build-android` (`ubuntu-latest`,
`needs: preflight`) cross-compiles the `.so` and verifies its page alignment
and its exported C ABI (both below), failing the job — and never uploading an
artifact — if either check does not pass; `build-ios` (`macos-latest`,
`needs: preflight`) builds the two Apple slices, verifies each slice's own
exported C ABI (below), assembles the `.xcframework`, then verifies it
carries exactly the `ios-arm64` and `ios-arm64-simulator` slices and no
others; `generate-bindings` (`ubuntu-latest`, `needs: preflight`) runs
`npm run nitrogen:espada-engine` against this module's `.nitro.ts` spec to
produce its generated C++ bindings, registration, and per-platform
autolinking files — it carries no further `needs:` and runs concurrently
with the two build jobs, since Nitrogen reads only the TypeScript spec and
`nitro.json` and the Rust cross-compiles do not depend on its output in
either direction. `build-android`, `build-ios`, and `generate-bindings` share
nothing but the exact commit GitHub already fixed for the whole run at
dispatch time, and run in parallel once `preflight` clears the dispatch
target — each job's own plain `actions/checkout@v7` step, with no `ref:`
override, resolves to that same commit on its own, the identical behavior
`android-release.yaml` already relies on for its own jobs.

Two verification jobs then gate the commit, before any binary reaches the
dispatched branch. `verify-android` (`ubuntu-latest`, `needs: [preflight,
build-android, generate-bindings]`) downloads both, places them at their
committed paths, and runs an actual `expo prebuild` plus `gradlew
assembleDebug` against them. `verify-ios` (`macos-latest`, `needs:
[preflight, build-ios, generate-bindings]`) does the iOS equivalent — `pod
install` plus an unsigned `xcodebuild build` — and is what
[What Compiling the iOS Half Proves](#what-compiling-the-ios-half-proves)
above describes. Both compile jobs build against the artifacts *this run*
produced, not whatever is already committed, so the exact binary about to
be committed is what gets compiled.

`commit-to-branch` (`ubuntu-slim` — it only downloads the five artifacts,
writes them to their committed paths, and pushes a commit directly onto the
dispatched branch by name through a plain `git push`, then writes the result
to the run's own job summary; no dependency install, no build) needs
`preflight` plus all five of the jobs above: no binary reaches a commit
until it has been shown to build and to link on both platforms.

**It is not shown to pass `cargo fmt`, `cargo clippy`, or `cargo test`
first, and it used to be.** A `rust-checks` job in this workflow ran those
three and gated the final job — since renamed to `commit-to-branch` —
alongside the two compile jobs. They now run only in Rust Merge Checks
(`rust-merge-checks.yaml`)'s own `lint` and
`test` jobs, which run on a pull request touching
`modules/espada-engine/lib/espada-engine/**`.
This workflow builds from the exact commit GitHub fixed for the dispatched
branch at dispatch time, so a dispatch against a branch whose Rust never went
through such a pull-request check commits binaries no Cargo command has
vetted. The guarantee this workflow makes is narrower than it was, and
nothing here restores it.

`commit-to-branch` itself downloads every artifact and commits them at
their exact committed paths — replacing `modules/espada-engine/nitrogen/generated/`
wholesale, so a file Nitrogen no longer generates is actually removed
rather than left stale — directly onto the dispatched branch, with a plain
`git push` (no force: a non-fast-forward push fails loudly rather than
overwriting a concurrent human push). It refuses to commit, and writes
nothing to the job summary, when the built artifacts are byte-identical to
what is already committed.

Nothing about that push depends on a pull request existing for the
dispatched branch, but if one happens to be open against it, it does not
start its own checks on its own — those checks do still exist. The push is
made with the default `GITHUB_TOKEN`, and
[GitHub's events reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
states that "when a pull request is created or updated by a workflow using
`GITHUB_TOKEN`, `pull_request` events with the `opened`, `synchronize`, or
`reopened` activity types create workflow runs that require approval", and
that "with the exception of `workflow_dispatch` and `repository_dispatch`,
other `GITHUB_TOKEN`-triggered events do not create workflow runs at all".
The blanket rule is the second sentence, and a pull request is the exception
to it: pushing a commit onto a branch a pull request happens to point at is
exactly the `synchronize` activity type that exception names, so — if a pull
request is open for the dispatched branch — each of this project's three
merge-check workflows' run against it is created, and then held.

Approving them is the whole remedy, when there is a pull request to approve
them on. The same page states that "a user with write access to the
repository can approve these runs from the pull request page", so the
maintainer opens that pull request and approves the pending workflows there.
Nothing has to be pushed again and the pull request does not have to be
reopened. What runs afterwards is an ordinary run of each of those three
workflows against that pull request's own diff, binary paths included. No
job in any of them inspects those paths any more, so nothing needs to carve
this branch out; the runs simply have nothing to say about the binaries.

Closing and reopening a pull request that happens to be open stays
documented for one case: there is no pending run left to approve, because
[GitHub states](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/approve-runs-from-forks)
that "workflow runs that have been awaiting approval for more than 30 days
are automatically deleted". That sentence carries no qualification, but the
page it sits on is scoped to approving runs from forks, while this pull
request is a same-repository branch held by a different approval mechanism.
The 30 days is read here as the general statement it is written as, not as a
figure confirmed for this case.

That a reopen then produces a run nobody has to approve is not something
GitHub states outright — no primary source addresses what happens when a
person reopens a pull request this workflow pushed a commit to. It follows
from the condition quoted above: a reopen the maintainer performs is not a
pull request updated by a workflow using `GITHUB_TOKEN`, so the run it
creates falls outside the approval requirement, and `reopened` is one of the
three `pull_request` activity types a workflow runs on by default. Pushing
an empty commit would work for the same reason and is deliberately not
offered as a second option: it leaves an empty commit on the branch and buys
nothing a reopen does not.

Closing and reopening a pull request that happens to be open is the whole
fallback here; there is no branch name to preserve or regenerate, since this
workflow pushes onto the dispatched branch by name rather than creating a
new one. `merge-checks.yaml` used to carry a guard that failed any pull
request touching the committed binary paths unless the head ref matched
`add-espada-engine-binaries-<12 hex characters>` — the branch name this
workflow generated back when it opened a new pull request of its own; that
guard has been removed, and with it any reason a branch name here would need
to matter.

**Nothing now flags a hand-edited committed binary.** That guard was the only
thing that did. What still verifies the artifacts is this workflow's own
alignment, symbol, slice-count, and compile checks, which run before the
binaries are committed — an approved run of any of this project's
merge-check workflows adds nothing about them either way.

## Producing These Artifacts Happens Only in This Workflow

There is no local script that reproduces any part of this on a maintainer's
own machine. A contributor who never touches `modules/espada-engine/` needs
no Rust toolchain and no local step to produce it — running the app, and
every ordinary pull request, builds against whatever is already committed.
An Android build still fetches an NDK, though: this module's own C++ bridge
compiles through its own CMake target on every Android build — Cargo is
never invoked, since the Rust `.so` it links is `IMPORTED` — and React
Native's own autolinked native modules compile C++ as well.
Iterating on the Nitro spec itself still has a local command,
`npm run nitrogen:espada-engine` (see `package.json`), but that only
regenerates bindings from the spec — it invokes no Rust toolchain and
produces no binary.

**Running it is now the only thing that keeps the committed bindings honest,
and nothing checks that anyone did.** `merge-checks.yaml` used to carry a
`nitrogen-drift` job that ran the generator on a pull request and failed on
any resulting diff; it has been removed and nothing replaced it. A spec
change committed without regenerating, or a hand-edit to
`modules/espada-engine/nitrogen/generated/**`, now passes every check this
project has and surfaces only when a dispatch of this workflow next
regenerates the tree wholesale. Regenerating the committed bindings and rebuilding either binary
happens by dispatching `espada-engine-artifacts.yaml`, which writes each
artifact directly to its committed path only after its own verification
(below) passes — a build that fails, or an artifact that fails a check,
never reaches `commit-to-branch` and is never committed.

## Resolving the NDK Version

Neither the workflow nor the crate hard-codes an NDK version. Expo's own
root-project Gradle plugin (`ExpoRootProjectPlugin`, in
`expo-modules-autolinking/android/expo-gradle-plugin`) sets
`rootProject.ext.ndkVersion` — which every generated `android/*/build.gradle`
reads — from a version catalog it builds from
`node_modules/react-native/gradle/libs.versions.toml`, and nothing in this
app overrides that value. The `build-android` job reads that same file at
run time and installs exactly the numeric NDK package it names
(`sdkmanager --install "ndk;<version>"`), so there is no letter-release name
(such as "r27d") to map incorrectly, and the workflow tracks whatever version
a future Expo SDK bump pins rather than a value hard-coded against today's.

**The NDK version this project resolves to today is `27.1.12297006`, which
is r27** — read directly from `node_modules/react-native/gradle/libs.versions.toml`'s
`ndkVersion` entry in this tree. r27 predates r28, the release after which
the NDK began emitting 16 KB-aligned output by default, so the linker flag
in the next section is genuinely required for this project's build today,
not a defensive default against some future NDK that would need it anyway.

## The 16 KB Page-Alignment Requirement

Google Play has required 16 KB page alignment for native code since
2025-11-01. NDK r28 and later emit that by default; r27 and earlier —
exactly the version this project resolves to, per the previous section — do
not, and need `-Wl,-z,max-page-size=16384` passed to the linker explicitly.

**Two native libraries need it, and each carries the flag a different way.**
`build-android`'s `Cross-Compile for arm64-v8a` step passes it to the Rust
cross-compile unconditionally, through
`CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS` set only in the
environment — never through a committed `.cargo/config.toml` — because it is
harmless on r28+ and required on r27 and earlier, and setting it
unconditionally means the build does not need to branch on which NDK
release produced it. The C++ Nitro `HybridObject`,
`modules/espada-engine/android/CMakeLists.txt`'s `EspadaEngine` target,
carries the identical flag committed directly on the target itself —
`target_link_options(EspadaEngine PRIVATE "-Wl,-z,max-page-size=16384")` —
because Gradle and CMake compile that target on every Android build rather
than through a cross-compile invocation the flag could ride along with the
way the Rust one does; the flag does not live only in the workflow's
environment.

**Two checks verify the result, at two different points.** `build-android`'s
own `Verify 16 KB Page Alignment` step reads every `PT_LOAD` segment's
alignment out of the freshly cross-compiled Rust `.so` alone, with
`readelf -lW`, and fails the job — refusing to upload an unaligned
artifact — unless the largest one is at least 16384 bytes; this is the check
that ran before this section described a second library at all, and it is
unchanged. `verify-android`'s own step of the same name, added alongside
this section's correction, reads the identical alignment out of both
`libEspadaEngine.so` and `libespada_engine.so`, extracted from the APK its
own `gradlew assembleDebug` step (in the same job) has just produced, and
fails the job — naming the offending library and the alignment found — if
either is below 16384 bytes, is missing from the APK, or carries no `LOAD`
segment at all. It checks these two libraries by name rather than every
arm64 `.so` the assembled build bundles; see
[decisions/2026-09-02-scope-the-page-alignment-gate-to-this-projects-own-libraries.md](../decisions/2026-09-02-scope-the-page-alignment-gate-to-this-projects-own-libraries.md)
for why a dependency-owned library is deliberately outside that scope.
Because this project's own NDK is r27, an r27 default build
without either linker flag should produce a 4096-byte-aligned binary, which
each check would then catch — that reasoning has not been exercised against
a real run of this workflow yet (see
[Both Binaries Now Exist, and How They Got Here](#both-binaries-now-exist-and-how-they-got-here)
above), so it is stated here as the expectation each check is designed
against, not as an observed run. Nothing analogous applies to iOS: Apple
states no equivalent page-size requirement for `.xcframework` content.

## Caching the C++ Bridge's Compiler Object Files

`modules/espada-engine/android/CMakeLists.txt`'s own `EspadaEngine` target
recompiled from scratch on every run of the three workflows that assemble or
verify an Android build — `android-preview.yaml`'s and `android-release.yaml`'s
`build` jobs, and `espada-engine-artifacts.yaml`'s `verify-android` job —
until ccache started covering it. This is a distinct compile stage from the
two caches this project already had: the Cargo cache
([`.github/actions/setup-rust`](../../.github/actions/setup-rust/action.yml))
covers only the Rust crate's own `target/` directories, and Gradle's
dependency cache (the `Cache Gradle` step in
[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)'s
`verify-android` job) covers `~/.gradle/caches` and `~/.gradle/wrapper`, not
the separate `.cxx` build directory CMake/NDK writes its own object files
into. Neither reaches this target's compile at all, which is why it stayed
uncached until now.

[`.github/actions/setup-ccache`](../../.github/actions/setup-ccache/action.yml)
installs ccache (`hendrikmuhs/ccache-action`, pinned per
[conventions/security.md](../conventions/security.md)) and restores its
persisted cache directory, in each of the three jobs above, before that
job's own native compile step runs. `CMakeLists.txt` then locates it with
CMake's own `find_program(CCACHE_PROGRAM ccache)` and sets
`CMAKE_C_COMPILER_LAUNCHER`/`CMAKE_CXX_COMPILER_LAUNCHER` to it only when
found — never unconditionally. `find_program` returns empty rather than
failing when the tool is absent, so a developer building the Android app
locally without ccache installed gets exactly the build this file already
produced before this change, with no flag to thread from Gradle and no new
local dependency to install; CI, where the composite action above installs
ccache first, picks up the speedup automatically.

The persisted cache's own key and restore-keys are both just this job's own
`cache-key-prefix` — no file hash in either. `hendrikmuhs/ccache-action`
appends a real timestamp only when it *saves* a cache, so a later run's own
exact-match attempt on the key never hits by itself; what actually finds the
persisted directory across separate CI runs is `restore-keys`' own prefix
match against the most recent prior save under that same stable prefix,
which succeeds regardless of what changed since that save. Which individual
object file inside the restored directory then hits or misses is entirely
ccache's own content-addressed hashing — of the source, the compiler
binary, and the flags — not this key's job at all: hashing the bridge's own
sources or the NDK version into the outer key would only make the persisted
directory itself unreachable the moment either changed, without making any
single object's hit/miss decision any more precise.

The persisted directory is capped at a fixed `max-size: 200M`, given this
same set of jobs' own prior history of running a runner out of disk mid
native-compile — see the `Reclaim Disk Space` step each of them already
runs, added for exactly that failure mode. 200 MB is an initial cap, not a
measured one; a maintainer who dispatches one of these jobs and finds the
bridge's own object-file footprint meaningfully smaller or larger is
expected to adjust it once a real dispatch has something to measure against.

None of the three affected workflows trigger on `pull_request` — all three
stay `workflow_dispatch`-only, matching this project's own standing
runner-cost policy (see [Dispatching the Workflow](#dispatching-the-workflow)
above and [preview-deployment.md](./preview-deployment.md)) — so this
cache's actual cross-run persistence, and the hit/miss statistics
`ccache -s` prints into each job's own log, are only observed once a
maintainer actually dispatches one of them; nothing in this repository's own
pull-request checks exercises it.

## The SONAME Requirement

Every shared object should carry a `DT_SONAME` entry naming itself. It is
what a consumer's own `DT_NEEDED` entry records at link time in place of
whatever path the library was linked from, so the dynamic linker can find it
by name at load time rather than by wherever it happened to sit on the
machine that produced the consumer. The NDK's own toolchain sets one by
default; `cargo ndk` driving `rustc` does not, and the committed
`libespada_engine.so` carries no `DT_SONAME` at all.

Its absence is what crashed the Android preview build. Given a
`SONAME`-less library by path, a linker records the full path it was given
as the consumer's `DT_NEEDED` entry instead — so the committed
`libEspadaEngine.so` asked the device to open the build runner's own
absolute path to `libespada_engine.so`, a file that exists nowhere on the
device. Since API 23 the Android dynamic linker honours `DT_NEEDED` exactly
rather than falling back to a bare basename, so `dlopen` failed, the
module's native initialization rethrew, and the app died during Expo module
registration before any JavaScript ran.

Two mechanisms fix this, and both are kept rather than either replacing the
other. `modules/espada-engine/android/CMakeLists.txt` sets
`IMPORTED_NO_SONAME TRUE` on the `espada_engine` imported target, which
tells CMake the library has no `SONAME` and stops it from substituting the
absolute path in its place — this is what makes the link correct against
the binary already committed today, without waiting for a rebuild, and
stays correct against any future binary that is ever committed without a
`SONAME` too. The `Cross-Compile for arm64-v8a` step in
`espada-engine-artifacts.yaml` also passes
`-C link-arg=-Wl,-soname,libespada_engine.so`, giving the binary the
attribute it should have carried from the start — this is what fixes the
binary itself, but only for a `.so` produced by a dispatch from here onward;
it does nothing for the one already committed. Together, the CMake property
covers what is committed now and whatever might ever be committed without a
`SONAME`, and the linker flag covers what gets built correctly starting with
the next dispatch.

Nothing in this workflow or in any merge-check workflow verifies that a
built `.so` actually carries the `SONAME` this section describes; adding
such a check is tracked separately in
[issue #57](https://github.com/axross/juicio/issues/57).

## The XCFramework's `Info.plist` Reorders Itself, and That Is Accepted

`xcodebuild -create-xcframework` does not write its `AvailableLibraries`
array in a stable order. The slices themselves are reproducible — the two
`.a` files come out byte-identical run to run — but the two entries
describing them swap places between runs, so a dispatch that changed nothing
can still produce a committed diff whose entire content is those two entries
trading places.

**This is an Apple defect, not a defect here.** It is reported at
<https://developer.apple.com/forums/thread/689673>, where the `-library`
arguments are passed in a fixed order and the output still reorders. No
Apple engineer replied and it remains unfixed. It is not argument-order or
filesystem-order dependent.

**Do not normalize it.** A step that sorted the array by `LibraryIdentifier`
was written and then removed deliberately. Post-processing a vendor tool's
output is what the reproducible-builds community recommends when upstream
cannot be fixed, so the step was not wrong in itself — but it existed only
to make git diffs of a committed, regenerated binary meaningful, and the
maintainer chose to accept the churn rather than carry code that
compensates for it. Whether these artifacts should be committed at all,
rather than published and fetched with a checksum the way comparable
projects do, is tracked in
[issue #36](https://github.com/axross/juicio/issues/36).

The consequence to expect: a dispatch that changes nothing may still commit a
diff onto the dispatched branch whose only content is this reordering. It is
safe to leave as is, or to revert by hand.

## The Exported-Symbol Check

`espada-engine-artifacts.yaml`'s `build-android` and `build-ios` jobs each also
verify, for the platform they build, that the built binary's own exported C
ABI matches every `.rs` file directly under
`modules/espada-engine/lib/espada-engine/src/` — the
`#[no_mangle] pub extern "C" fn` / `pub unsafe extern "C" fn` names that
crate declares, across all of its FFI source files, not just one. This
exists because it is the check that would have caught this project's own
past incident: a committed `.so` that kept exporting the old
`juicio_native_*` names after the C ABI was renamed to `espada_engine_*`,
undetected until someone happened to inspect the binary by hand. This logic
used to live in this project's now-deleted local rebuild script; it moved
into these two jobs when producing these artifacts moved entirely into this
workflow. It originally scanned only `ffi.rs`, the crate's sole FFI source
file at the time; once a second one, `equity_ffi.rs`, was added, that
single-file scan stopped seeing its three exported symbols, so both jobs
now scan every `.rs` file in that directory instead.

For Android, the check is an exact-set comparison: `readelf -sW`'s defined
(non-`UND`), `GLOBAL`, `FUNC` dynamic symbols in the built `.so` must be
exactly the names those source files declare, no more and no fewer. For
iOS, each of the two Apple `.a` slices is checked with `llvm-nm` instead —
a subset check, not an exact-set one, because a static library is an
intermediate artifact that legitimately carries many other global
(mangled) Rust symbols a cdylib's dynamic symbol table would not; what the
check still refuses is exactly the failure above, an expected C ABI name
missing or renamed.

**It has to be the Rust toolchain's `llvm-nm`, not Xcode's `nm`**, and the
reason is worth knowing before someone "simplifies" it back. Rust's
distributed sysroot rlibs carry an embedded `__bitcode` section beside
`__text`, and Apple's `nm` parses that section as LLVM IR. Rust 1.98 writes
it with LLVM 22; Xcode 26 reads it with an older LLVM and gives up:

```
nm: error: ...rcgu.o: Unknown attribute kind (105)
(Producer: 'LLVM22.1.8-rust-1.98.0-stable' Reader: 'LLVM APPLE_1_2100...')
```

That is an inspection failure only. The native code is present and intact —
extracting the archive built by this workflow's own toolchain shows all 393
members to be Mach-O objects carrying `__text`, none of them bitcode-only —
and Apple's linker uses `__text` and ignores `__bitcode`, which it has done
since dropping bitcode support in Xcode 14. Suppressing the embedded bitcode
instead is not an option: `-C embed-bitcode=no` combined with `-C lto` makes
rustc abort at start-up, and the release profile sets `lto = "fat"` for the
Android binary's size budget.
Either check fails its job — refusing to upload the binary as an artifact —
the moment it finds a mismatch, so a wrong-symbol build never reaches
`commit-to-branch` to be committed.

**That covers the binary this run built, and nothing else.**
`merge-checks.yaml` used to carry an `abi-parity` job running the same
comparison against the *already-committed* Android `.so`, as a second,
independent implementation of the same extraction logic; it has been removed
and nothing replaced it. So the two sides of the C ABI are compared at build
time, on a manual dispatch, and at no other moment: a committed `.so` that
has gone stale against the crate's FFI source files is caught by nothing
until the next dispatch rebuilds it.

The iOS half has no equivalent in any of this project's merge-check
workflows either, and could not have one — none of the three runs on a
macOS runner, and compiling for iOS needs one.
`espada-engine-artifacts.yaml`'s `verify-ios` job does compile
it, on `macos-latest`, unsigned, gating that workflow's own
`commit-to-branch` job — see
[What Compiling the iOS Half Proves](#what-compiling-the-ios-half-proves)
above.

## What This Costs, and What Is Still Unmeasured

Every `espada-engine-artifacts.yaml` dispatch that runs `build-ios` spends
macOS-runner minutes at the same roughly 10.3x rate
[preview-deployment.md](./preview-deployment.md#why-both-pipelines-are-manually-dispatched-not-triggered-by-every-pull-request)
already accepts for iOS preview builds — $0.062/minute against $0.006/minute
for `ubuntu-latest`, per GitHub's published runner pricing. The
manual-dispatch-only trigger is what bounds it here the same way it does
there: nothing about an ordinary app build or an ordinary pull request
against this project's own code ever runs this workflow — only a Rust-crate
change or a maintainer's own explicit dispatch does.

The `.xcframework` is committed and measurable: **50,015,969 bytes** across
its two slices and its `Info.plist` — 47.7 MB, roughly 36 times the
Android binary. That ratio is expected rather than alarming. Android ships a
`cdylib` that rustc has already linked and stripped; iOS ships two
`staticlib` archives, which are intermediate artifacts carrying every object
of the Rust standard library so that the app's own linker can select from
them. Only a fraction reaches an application binary.

The Android binary **is** measured. Built against NDK r27b (by this
project's former local rebuild script, before it was deleted), with the
release profile (`lto = "fat"`, `codegen-units = 1`, `strip = true`)
`espada-engine`'s own manifest sets:

| | Bytes | |
| --- | --- | --- |
| That local build | 359,832 | 0.34 MB — inside the 1 MB budget |
| The same, with `espada` reachable | 1,164,072 | 1.11 MB — **over** the 1 MB budget |

The second figure is not a projection. It was measured by adding one
`extern "C"` function calling `espada::hand_range::HandRange::from_str`,
rebuilding, and reverting — the probe was never committed. The difference,
roughly 785 KB, is `espada` and its `regex` dependency becoming reachable
and therefore surviving `lto` and `strip`.

**Neither row is the binary shipped today.** Both were measured against that
one local build, and they are left paired that way because the difference
above is the difference between them; re-baselining either would break that
arithmetic without producing a matching second measurement. The `.so`
actually committed at
`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so`
was produced by `espada-engine-artifacts.yaml` and measures **1,375,968
bytes** — 1.31 MB, **over** the 1 MB budget, as of the rebuild issue #138
dispatched (see below). There is no workflow-built counterpart to the second
row: the `espada`-reachable probe was never committed, so it has only ever
been measured locally.

**Every figure in this section names a specific build, and a dispatch that
replaces a binary invalidates the ones that describe it.** The two
workflow-built numbers above — the `.xcframework` total and the committed
`.so` — were re-measured when the binaries were last rebuilt. A change that
commits new binaries updates both in the same change; leaving them stale is
how this section stops being a measurement and becomes a claim. The
local-build rows are exempt, because they deliberately describe a build
that no longer exists — as is any earlier committed-binary figure a later
rebuild has since superseded, once this section itself has been updated to
the newer one; the point below records what each rebuild has measured, not
a gap arithmetic between the local-build baseline and whatever real feature
work the committed binary has since grown to include.

**That 785 KB is already the optimised figure.** Upstream narrowed `regex`
to `default-features = false, features = ["std", "perf"]` before the commit
`espada-internal` was forked from, dropping its Unicode tables from linked
binaries, and the copy carries that narrowing. So the obvious size lever has
already been pulled — whoever confronts this budget should not expect to
find it unpulled.

**That moment has arrived, in the code, and the committed binaries have
caught up with it.** [issue #103](https://github.com/axross/juicio/issues/103)
wired equity evaluation through the C ABI: `equity_ffi.rs`'s
`espada_engine_equity_start` and `equity_job.rs` call directly into
`espada::evaluator::EquityEvaluator` (by way of `Card` and `HandRange`) at
runtime, so `espada` is no longer dead weight the linker merely carries. A
maintainer-dispatched `espada-engine-artifacts.yaml` run following issue
#103 committed binaries reflecting that, measuring 1,365,128 bytes for the
Android `.so` — already over the 1 MB budget, matching the local-build
probe's estimate above to within a few thousand bytes.
[Issue #138](https://github.com/axross/juicio/issues/138) then added a
per-card-pair distribution to the same win/tie/equity computation and
dispatched the workflow again, landing the **1,375,968-byte** `.so` and the
**50,015,969-byte** `.xcframework` measured above — the current committed
figures. The gap over budget widens with this kind of change: whoever next
confronts it should treat the budget as something to re-decide with the
real, measured figure in hand, not discover after the fact.

## A Failing Build Must Not Look Like a Passing One (a Retired Hazard)

This project's own former local rebuild script — since deleted, now that
producing these artifacts lives entirely in `espada-engine-artifacts.yaml` —
once had a real defect worth recording here, because it is exactly the kind
of thing a script like it, or a future workflow step, could reintroduce.
That script called `build_android` and `build_ios` as `if` conditions, and
POSIX suppresses `set -e` for the entire body of a command used that way: a
cross-compile failed to compile, `set -e` did not fire, the
is-the-output-there check was satisfied by the *previous* run's binary, and
the script verified that stale artifact's page alignment and reported
"Android: built". Anything that read the script's output as evidence — a
maintainer, a commit message, a pull request body — was one compile error
away from being told a stale binary was a fresh one.

That specific hazard does not carry over to this workflow's own jobs, for
two structural reasons rather than by construction of any equivalent
safeguard: each `espada-engine-artifacts.yaml` job runs on a freshly
provisioned GitHub Actions runner with no prior run's artifact anywhere on
disk, so there is no stale binary a same-path check could be satisfied by;
and each build and verification step here is its own top-level workflow
step, evaluated by GitHub Actions' own step-level failure semantics, not a
shell function invoked as an `if` condition inside a `set -euo pipefail`
script — so there is no construct here for `set -e` to be suppressed inside.
The lesson — that an is-the-output-there check is not the same thing as
did-this-step-succeed — is still worth carrying into any future change to
these jobs, which is why this section stays.
