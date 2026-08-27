// Android-only. Registers the `JuicioNative` HybridObject at library
// load time — Android's build (`../../../android/CMakeLists.txt`) links
// this module into a single shared library, `libjuicio-native-cpp.so`,
// loaded by `JuicioNativeModule.kt`'s `System.loadLibrary` call. A shared
// library's `.init_array` runs unconditionally when the dynamic linker
// loads it (`dlopen`, which is what `System.loadLibrary` does under the
// hood) — unlike a CocoaPods static archive, there is no per-object-file
// dead-stripping step that could drop this translation unit for having no
// directly-referenced symbol, which is exactly why iOS instead calls
// `registerJuicioNativeHybridObject()` explicitly (see
// `../../../ios/JuicioNativeInstaller.mm`) rather than relying on a static
// initializer of its own. See `JuicioNativeRegistration.hpp`'s own comment
// for the fuller version of this reasoning.
//
// `System.loadLibrary` only actually loads a given library once per
// process (later calls with the same name are no-ops against the JVM's own
// bookkeeping), so this initializer — like the app-delegate subscriber's
// call on iOS — only ever runs once per process.

#include "JuicioNativeRegistration.hpp"

namespace {

struct JuicioNativeAndroidRegistrar {
  JuicioNativeAndroidRegistrar() { juicio::registerJuicioNativeHybridObject(); }
};

const JuicioNativeAndroidRegistrar kJuicioNativeAndroidRegistrar;

} // namespace
