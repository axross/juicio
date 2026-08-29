// Android-only. implements `JNI_OnLoad`, the entry point the JVM calls the
// moment `System.loadLibrary` (`EspadaEngineModule.kt`'s
// `EspadaEngineOnLoad.initializeNative()` call) loads this module's shared
// library — Android's build (`../../../android/CMakeLists.txt`) links this
// module into a single shared library, `libEspadaEngine.so`.
//
// `facebook::jni::initialize` is fbjni's own required `JNI_OnLoad`
// entrypoint; the lambda it's given is where Nitro's Android autolinking
// expects registration to happen (see
// `../../../nitrogen/generated/android/EspadaEngineOnLoad.hpp`'s own doc
// comment on `registerAllNatives()`, and Nitro's `init` template's own
// `cpp-adapter.cpp`, which this file mirrors). `registerAllNatives()` is
// what registers the `EspadaEngine` HybridObject with Nitro's
// `HybridObjectRegistry` — generated from `nitro.json`'s `autolinking` entry
// and `src/specs/espada-engine.nitro.ts`, not called by hand here.
//
// `JNI_OnLoad` is called by the JVM exactly once per process, the first
// time this library is loaded — unlike the previous, hand-registered
// layout, nothing here needs its own once-only guard.

#include <jni.h>
#include <fbjni/fbjni.h>

#include "EspadaEngineOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, []() {
    margelo::nitro::espada::engine::registerAllNatives();
  });
}
