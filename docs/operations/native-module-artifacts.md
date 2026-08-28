# Native Library Build

How this project produces the two binaries `modules/espada-engine/` ships —
`libespada_engine.so` for Android and `EspadaEngine.xcframework` for iOS —
from the Rust crate at `modules/espada-engine/lib/espada-engine/`, and this
module's generated Nitro bindings: all three are produced entirely by the
[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)
workflow, which cross-compiles both binaries, regenerates the bindings, and
opens a pull request committing all three. There is no local script that
reproduces any of this on a maintainer's own machine — a contributor who
never touches `modules/espada-engine/` needs no Rust toolchain, no NDK, and
no local build step at all. See
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

## The Android Binary Exists; the iOS One Does Not

`modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so`
has been built against NDK r27b and committed — by this project's former
local rebuild script, before producing this module's artifacts moved
entirely into `espada-engine-artifacts.yaml` — and `merge-checks.yaml`'s
`native_android_compile` job links and packages it on every pull request.
The Android half of what follows is therefore observed, not merely
described.

`modules/espada-engine/ios/EspadaEngine.xcframework` does **not** exist.
Producing it needs a macOS host with Xcode, which no session that has
authored this project's native code so far has had. Everything below about
the iOS half describes what dispatching `espada-engine-artifacts.yaml` does —
not something that has run and been observed to work. A maintainer completes
that the first time they dispatch it.

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

[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)
runs only on `workflow_dispatch`, taking a required `base_branch` input
naming what the pull request it opens targets — no `pull_request`, `push`,
or `schedule` trigger, matching this project's standing policy (see
[preview-deployment.md](./preview-deployment.md)) that anything spending
macOS-runner minutes runs only when a human explicitly asks for it. Its
concurrency group is keyed on `base_branch`, with `cancel-in-progress: true`.

It runs four jobs: `build-android` (`ubuntu-latest`) cross-compiles the `.so`
and verifies its page alignment and its exported C ABI (both below), failing
the job — and never uploading an artifact — if either check does not pass;
`build-ios` (`macos-latest`) builds the two Apple slices, verifies each
slice's own exported C ABI (below), assembles the `.xcframework`, then
verifies it carries exactly the `ios-arm64` and `ios-arm64-simulator` slices
and no others; `generate-bindings` (`ubuntu-latest`) runs
`npm run nitrogen:espada-engine` against this module's `.nitro.ts` spec to
produce its generated C++ bindings, registration, and per-platform
autolinking files — it carries no `needs:` and runs concurrently with the
two build jobs, since Nitrogen reads only the TypeScript spec and `nitro.json`
and the Rust cross-compiles do not depend on its output in either direction;
`open-pull-request` (`ubuntu-latest`) waits on all three, downloads their
artifacts, commits them at their exact committed paths on a fresh branch —
replacing `modules/espada-engine/nitrogen/generated/` wholesale, so a file
Nitrogen no longer generates is actually removed rather than left stale — and
opens a pull request against `base_branch`. It refuses to open an empty pull
request when the built artifacts are byte-identical to what is already
committed. `build-android`, `build-ios`, and `generate-bindings` share
nothing but the source commit and run in parallel.

That opened pull request carries no CI of its own: it is created with the
default `GITHUB_TOKEN`, and GitHub does not trigger other workflows from an
event authored with that token, so `merge-checks.yaml` never runs on it
automatically. This workflow's own alignment, symbol, and slice-count checks
already verify the binaries before they are committed; pushing an empty
commit, or opening a follow-up pull request, is what gets ordinary checks
running on one of these if that is ever wanted.

## Producing These Artifacts Happens Only in This Workflow

