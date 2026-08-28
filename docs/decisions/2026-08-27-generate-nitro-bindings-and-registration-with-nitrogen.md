---
status: accepted
---

# Generate the Nitro Bindings and Registration With Nitrogen

Supersedes
[2026-08-27-call-rust-from-js-through-a-cpp-nitro-hybridobject.md](./2026-08-27-call-rust-from-js-through-a-cpp-nitro-hybridobject.md).
That record chose Nitro — which still stands, and the reasoning is restated below — but
chose to hand-write the binding layer on top of it. That half is reversed here, and two of
the findings it rested on turned out to be wrong.

## Why Nitro, still

Running `modules/espada-engine/lib/`'s C ABI off the JavaScript thread, on both platforms,
from one shared implementation needs a binding layer. Four routes were investigated against
the SDK 57 code actually installed, and all four remain rejected.

**A Rust-side JNI facade**, the shape the reference proof of concept used, obliges the
crate to carry a second, JNI-shaped ABI beside the C ABI, serves Android only, and in the
proof of concept bypassed the C ABI entirely — leaving that C ABI compiled, tested in
isolation, and never actually used. **JNA from Kotlin** disproves the proof of concept's
claim that Kotlin cannot call a C ABI, but adds JNA's jar and per-ABI dispatch library to
the APK for a boundary Nitro's C++ already crosses at no extra weight, and buys nothing on
iOS. **UniFFI** had the lowest per-function authoring cost of anything considered and was
rejected anyway: its generated Swift bindings are UniFFI's own scaffolding rather than this
project's C ABI, so an iOS consumer would stop exercising the same surface Android does.
**A C++/JSI layer directly over `expo-modules-core`** was closed on evidence read from the
installed package: it declares `buildFeatures { prefab true }` but publishes no prefab
package, so third-party C++ has no headers to link against, and its `JSIContext` holds a
`CallInvoker` privately, exposing only a `scheduleOnJSThread` taking a Java object. There is
no supported way for third-party C++ to schedule work onto the JS thread through Expo's own
core — fatal for a design whose whole point is delivering progress as events from a
background thread.

Nitro clears every constraint at once: a real prefab package on Android, a curated public
header list on iOS, and a public dispatcher over React Native's own `react::CallInvoker` on
both platforms, installed identically by the same shared C++.

## What changed: the binding layer is generated, not written

The superseded record chose to hand-write the `HybridObject` and register it by hand
"rather than through Nitrogen or a generated `.nitro.ts` spec". That choice rested on two
findings, and neither survived being checked.

The first was that Nitrogen requires a package with its own `package.json`, which this
module deliberately does not have. It does not: the generator reads no `package.json` but
its own, for a version banner, and resolves `nitro.json` as a plain path against the
working directory. Nitro's own documentation names this case directly — "or by manually
adding Nitro to your existing library/**app**".

The second was that Nitrogen does not generate the registration. It does. That conclusion
had been drawn from the output of the one Nitro-based package installed here, which does
not use the `autolinking` configuration; run against this module's real interface, Nitrogen
emits `registerHybridObjectConstructor` inside `registerAllNatives()` for Android and an
Objective-C `+ (void) load` for iOS.

So `src/specs/espada-engine.nitro.ts` is now the single source of truth. Nitrogen generates
the C++ spec base class the hand-written `HybridObject` subclasses, the registration for
both platforms, and the `+autolinking.rb`/`.gradle`/`.cmake` files the podspec, Gradle build
and CMake build consume. The generated tree is committed, as Nitro's documentation
prescribes. Committing generated code introduces one failure mode — the committed output
drifting from the spec silently — and a `nitrogen-drift` merge check closed it by
regenerating the tree on a pull request and failing on any diff.

That check no longer exists. It was removed from `merge-checks.yaml` and nothing replaced
it, so the failure mode this decision named is open again. Running
`npm run nitrogen:espada-engine` before committing is all that keeps the committed tree in
step with the spec, and nothing checks that anyone ran it.

The job's status codes moved into the spec as a declared enum. They had been mirrored by
hand across TypeScript, C++ and Rust; a numeric contract maintained in three places by hand
is a silent-failure waiting to happen, and two of those three are now generated from the
third.

## iOS registration no longer needs an app-delegate subscriber

The superseded record rejected a global C++ static initializer for the iOS half — correctly.
This module's `cpp/` compiles into a CocoaPods **static** library there, and a linker may
drop an entire object file, static initializer included, when nothing else references a
symbol from it, which nothing would. Its answer was an Expo app-delegate subscriber,
declared through `expo-module.config.json`, calling the registration explicitly at startup.

Nitrogen's generated Objective-C `+ (void) load` reaches the same call through a different
guarantee: the Objective-C runtime enumerates classes and invokes `+load` on each, so it is
not reachable-symbol-dependent the way a bare C++ static initializer is. The hand-written
installer, the subscriber, and the `appDelegateSubscribers` entry that pointed at them are
deleted. The fallback the superseded record recorded but never built — an Objective-C class
using `RCT_EXPORT_MODULE` — is no longer needed either.

## The podspec's copy step is gone

The superseded record documented a workaround: CocoaPods resolves `source_files` only
relative to, and never outside, the directory a pod is declared `:path =>`, which Expo's
autolinking set to the podspec's own `ios/` directory — so the podspec copied `../cpp/` into
a gitignored `generated-cpp/` at evaluation time and compiled the copy.

Nitrogen's own `init` template places the podspec at the module root rather than in `ios/`,
and this module follows it. `cpp/` is then inside the pod's own directory, so there is
nothing to reach outside of and nothing to copy. Only `pod install` on a Mac can confirm
that, and at the time of writing it has not been run.

## What Nitrogen does not do

It generates no binary. It does not cross-compile anything, it has no involvement below the
JS-facing spec, and it does not reduce the iOS work or remove the need for a macOS host.
The Rust still exports a C ABI, the C++ still calls it, and the binaries are still produced
by a separate build — see
[2026-08-27-produce-the-committed-native-artifacts-in-ci-not-locally.md](./2026-08-27-produce-the-committed-native-artifacts-in-ci-not-locally.md).
