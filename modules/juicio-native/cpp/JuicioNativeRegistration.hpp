#pragma once

namespace juicio {

// Registers the `JuicioNative` HybridObject's constructor with Nitro's
// `HybridObjectRegistry`, under `kJuicioNativeHybridObjectName`
// (`JuicioNativeHybridObject.hpp`). Must run once, before JS ever calls
// `NitroModules.createHybridObject("JuicioNative")` — and, in a
// `NITRO_DEBUG` build, calling it a second time with the same name throws
// (see `HybridObjectRegistry::registerHybridObjectConstructor`'s own debug
// check), so nothing here should call it more than once per process.
//
// Deliberately a plain function, not a global/static-initializer object in
// this shared `cpp/` directory: this file is compiled by both the Android
// CMake target (a shared library, whose `.init_array` unconditionally runs
// at `dlopen`/`System.loadLibrary` time — see
// `android/src/main/cpp/OnLoad.cpp`, which *does* use a static initializer,
// safely, because it is Android-only) and the iOS podspec (compiled into a
// CocoaPods static library, where a global constructor can be dropped by
// the linker along with its whole object file if nothing else references a
// symbol from it — see `ios/JuicioNativeInstaller.mm`, which calls this
// function explicitly instead, from an Expo app-delegate subscriber that
// the framework is guaranteed to instantiate).
void registerJuicioNativeHybridObject();

} // namespace juicio