There is no local script that reproduces any part of this on a maintainer's
own machine. A contributor who never touches `modules/espada-engine/` needs
no Rust toolchain, no NDK, and no local build step — running the app, and
every ordinary pull request, builds against whatever is already committed.
Iterating on the Nitro spec itself still has a local command,
`npm run nitrogen:espada-engine` (see `package.json` and
`merge-checks.yaml`'s own `nitrogen_drift` job), but that only regenerates
bindings from the spec — it invokes no Rust toolchain and produces no
binary. Regenerating the committed bindings and rebuilding either binary
happens by dispatching `espada-engine-artifacts.yaml`, which writes each
artifact directly to its committed path only after its own verification
(below) passes — a build that fails, or an artifact that fails a check,
never reaches `open-pull-request` and is never committed.

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
The workflow passes it unconditionally, through
`CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS` set only in the environment —
never through a committed `.cargo/config.toml` — because it is harmless on
r28+ and required on r27 and earlier, and setting it unconditionally means
the build does not need to branch on which NDK release produced it.

The workflow's `build-android` job verifies the result: every `PT_LOAD`
segment's alignment is read out of the built `.so` with `readelf -lW`, and
the check fails the job — refusing to upload an unaligned artifact — unless
the largest one is at least 16384 bytes. Because this project's own NDK is
r27, an r27 default build without the linker flag should produce a
4096-byte-aligned binary, which this check would then catch — that reasoning
has not been exercised against a real run of this workflow yet (see
[The Android Binary Exists; the iOS One Does Not](#the-android-binary-exists-the-ios-one-does-not)
above), so it is stated here as the expectation the check is designed
against, not as an observed run. Nothing analogous applies to iOS: Apple
states no equivalent page-size requirement for `.xcframework` content.

## The Exported-Symbol Check

`espada-engine-artifacts.yaml`'s `build-android` and `build-ios` jobs each also
verify, for the platform they build, that the built binary's own exported C
ABI matches `modules/espada-engine/lib/espada-engine/src/ffi.rs` — the
`#[no_mangle] pub extern "C" fn` / `pub unsafe extern "C" fn` names that
crate declares. This exists because it is the check that would have caught
this project's own past incident: a committed `.so` that kept exporting the
old `juicio_native_*` names after the C ABI was renamed to
`espada_engine_*`, undetected until someone happened to inspect the binary
by hand. This logic used to live in this project's now-deleted local rebuild
script; it moved into these two jobs when producing these artifacts moved
entirely into this workflow.

For Android, the check is an exact-set comparison: `readelf -sW`'s defined
(non-`UND`), `GLOBAL`, `FUNC` dynamic symbols in the built `.so` must be
exactly the names `ffi.rs` declares, no more and no fewer. For iOS, each of
the two Apple `.a` slices is checked with `llvm-nm` instead — a subset check,
not an exact-set one, because a static library is an intermediate artifact
that legitimately carries many other global (mangled) Rust symbols a
cdylib's dynamic symbol table would not; what the check still refuses is
exactly the failure above, an expected C ABI name missing or renamed.

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
`open-pull-request` to be committed.

`merge-checks.yaml`'s `rust_checks` job runs the same comparison against the
already-committed Android `.so`, independently, on every pull request and
push to `main` (see [README.md](../../README.md)'s Testing table); the two
checks share the same extraction logic but are two separate implementations,
one in `espada-engine-artifacts.yaml`'s `build-android` job and one in that
merge-check step, not one shared script either calls. The iOS half has no CI
equivalent, for the same reason no merge check compiles the iOS native half
at all: it needs a macOS host merge checks do not run on.

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

The `.xcframework`'s committed size cannot be recorded here yet, because it
does not exist (see
[The Android Binary Exists; the iOS One Does Not](#the-android-binary-exists-the-ios-one-does-not)
above) — stating a figure now would be inventing one. Whoever first
dispatches this workflow should record it here.

The Android binary **is** measured. Built against NDK r27b (by this
project's former local rebuild script, before it was deleted), with the
release profile (`lto = "fat"`, `codegen-units = 1`, `strip = true`)
`espada-engine`'s own manifest sets:

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
