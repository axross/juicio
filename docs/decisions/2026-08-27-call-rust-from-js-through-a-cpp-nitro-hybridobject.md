---
status: superseded
superseded_by: 2026-08-27-generate-nitro-bindings-and-registration-with-nitrogen.md
---

# Call Rust from JavaScript Through a C++ Nitro `HybridObject`

Running `rust/juicio-native`'s C ABI off the JavaScript thread, on both
platforms, from one shared implementation needed a binding layer, and four
routes were investigated against the SDK 57 code actually installed and
against current upstream sources before this one was chosen.

**A Rust-side JNI facade**, the shape the reference proof of concept used,
was rejected. It works and adds no dependency, but it obliges the crate to
carry a second, JNI-shaped ABI beside the C ABI, it serves Android only, and
in the proof of concept that facade bypassed the C ABI entirely and called
the job engine directly — leaving the C ABI compiled, tested in isolation,
and never actually used in production. That is exactly the arrangement this
project set out to avoid: a C ABI that exists only to be exercised by its own
tests.

**JNA, called from Kotlin directly against the C ABI**, was rejected next.
It disproves the proof of concept's own claim that "Kotlin cannot call a C
ABI" — that is true of `external fun`/JNI, not of Kotlin in general — but it
adds JNA's own jar and per-ABI native dispatch library to the APK for a
boundary Nitro's C++ already crosses at no extra weight, Android is a
secondary target for JNA's own maintainers, and it buys nothing on iOS.

**UniFFI** had the lowest per-function authoring cost of any route
considered, and was rejected anyway, on two independent grounds. Its
generated Swift bindings are UniFFI's own scaffolding, not this project's C
ABI, so an iOS consumer would stop exercising the same surface Android does
— defeating the reason a C ABI was chosen at all. And its generated Kotlin
has to be kept in lockstep with whichever binary it is paired with, which
conflicts with a binary this project publishes and commits on its own
cadence, separately from the code that calls it.

**A C++/JSI layer built directly over `expo-modules-core`**, with no Nitro
dependency at all, was closed on evidence read from the installed package
rather than inferred: `expo-modules-core` declares `buildFeatures { prefab
true }` but publishes no prefab package, so a third-party C++ target has no
headers to link against, and its `JSIContext` holds a `CallInvoker`
privately, exposing only a `scheduleOnJSThread` that takes a Java object —
there is no supported way for third-party C++ to schedule work onto the JS
thread through Expo's own core module. That is fatal for a design whose
whole point is delivering progress as events from a background thread.

Nitro was chosen because it is the only one of the four that clears every
constraint at once: it publishes a real prefab package on Android, a curated
public header list on iOS, and a public dispatcher over React Native's own
`react::CallInvoker` on both platforms, installed identically by the same
shared C++. `modules/juicio-native/cpp/JuicioNativeHybridObject.hpp` is that
C++: one hand-written `HybridObject`, registered by hand through
`HybridObjectRegistry::registerHybridObjectConstructor`
(`JuicioNativeRegistration.cpp`) rather than through Nitrogen or a generated
`.nitro.ts` spec, calling straight into the crate's C ABI
(`modules/juicio-native/cpp/juicio_native.h`) with no JNI and no second ABI
anywhere in the path.

## iOS Registration

Registering a Nitro constructor needs no `jsi::Runtime` to exist yet, which
opened a choice of *when* to call it. A global C++ static initializer — the
obvious mechanism, and the one Android's own `OnLoad.cpp` safely uses — was
rejected for the iOS half specifically: this module's `cpp/` compiles into a
CocoaPods **static** library there, and a linker is free to drop a whole
object file, static initializer included, when nothing else in the app
references a symbol from it — which nothing would, since nothing calls into
`JuicioNativeRegistration.cpp` except this registration itself. Instead, iOS
registers explicitly: `JuicioNativeAppDelegateSubscriber`
(`modules/juicio-native/ios/JuicioNativeAppDelegateSubscriber.swift`),
declared through `expo-module.config.json`'s `apple.appDelegateSubscribers`,
is instantiated by Expo's own subscriber repository at app startup and calls
`JuicioNativeRegisterHybridObject()` from `subscriberDidRegister()` — a hook
Expo's own documentation states runs "just before the main code of the app",
which is early enough since registering a constructor needs no runtime yet.

The stated fallback, if that hook ever proves to run too late in practice:
an Objective-C class using `RCT_EXPORT_MODULE`, whose
`installJSIBindingsWithRuntime:` calls the same registration function. That
route is equally sound — it is a different framework guarantee reaching the
same call — and is recorded here rather than built, since nothing so far has
shown the app-delegate subscriber to be insufficient.

## The Podspec's Copy Step

`modules/juicio-native/cpp/` is the single source of truth for the shared
C++, compiled by both platforms unchanged. Android's CMake target can glob
it in place (`file(GLOB_RECURSE ... "../cpp/*.cpp")` — CMake has no
directory restriction on where a target's sources live), but CocoaPods does:
`source_files` resolves only relative to, and never outside, the directory a
pod is declared `:path =>`, which Expo's autolinking sets to the podspec's
own directory (`ios/`) for a local module, not the module's root. Rather than
restructure `cpp/` to sit inside `ios/` — which would break the Android
target's own claim to the same directory — `JuicioNative.podspec` copies
`../cpp/`'s files into a `generated-cpp/` directory inside `ios/` (gitignored,
regenerated by every `pod install`) at podspec-evaluation time, and compiles
that copy. `expo-sqlite`'s own `ExpoSQLite.podspec` states the identical
constraint in its own comment — "CocoaPods does not support source_files
outside of the pod's directory" — and works around it exactly the same way,
which is why this podspec follows that same shape rather than inventing one.

## What This Also Settled

The demo this change adds occupies the Analyze tab, beneath the empty state
the tab shell ships there, until the equity engine that tab exists for
replaces it; it is deleted by whatever change brings that engine, and it
carries no poker logic of its own in the meantime.

A macOS runner is now spent whenever `rust/juicio-native` changes, or a
maintainer dispatches
[`espada-engine-artifacts.yaml`](../../.github/workflows/espada-engine-artifacts.yaml)
by hand — see
[operations/native-module-artifacts.md](../operations/native-module-artifacts.md)
for what that costs and how it is bounded. That is a new, ongoing cost this
project accepts on top of the one
[2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md](./2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md)
already accepted for iOS preview builds, for the same reason: producing an
Apple binary has no path that avoids a macOS host.
