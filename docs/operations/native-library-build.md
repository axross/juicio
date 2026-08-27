# Native Library Build

How this project produces the two binaries `modules/espada-engine/` ships —
`libespada_engine.so` for Android and `EspadaEngine.xcframework` for iOS —
from the Cargo workspace at `modules/espada-engine/lib/`: the
[`build-native-library.yaml`](../../.github/workflows/build-native-library.yaml)
workflow that cross-compiles both and opens a pull request committing them,
and [`scripts/build-native-library.sh`](../../scripts/build-native-library.sh),
which reproduces the same steps on a maintainer's own machine. See
[conventions/directory-structure.md](../conventions/directory-structure.md)
for where the crate and the module live, and
[decisions/2026-08-27-generate-nitro-bindings-and-registration-with-nitrogen.md](../decisions/2026-08-27-generate-nitro-bindings-and-registration-with-nitrogen.md)
for why the binding between them is a Nitro `HybridObject` at all, and
[decisions/2026-08-27-commit-rust-binaries-and-rebuild-them-with-a-dedicated-script.md](../decisions/2026-08-27-commit-rust-binaries-and-rebuild-them-with-a-dedicated-script.md)
for why these binaries are committed rather than built by the app.

**Nitrogen produces none of this.** Nitrogen generates the module's C++
bindings, its registration and its per-platform autolinking files from the
`.nitro.ts` spec — it generates no binary, cross-compiles nothing, and does
not remove the need for a macOS host to produce the `.xcframework`. Below
the JS-facing spec, the C ABI and these two binaries are exactly what they
would be without it.

**The workspace has two crates, and both are built here.** `espada-engine`
produces the shipped library; `espada-internal` is a verbatim copy of
`axross/espada` that `espada-engine` depends on by path. Cargo compiles a
path dependency whether or not the dependent calls it, so every
cross-compilation described below compiles the copy too — which is what
proves it builds for these targets at all. See its `PROVENANCE.md` for what
the copy is and how it is refreshed.

## The Android Binary Exists; the iOS One Does Not

`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so`
has been built by `scripts/build-native-library.sh` against NDK r27b and
committed, and `merge-checks.yaml`'s `native_android_compile` job links and
packages it on every pull request. The Android half of what follows is
therefore observed, not merely described.

`modules/espada-engine/ios/EspadaEngine.xcframework` does **not** exist.
Producing it needs a macOS host with Xcode, which no session that has
authored this project's native code so far has had. Everything below about
the iOS half describes what dispatching the workflow or running the script
on a Mac does — not something that has run and been observed to work. A
maintainer completes that the first time they do either.

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
`npm run ios`, every Android or iOS preview dispatch, every `native_paths` or
`native_android_compile` merge check — would spend it far more often than the
Rust crate actually changes. Committing both binaries means neither app-build
path needs a Rust toolchain, an NDK, or Xcode at all unless the crate itself
changed.

## Dispatching the Workflow

[`build-native-library.yaml`](../../.github/workflows/build-native-library.yaml)
runs only on `workflow_dispatch`, taking a required `base_branch` input
naming what the pull request it opens targets — no `pull_request`, `push`,
or `schedule` trigger, matching this project's standing policy (see
[preview-deployment.md](./preview-deployment.md)) that anything spending
macOS-runner minutes runs only when a human explicitly asks for it. Its
concurrency group is keyed on `base_branch`, with `cancel-in-progress: true`.

It runs three jobs: `build-android` (`ubuntu-latest`) cross-compiles the
`.so` and verifies its page alignment (below); `build-ios` (`macos-latest`)
builds the two Apple slices and assembles the `.xcframework`, then verifies
it carries exactly the `ios-arm64` and `ios-arm64-simulator` slices and no
others; `open-pull-request` (`ubuntu-latest`) waits on both, downloads their
artifacts, commits them at their exact committed paths on a fresh branch, and
opens a pull request against `base_branch`. It refuses to open an empty pull
request when the built binaries are byte-identical to what is already
committed. The two build jobs share nothing but the source commit and run in
parallel.

That opened pull request carries no CI of its own: it is created with the
default `GITHUB_TOKEN`, and GitHub does not trigger other workflows from an
event authored with that token, so `merge-checks.yaml` never runs on it
automatically. This workflow's own alignment and slice-count checks already
verify the binaries before they are committed; pushing an empty commit, or
opening a follow-up pull request, is what gets ordinary checks running on
one of these if that is ever wanted.

