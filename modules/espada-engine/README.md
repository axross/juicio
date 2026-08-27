# `espada-engine`

A local [Nitro](https://nitro.margelo.com) module that lets the app run CPU-bound Rust off
the JavaScript thread, over a C ABI. It is this repository's first custom native module; a
second one would be a sibling directory under `modules/`, not a change to this one.

This document is for someone working **on** this module. If you only consume it from app
code, the one thing you need is that `@/modules/espada-engine/index` is its entire public
surface, and that nothing about it requires a Rust toolchain to build or run the app.

## How a call travels

```
TypeScript          src/espada-job.ts          a job-shaped wrapper
    │                                          NitroModules.createHybridObject('EspadaEngine')
    ▼
generated C++       nitrogen/generated/        spec base class + registration, from the
    │                                          .nitro.ts spec — never hand-edited
    ▼
hand-written C++    cpp/                       subclasses the generated spec, calls the C ABI
    │                                          progress/settle hop to the JS thread via
    ▼                                          Nitro's own dispatcher
C ABI               cpp/espada_engine.h        four extern "C" functions
    ▼
Rust                lib/espada-engine/         the job engine and the demo workload
    │
    └─ path dep ─▶  lib/espada-internal/       a verbatim copy of axross/espada
```

The C ABI is the only path either platform takes into Rust. There is no JNI facade and no
second ABI — see
[`docs/decisions/`](../../docs/decisions) for why.

## Layout

| Path | What it is | Committed? |
| --- | --- | --- |
| `src/` | TypeScript, and nothing but TypeScript. `specs/espada-engine.nitro.ts` is the source of truth for the JS-facing shape. | yes |
| `lib/` | Rust, and nothing but Rust: a Cargo workspace over two crates, plus cargo's `target/`. | sources yes, `target/` no |
| `cpp/` | The hand-written `HybridObject` and the C ABI header. | yes |
| `nitrogen/generated/` | Everything Nitrogen produces. **Never hand-edit**; a merge check regenerates it and fails on any diff. | yes |
| `android/`, `ios/` | Per-platform build files, plus the committed binaries. | yes |
| `nitro.json`, `EspadaEngine.podspec` | Nitro configuration and the pod, at the module root as Nitrogen's own template places them. | yes |

## Working on it locally

Everything below is for **testing that a change works**. It is not how the committed
artifacts are produced — see [Where the committed artifacts come from](#where-the-committed-artifacts-come-from).
Do not commit a binary you built locally.

### The Rust

Run from `modules/espada-engine/lib/`:

```sh
cargo test --workspace                                  # this module's tests and the vendored crate's
cargo fmt --check -p espada-engine
cargo clippy -p espada-engine --all-targets -- -D warnings
```

The scoping is deliberate and not an oversight. `cargo test` runs `--workspace`, so the
vendored crate's own suite runs too — that is what catches a botched refresh of it. Format
and lint are scoped to `-p espada-engine`, this project's own crate, because the only way to
satisfy a gate the copy fails is to edit the copy, and an edited copy is no longer diffable
against upstream.

### The Nitro bindings

From the repository root:

```sh
npm run nitrogen:espada-engine
```

This regenerates `nitrogen/generated/` from `src/specs/espada-engine.nitro.ts` and
`nitro.json`. Re-running it against an unchanged spec must leave no diff; a merge check
enforces exactly that.

The generator is invoked as `nitrogen src/specs`, with the spec directory as its scan root
rather than the module root. That is load-bearing: Nitrogen's scan is a bare glob with no
default ignores at all — not even `node_modules` — so pointing it at the module root would
walk `lib/target/`. This is why `nitro.json` needs no `ignorePaths` entry.

### The Android binary

Needs `rustup` with the `aarch64-linux-android` target, `cargo-ndk`, and NDK **r27**
(`27.1.12297006` — the version the root Gradle project resolves). Run from
`modules/espada-engine/lib/espada-engine/`:

```sh
export ANDROID_NDK_HOME=/path/to/ndk/27.1.12297006
CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
  cargo ndk -t arm64-v8a -o /tmp/espada-out build --release
```

Two things here are not optional and not obvious.

Run it **from the crate directory**. `cargo-ndk` resolves its manifest from the working
directory and ignores `--manifest-path` for that purpose, so invoking it from the repository
root fails no matter where you put that flag.

The `max-page-size=16384` link flag is **required** on NDK r27, which is what this project
resolves. Google Play has required 16 KB page alignment for native code since 2025-11-01,
and r27 does not do it by default; r28 would. Set it through the environment only — never
through a committed `.cargo/config.toml`.

### The iOS binary

Needs macOS with Xcode, plus the `aarch64-apple-ios` and `aarch64-apple-ios-sim` targets.
From `modules/espada-engine/lib/`:

```sh
cargo build --release -p espada-engine --target aarch64-apple-ios
cargo build --release -p espada-engine --target aarch64-apple-ios-sim
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libespada_engine.a \
  -library target/aarch64-apple-ios-sim/release/libespada_engine.a \
  -output /tmp/EspadaEngine.xcframework
```

`lipo` cannot merge those two: it keys on CPU architecture alone and both slices are arm64,
so an `.xcframework` is the only container that carries both. `-p espada-engine` rather than
a bare workspace build, or cargo builds every member as a top-level target.

**None of this has ever been run.** No session that has worked on this module has had a
macOS host. Treat these commands as unverified until someone runs them.

### Checking an artifact

```sh
readelf -lW <lib>.so | awk '$1 == "LOAD" { print $NF }'      # every value must be 0x4000
readelf --dyn-syms -W <lib>.so | awk '$5 == "GLOBAL" && $7 != "UND" { print $8 }' | sort
```

The symbol list must be exactly the `#[no_mangle] extern "C"` functions in
`lib/espada-engine/src/ffi.rs` — no JNI symbol, no second ABI. A merge check compares these
two sets on every pull request, because a committed binary can silently go stale: during
this module's own development the committed `.so` still exported `juicio_native_*` after the
C ABI had been renamed, and nothing caught it until the Android link step.

### Running the app against it

```sh
npm run android          # compiles cpp/ and the generated C++, links the committed .so
npm run ios              # needs macOS
```

Neither invokes cargo. They compile the C++ and link whatever binary is committed, which is
why a contributor who never touches this module needs no Rust toolchain at all.

## Where the committed artifacts come from

The Android `.so`, the iOS `.xcframework`, and `nitrogen/generated/` are produced by the
manually dispatched **Build Native Library** workflow, which runs the three producers in
parallel and opens a pull request carrying the result. That workflow — not a local build —
is the authoritative producer.

The reasoning behind that, and the alternatives rejected to get there, are in
[`docs/decisions/`](../../docs/decisions); the operational detail is in
[`docs/operations/native-module-artifacts.md`](../../docs/operations/native-module-artifacts.md).

## The vendored crate

`lib/espada-internal/` is a verbatim copy of [`axross/espada`](https://github.com/axross/espada).
**Do not edit any file in it** — not to fix a defect, not to satisfy a lint, not to delete
code this project does not call. A fix belongs upstream, or in `lib/espada-engine/` which
wraps it. Its `PROVENANCE.md` records the source commit, what was deliberately left out, and
the two licences that travel with it.

## What cannot be checked here

Whether the JavaScript thread genuinely stays responsive, how the frame rate holds against
its idle baseline, whether teardown leaks worker threads under Fast Refresh, and whether the
demo workload lands in its intended duration — all need a real device, and that is still
true for the iOS half specifically.

Whether the iOS half **compiles** at all is a narrower claim than that, and it no longer
needs a maintainer's own Mac to check: the manually dispatched
[`ios-native-compile.yaml`](../../.github/workflows/ios-native-compile.yaml) workflow builds
this module's iOS half — the podspec, Nitrogen's generated C++ and Objective-C registration,
and the vendored `.xcframework` — unsigned, on a `macos-latest` runner. See
[docs/operations/ios-native-compile.md](../../docs/operations/ios-native-compile.md)
for what it proves and what it still does not.
