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
hand-written C++    lib/bridge/                subclasses the generated spec, calls the C ABI
    │                                          progress/settle hop to the JS thread via
    ▼                                          Nitro's own dispatcher
C ABI               lib/bridge/espada_engine.h four extern "C" functions
    ▼
Rust                lib/espada-engine/         the job engine and the demo workload
    │
    └─ path dep ─▶  lib/espada-internal/       a fork of axross/espada, maintained here
```

The C ABI is the only path either platform takes into Rust. There is no JNI facade and no
second ABI — see
[`docs/decisions/`](../../docs/decisions) for why.

## The equity job's per-player result

`startEquity`'s progress and settle callbacks alike carry, per player, aggregate `win`/`tie`/
`equity` fractions and a 20-bin `distribution` — and, alongside those, a `pairs` array: one
entry per this player's own live card pairs. A card pair sharing a card with the board, or
with no live opponent combo ever consistent with it, carries no entry at all — never a
fabricated zero one.

Each entry names its pair (`cardA`/`cardB`, a `0..52` card index — `rank * 4 + suit`, rank
ordered `Ace..Deuce` and suit ordered `Spade, Heart, Diamond, Club` — with `cardA <= cardB`),
that pair's own `equity` accumulated so far, and its **current strength**: the product of this
player's own pairwise lead (`lib/espada-internal/src/evaluator/pairwise_lead.rs`) against
every opponent still live against this pair, an opponent left with no live combo against it
contributing a neutral factor of `1` rather than being skipped. Strength is computed once,
before the first shard runs, and held constant across every tick after that — only `equity`
moves as the walk accumulates. Preflop (an empty board), current strength has no board to be
ahead on and is left undefined by design: `strength` is `0` for every pair of a preflop
result, a sentinel rather than a measurement. See
[`docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`](../../docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md)
for the methodology this implements.

The C ABI (`lib/bridge/espada_engine.h`, `lib/espada-engine/src/equity_ffi.rs`) is what
motivates the one place this shape is not "obvious": a hand-range player can hold up to 1,326
live card pairs, and three full-precision numbers per pair at that count alone would put the
per-player payload over the ≤12KB-per-progress-tick budget this crossing is held to. Each
pair's `equity`/`strength` therefore crosses the C ABI as a 16-bit fixed-point fraction (a
`u16` count out of `65535`, not an `f64`) — six bytes per pair (two card-index bytes plus two
`u16`s) keeps the worst case under 8KB with room to spare. `EspadaEngineHybridObject.cpp`
dequantizes each value back to a plain `[0, 1]` fraction before it ever crosses into JS —
`EspadaEquityCardPairResult` (`src/specs/espada-engine.nitro.ts`) carries plain fractions, not
the fixed-point wire encoding, so nothing above the C ABI needs to know that encoding exists.

## Layout

| Path | What it is | Committed? |
| --- | --- | --- |
| `src/` | TypeScript, and nothing but TypeScript. `specs/espada-engine.nitro.ts` is the source of truth for the JS-facing shape. | yes |
| `lib/` | One directory per library this module carries, whatever its language — see below. | sources yes, each crate's `target/` no |
| `lib/bridge/` | The hand-written `HybridObject` and the C ABI header — C++, not Rust. | yes |
| `lib/espada-engine/` | Rust: the job engine and the demo workload, with its own `Cargo.toml` and `Cargo.lock`. | yes |
| `lib/espada-internal/` | Rust: a fork of `axross/espada`, maintained here, with its own `Cargo.toml` and `Cargo.lock`. | yes |
| `nitrogen/generated/` | Everything Nitrogen produces. **Never hand-edit**; nothing in CI compares it against the spec, so regenerate it locally instead. | yes |
| `android/`, `ios/` | Per-platform build files, plus the committed binaries. | yes |
| `nitro.json`, `EspadaEngine.podspec` | Nitro configuration and the pod, at the module root as Nitrogen's own template places them. | yes |

## Working on it locally

Everything below is for **testing that a change works**. It is not how the committed
artifacts are produced — see [Where the committed artifacts come from](#where-the-committed-artifacts-come-from).
Do not commit a binary you built locally.

### The Rust

`lib/` no longer holds one Cargo workspace over both crates — each has its own manifest, so
each is checked from its own directory:

```sh
# from modules/espada-engine/lib/espada-engine/
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings

