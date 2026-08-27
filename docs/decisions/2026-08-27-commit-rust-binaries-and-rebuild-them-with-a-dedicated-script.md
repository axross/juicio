---
status: accepted
---

# Commit the Rust Binaries and Rebuild Them With a Dedicated Script

Nitro compiles this module's C++ as part of the consuming app's own build. Nothing compiles
its Rust: neither Nitro nor Nitrogen nor Expo nor Gradle invokes Cargo, and the Nitro
documentation that describes building a Nitro module never mentions Rust, Cargo,
cross-compilation, or a prebuilt binary of any kind. Something has to close that gap, and
there were three ways to do it.

## What this project does

The `.so` and the `.xcframework` are **committed**, and rebuilding them is a dedicated npm
script that the app build never invokes. `npm run android` and `npm run ios` compile the
C++ against whatever binary is committed, exactly as they did before this module existed.

The deciding constraint was not build hygiene but who pays. Every alternative below makes a
Rust toolchain, the `aarch64-linux-android` target and `cargo-ndk` a prerequisite for
running the app at all — including for a contributor who only ever touches TypeScript. This
project is a mobile app whose native module is one small part of it, and making everyone
install a Rust cross-compilation toolchain to run it is a cost paid by many to serve few.

## What was rejected

**Invoking Cargo from inside the Gradle and Xcode build graphs** — a Gradle task plus a
CocoaPods `script_phase` — was investigated in detail and rejected on three counts beyond
the toolchain cost.

There is no maintained Gradle plugin for it. `mozilla/rust-android-gradle`, the one most
real projects use, last released in August 2022; `willir/cargo-ndk-android-gradle` last
released in February 2021; the only currently-releasing option is a third-party fork with
little adoption evidence. Choosing among "battle-tested but dormant", "current but
unproven", and "hand-rolled" is a maintenance liability taken on for a build this project
runs rarely.

The generic wiring advice those plugins give is also wrong for this module specifically.
They document depending on `merge<Variant>JniLibFolders`, which is the packaging step. This
module's `android/CMakeLists.txt` declares the Rust library as an **IMPORTED** target and
links it during `externalNativeBuild`, which runs earlier — so the plugin's own documented
hook would produce the binary after the step that needs it.

And the iOS half is fragile in practice. A CocoaPods `script_phase` must be
`:execution_position => :before_compile` or it has no ordering guarantee against linking;
the library cannot be declared through `vendored_libraries`, which resolves paths at
`pod install` time, so it has to be wired through `LIBRARY_SEARCH_PATHS` instead; and
distinguishing an Apple-silicon simulator slice from a device slice requires reading
`$LLVM_TARGET_TRIPLE_SUFFIX`, since both report `arm64`. Mozilla's Glean does exactly this
in production and its own writeup warns that the steps are Xcode-version-dependent and have
required manual project-file edits.

That is consistent with the wider state of practice, which was checked rather than assumed:
the two most comparable React Native and Expo guides both commit prebuilt binaries, and the
most actively maintained tool in the space, `uniffi-bindgen-react-native`, invokes Cargo
through an explicit CLI step run *before* `pod install` and Gradle rather than inside them.
Transparent in-build-graph compilation is the least-travelled of the three approaches and
everyone doing it reports fragility.

**Chaining the rebuild into `npm run android` and `npm run ios`** was rejected for the
toolchain reason alone. It avoids the build-graph fragility entirely — it is just two
commands in sequence — but it still puts Cargo on the critical path of running the app, so
a JavaScript-only contributor still needs the whole cross-compilation toolchain.

## The cost this accepts, and what pays it down

A committed binary can go stale against the source it was built from. That is not
hypothetical here: during this module's own development the committed `.so` still exported
`juicio_native_*` after the C ABI had been renamed to `espada_engine_*`, and nothing would
have caught it before the Android link step.

Two things address it. The rebuild script writes **directly into the committed paths**
rather than into a staging directory a human then copies by hand — that manual copy was the
gap the stale binary slipped through. And a merge check compares the committed binary's
exported dynamic symbols against the `#[no_mangle]` exports in the crate's own `ffi.rs`,
failing on any difference. That check needs no Rust toolchain and no NDK, so it runs on
every pull request at no meaningful cost, and it is precisely the check that would have
caught the incident above.

What remains unpaid: producing the iOS `.xcframework` still requires a macOS host with
Xcode, once per change to the Rust. That is inherent to shipping an Apple binary and no
arrangement of build tooling avoids it.