## The Local Script

[`scripts/build-native-library.sh`](../../scripts/build-native-library.sh)
(`npm run rust:espada-engine`) reproduces the same cross-compiles on a
maintainer's own machine, building whichever of Android and iOS that machine
can — it does not require both. Its prerequisites:

- **A Rust toolchain** (`rustup`), with the relevant targets — the script
  adds `aarch64-linux-android` or `aarch64-apple-ios`/`aarch64-apple-ios-sim`
  itself, best-effort, before building.
- **For Android**, an NDK discoverable through one of `ANDROID_NDK_HOME`,
  `ANDROID_NDK_ROOT`, `ANDROID_NDK`, or `NDK_HOME` — the same variables, in
  the same order, `cargo-ndk` itself resolves — plus `cargo-ndk` on `PATH`
  (`cargo install cargo-ndk --locked`). Missing either skips the Android
  build with a message naming what to set up, rather than failing the whole
  script.
- **For iOS**, a macOS host with a usable Xcode (`xcodebuild -version` must
  succeed). Missing either skips the iOS build the same way.

The script writes each platform it builds directly to its committed path —
`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so`
or `modules/espada-engine/ios/EspadaEngine.xcframework` — rather than to a
staging directory a maintainer then copies into place by hand. That manual
copy step used to be exactly where a stale binary could slip through: each
platform is built into a private temporary directory first (never a
checked-in path, and removed when the script exits), and only moved to its
committed path once its own verification — the 16 KB page-alignment check
for Android, and the exported-C-ABI-symbol check for both platforms, both
below — passes. A build that fails, or a binary that fails either check,
never touches the committed path at all; the script still leaves committing
the result to `git add` / `git commit`, which stays a maintainer's own
decision. The script exits non-zero if neither platform could be built.

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

The local script resolves the NDK differently — from whichever of the four
environment variables above is already set, rather than reading this
project's own pinned version out of `node_modules/`. That is deliberate: a
maintainer's own machine is not assumed to be inside a fresh `npm ci` the way
the CI job is, and a maintainer deliberately testing a newer NDK should be
able to point at one without editing this script.

## The 16 KB Page-Alignment Requirement

Google Play has required 16 KB page alignment for native code since
2025-11-01. NDK r28 and later emit that by default; r27 and earlier —
exactly the version this project resolves to, per the previous section — do
not, and need `-Wl,-z,max-page-size=16384` passed to the linker explicitly.
Both the workflow and the local script pass it unconditionally, through
`CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS` set only in the environment —
never through a committed `.cargo/config.toml` — because it is harmless on
r28+ and required on r27 and earlier, and setting it unconditionally means
the build does not need to branch on which NDK release produced it.