# from modules/espada-engine/lib/espada-internal/
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

Both crates are held to all three checks now. `espada-internal` used to be scoped away from
format and lint, back when it was a verbatim copy of `axross/espada` and the only way to
satisfy a gate the copy failed was to edit the copy — which would have made it no longer
diffable against upstream. It is a fork maintained in this repository now (see
[`docs/decisions/`](../../docs/decisions)), so it is checked the same way any other crate
here is.

### The Nitro bindings

From the repository root:

```sh
npm run nitrogen:espada-engine
```

This regenerates `nitrogen/generated/` from `src/specs/espada-engine.nitro.ts` and
`nitro.json`. Re-running it against an unchanged spec must leave no diff, and running it
before you commit is the only thing that keeps the committed tree in step with the spec.

A `nitrogen-drift` job in `merge-checks.yaml` used to regenerate the tree on a pull request
and fail on any diff. It was removed and nothing replaced it, so a spec change committed
without regenerating — or a hand-edit to the generated output — passes every check this
project has, and surfaces only when someone next dispatches the artifacts workflow. See
[`docs/operations/native-module-artifacts.md`](../../docs/operations/native-module-artifacts.md)
for what that leaves standing.

The generator is invoked as `nitrogen src/specs`, with the spec directory as its scan root
rather than the module root. That is load-bearing: Nitrogen's scan is a bare glob with no
default ignores at all — not even `node_modules` — so pointing it at the module root would
walk `lib/espada-engine/target/` and `lib/espada-internal/target/`. This is why `nitro.json`
needs no `ignorePaths` entry.

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

The C++ half needs the identical flag for the identical reason, and carries it a different
way: `android/CMakeLists.txt`'s `EspadaEngine` target passes
`target_link_options(EspadaEngine PRIVATE "-Wl,-z,max-page-size=16384")`, a target property
rather than an environment variable, since Gradle and CMake compile that target on every
Android build — `npm run android` included — with no cross-compile invocation for this
flag to ride along with the way the Rust one does above.

### The iOS binary

Needs macOS with Xcode, plus the `aarch64-apple-ios` and `aarch64-apple-ios-sim` targets.
From `modules/espada-engine/lib/espada-engine/`:

```sh
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libespada_engine.a \
  -library target/aarch64-apple-ios-sim/release/libespada_engine.a \
  -output /tmp/EspadaEngine.xcframework
```

`lipo` cannot merge those two: it keys on CPU architecture alone and both slices are arm64,
so an `.xcframework` is the only container that carries both. No `-p` flag is needed: this
manifest declares exactly one package, unlike the Cargo workspace over two crates it used to
be part of.

**None of this has ever been run.** No session that has worked on this module has had a
macOS host. Treat these commands as unverified until someone runs them.

### Checking an artifact

```sh
readelf -lW <lib>.so | awk '$1 == "LOAD" { print $NF }'                 # every value must be at least 0x4000
grep -ohE '^pub (unsafe )?extern "C" fn [A-Za-z0-9_]+' lib/espada-engine/src/*.rs | awk '{print $NF}' | sort -u   # expected
readelf --dyn-syms -W libespada_engine.so | awk '$5 == "GLOBAL" && $7 != "UND" { print $8 }' | sort              # actual
```

