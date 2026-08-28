---
status: accepted
---

# Produce the Committed Native Artifacts in CI, Not Locally

Nitro compiles this module's C++ as part of the consuming app's own build. Nothing compiles
its Rust, and nothing generates its Nitro bindings: neither Nitro nor Nitrogen nor Expo nor
Gradle invokes Cargo, and the Nitro documentation describing how to build a Nitro module
never mentions Rust, Cargo, cross-compilation, or a prebuilt binary of any kind. Something
has to close that gap.

## What this project does

Three artifacts are committed to this repository — the Android `.so`, the iOS
`.xcframework`, and the Nitrogen-generated tree under `nitrogen/generated/` — and **all
three are produced by one manually dispatched GitHub Actions workflow**, which opens a pull
request carrying them. There is no local build script. `npm run android` and `npm run ios`
compile the C++ against whatever is committed, exactly as they did before this module
existed.

The workflow runs the three producers in parallel, because none depends on another: Android
cross-compilation on a Linux runner, iOS cross-compilation and `.xcframework` assembly on a
macOS runner, and Nitrogen on a Linux runner. Nitrogen reads only the TypeScript spec and
`nitro.json`, so it has no relationship to the Rust build at all; a later reader tempted to
serialise them should know that ordering would buy nothing.

## Why, and what was rejected

The deciding constraint throughout was **who pays**. This is a mobile app whose native
module is one small part of it. Any arrangement that puts a Rust cross-compilation
toolchain on the critical path of running the app charges every contributor — including one
who only ever touches TypeScript — for a capability almost none of them need.

**Invoking Cargo from inside the Gradle and Xcode build graphs** was investigated in detail
and rejected. Beyond the toolchain cost it fails on three counts. There is no maintained
Gradle plugin: `mozilla/rust-android-gradle` last released in August 2022,
`willir/cargo-ndk-android-gradle` in February 2021, and the only currently-releasing option
is a third-party fork with little adoption. The wiring those plugins document is also wrong
for this module — they depend on `merge<Variant>JniLibFolders`, the packaging step, but this
module's `android/CMakeLists.txt` declares the Rust library as an **IMPORTED** target and
links it during `externalNativeBuild`, which runs earlier. And the iOS half is fragile in
practice: a CocoaPods `script_phase` must be `:execution_position => :before_compile` to
have any ordering guarantee against linking, the library cannot go through
`vendored_libraries` because that resolves paths at `pod install` time, and telling an
Apple-silicon simulator slice from a device slice needs `$LLVM_TARGET_TRIPLE_SUFFIX` since
both report `arm64`. Mozilla's Glean does exactly this in production and its own writeup
warns the steps are Xcode-version-dependent and have needed manual project-file edits.

That matches the wider state of practice, which was checked rather than assumed: the two
most comparable React Native and Expo guides both commit prebuilt binaries, and the most
actively maintained tool in the space, `uniffi-bindgen-react-native`, invokes Cargo through
an explicit step run *before* `pod install` and Gradle rather than inside them.

**Chaining a rebuild into `npm run android` and `npm run ios`** avoids all of that
fragility — it is just two commands in sequence — and was still rejected, because it puts
Cargo on the critical path of running the app and so charges the same toll to everyone.

**A local rebuild script**, run by hand and committed by hand, was this project's own
previous answer and is also rejected. It requires the toolchain from anyone who rebuilds,
and — more sharply — it duplicates the build logic that the workflow already has to
contain. That duplication is not theoretical: a defect in how `cargo-ndk` resolves its
manifest had to be fixed in the script and the workflow separately, because the same
knowledge was written down twice. One producer, in CI, removes the second copy.

## The cost this accepts

Rebuilding is no longer a local command. Changing the Rust or the spec means dispatching a
workflow and merging its pull request, which is slower than running a script and is a poor
fit for tight iteration. Someone actively developing the Rust will run `cargo` directly
against the workspace instead and dispatch the workflow once the change settles — that is
the intended shape, not a gap.

Dispatching also spends macOS-runner minutes at roughly ten times the Linux rate. The
manual-dispatch-only trigger is what bounds it: no ordinary pull request and no ordinary app
build ever runs this workflow.

A committed artifact can also go stale against the source it was built from. That is not
hypothetical — during this module's development the committed `.so` still exported
`juicio_native_*` after the C ABI had been renamed to `espada_engine_*`, and nothing would
have caught it before the Android link step.

Two merge checks used to catch that class, and neither exists now. One compared the committed
binary's exported dynamic symbols against the `#[no_mangle]` exports in the crate's own
`ffi.rs`; the other regenerated the Nitro bindings and failed on any diff. Both were removed
from `merge-checks.yaml` and nothing replaced them, so a committed artifact going stale
against its source is again caught by nothing on a pull request.

What survives is narrower and sits in the producing workflow rather than in a merge check.
`espada-engine-artifacts.yaml`'s `build-android` job still verifies the exported C ABI of the
`.so` **it has just built**, and refuses to upload it otherwise, so a dispatch cannot produce
a wrong-symbol binary. That says nothing about the binary already committed: between
dispatches, the committed `.so` and `ffi.rs` can drift apart with nothing comparing them.
There is no equivalent for the Nitro bindings at all — `generate-bindings` regenerates them
for the pull request it opens, and no job compares the committed tree against the spec on any
other pull request.

Producing the iOS `.xcframework` still requires a macOS host. That is inherent to shipping
an Apple binary; moving the work into CI changes who owns that host, not whether one is
needed.