Both the workflow's `build-android` job and the local script's own
`check_16kb_alignment` function verify the result the same way: every
`PT_LOAD` segment's alignment is read out of the built `.so` with
`readelf -lW`, and the check fails — refusing to leave an unaligned binary
at the output path — unless the largest one is at least 16384 bytes. Because
this project's own NDK is r27, an r27 default build without the linker flag
should produce a 4096-byte-aligned binary, which this check would then
catch — that reasoning has not been exercised against a real build in this
project yet (see [Neither Binary Exists Yet](#neither-binary-exists-yet)
above), so it is stated here as the expectation the check is designed
against, not as an observed run. Nothing analogous applies to iOS: Apple
states no equivalent page-size requirement for `.xcframework` content.

## The Exported-Symbol Check

`scripts/build-native-library.sh` also verifies, for whichever platform it
builds, that the built binary's own exported C ABI matches
`modules/espada-engine/lib/espada-engine/src/ffi.rs` — the
`#[no_mangle] pub extern "C" fn` / `pub unsafe extern "C" fn` names that
crate declares. This exists because it is the check that would have caught
this project's own past incident: a committed `.so` that kept exporting the
old `juicio_native_*` names after the C ABI was renamed to
`espada_engine_*`, undetected until someone happened to inspect the binary
by hand.

For Android, the check is an exact-set comparison: `readelf -sW`'s defined
(non-`UND`), `GLOBAL`, `FUNC` dynamic symbols in the built `.so` must be
exactly the names `ffi.rs` declares, no more and no fewer. For iOS, each of
the two Apple `.a` slices is checked with `nm -gU` instead — a subset check,
not an exact-set one, because a static library is an intermediate artifact
that legitimately carries many other global (mangled) Rust symbols a
cdylib's dynamic symbol table would not; what the check still refuses is
exactly the failure above, an expected C ABI name missing or renamed.
Either check exits the script — refusing to install the binary at its
committed path — the moment it finds a mismatch.

`merge-checks.yaml`'s `rust_checks` job runs the same comparison against the
already-committed Android `.so`, independently, on every pull request and
push to `main` (see [README.md](../../README.md)'s Testing table); the two
checks share the same extraction logic but are two separate implementations,
one in this script and one in that workflow step, not one shared script the
other calls. The iOS half has no CI equivalent, for the same reason no merge
check compiles the iOS native half at all: it needs a macOS host merge
checks do not run on.

## What This Costs, and What Is Still Unmeasured

Every `build-native-library.yaml` dispatch that runs `build-ios` spends
macOS-runner minutes at the same roughly 10.3x rate
[preview-deployment.md](./preview-deployment.md#why-both-pipelines-are-manually-dispatched-not-triggered-by-every-pull-request)
already accepts for iOS preview builds — $0.062/minute against $0.006/minute
for `ubuntu-latest`, per GitHub's published runner pricing. The
manual-dispatch-only trigger is what bounds it here the same way it does
there: nothing about an ordinary app build or an ordinary pull request
against this project's own code ever runs this workflow — only a Rust-crate
change or a maintainer's own explicit dispatch does.

The `.xcframework`'s committed size cannot be recorded here yet, because it
does not exist (see
[The Android Binary Exists; the iOS One Does Not](#the-android-binary-exists-the-ios-one-does-not)
above) — stating a figure now would be inventing one. Whoever first
dispatches this workflow, or runs the local script on a Mac, should record
it here.

The Android binary **is** measured. Built by the local script against NDK
r27b, with the release profile (`lto = "fat"`, `codegen-units = 1`,
`strip = true`) the workspace manifest sets:

| | Bytes | |
| --- | --- | --- |
| As shipped today | 359,832 | 0.34 MB — inside the 1 MB budget |
| With `espada` reachable | 1,164,072 | 1.11 MB — **over** the 1 MB budget |

The second figure is not a projection. It was measured by adding one
`extern "C"` function calling `espada::hand_range::HandRange::from_str`,
rebuilding, and reverting — the probe was never committed. The difference,
roughly 785 KB, is `espada` and its `regex` dependency becoming reachable
and therefore surviving `lto` and `strip`.

**That 785 KB is already the optimised figure.** Upstream narrowed `regex`
to `default-features = false, features = ["std", "perf"]` before the commit
this project vendored, dropping its Unicode tables from linked binaries, and
the copy carries that narrowing. So the obvious size lever has already been
pulled — whoever confronts this budget should not expect to find it
unpulled.

**This is the number the next change inherits.** Nothing calls `espada` at
runtime today, so the copy costs the shipped binary nothing and the budget
holds. The moment equity evaluation is wired through the C ABI, the binary
roughly triples and the 1 MB budget in the plan is breached. Whoever does
that work should treat the budget as something to re-decide with this figure
in hand — not discover after the fact.

## A Failing Build Must Not Look Like a Passing One

`scripts/build-native-library.sh` checks the exit status of every build
command explicitly rather than relying on `set -euo pipefail`. That is not
belt-and-braces: `main()` calls `build_android` and `build_ios` as `if`
conditions, and POSIX suppresses `set -e` for the entire body of a command
used that way.

This guard exists because the failure it prevents actually happened during
this project's own work: a cross-compile failed to compile, `set -e` did not
fire, the is-the-output-there check was satisfied by the *previous* run's
binary, and the script verified that stale artifact's page alignment and
reported "Android: built". Anything that reads this script's output as
evidence — a maintainer, a commit message, a pull request body — was one
compile error away from being told a stale binary was a fresh one.

Each platform now also builds into a fresh, private temporary directory
created once per run (never a checked-in path), which rules out that
specific stale-artifact scenario structurally for Android's own output
directory — a freshly created directory cannot already contain a previous
run's binary. The explicit exit-status checks stay regardless: they are what
catches a build that fails after partially writing output, and — for iOS —
Cargo's own `target/` directory is not fresh on every run (it is a
persistent build cache, not part of the temporary directory above), so the
script still removes a previous run's `.a` there before building, for the
same reason.