The alignment check applies to both native libraries this module ships:
`libespada_engine.so`, the committed Rust cdylib, and `libEspadaEngine.so`, the C++ Nitro
`HybridObject` Gradle and CMake compile fresh on every Android build — see [The 16 KB
Page-Alignment Requirement](../../docs/operations/native-module-artifacts.md#the-16-kb-page-alignment-requirement)
for where each of them is verified in CI. The symbol list is Rust-specific and applies to
`libespada_engine.so` alone: it must be exactly the `#[no_mangle] extern "C"` functions
across every `.rs` file directly under `lib/espada-engine/src/` — no JNI symbol, no second
ABI. **Nothing compares those two sets for the committed binary**, so running the `grep`
and `readelf --dyn-syms` commands above by hand is the only way that comparison happens at
all between dispatches.

An `abi-parity` job in `merge-checks.yaml` used to make that comparison on a pull request
touching either side; it was removed and nothing replaced it. What survives is narrower and
sits in the producing workflow: `espada-engine-artifacts.yaml`'s `build-android` job runs its own
`Verify Exported C ABI` step against the `.so` it has **just built**, and refuses to upload a
mismatch — so a dispatch cannot produce a wrong-symbol binary, and that says nothing about
the binary already committed.

That is worth knowing before you skip those two commands, because a committed binary can
silently go stale: during this module's own development the committed `.so` still exported
`juicio_native_*` after the C ABI had been renamed, and nothing caught it until the Android
link step. The check that would catch that incident today runs only on a dispatch — see
[the exported-symbol check](../../docs/operations/native-module-artifacts.md#the-exported-symbol-check).

### Running the app against it

```sh
npm run android          # compiles lib/bridge/ and the generated C++, links the committed .so
npm run ios              # needs macOS
```

Neither invokes cargo. They compile the C++ and link whatever binary is committed, which is
why a contributor who never touches this module needs no Rust toolchain at all.

## Where the committed artifacts come from

The Android `.so`, the iOS `.xcframework`, and `nitrogen/generated/` are produced by the
manually dispatched **Espada Engine Artifacts** workflow
([`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)),
which runs the three producers in parallel and commits the result directly onto whichever
branch a maintainer dispatches it against.
That workflow — not a local build — is the authoritative producer.

The reasoning behind that, and the alternatives rejected to get there, are in
[`docs/decisions/`](../../docs/decisions); the operational detail is in
[`docs/operations/native-module-artifacts.md`](../../docs/operations/native-module-artifacts.md).

## The forked crate

`lib/espada-internal/` is a fork of [`axross/espada`](https://github.com/axross/espada),
started from a verbatim copy at commit `26593b3` and maintained in this repository since. It
is edited like any other crate here — the same format, lint and test gates apply — and a fix
or a change to it belongs directly in this directory rather than upstream. See
[`docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md`](../../docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md)
for why this superseded keeping it a byte-identical mirror, and its own `src/evaluator/dp_table.rs`
for the one file in it under a different licence (Apache-2.0, not MIT) from the rest of the
crate — that file's own header carries the notice.

## What cannot be checked here

Whether the JavaScript thread genuinely stays responsive, how the frame rate holds against
its idle baseline, whether teardown leaks worker threads under Fast Refresh, and whether the
demo workload lands in its intended duration — all need a real device, and that is still
true for the iOS half specifically.

Whether the iOS half **compiles** at all is a narrower claim than that, and it is checked
only when a maintainer dispatches
[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml) by
hand — its `verify-ios` job runs an actual `pod install` and an unsigned `xcodebuild build`
against that dispatch's own freshly built `.xcframework`, gating the branch it commits
onto. No ordinary pull request against this project's own code compiles it, and it needs no
maintainer's own Mac any more.

**That job has never executed.** It is configuration, not observed behaviour: the workflow
has no automatic trigger, and no dispatch has run since the job was added. The same is true
of its Android counterpart, `verify-android`. Read the paragraph above as what will happen
on the first dispatch, not as what has happened. See
[docs/operations/native-module-artifacts.md](../../docs/operations/native-module-artifacts.md#what-compiling-the-ios-half-proves)
for what that compile proves — the podspec, Nitrogen's generated C++ and Objective-C
registration, and the vendored `.xcframework` — and what it still would not.
