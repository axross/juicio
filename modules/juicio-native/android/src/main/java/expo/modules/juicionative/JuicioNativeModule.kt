package expo.modules.juicionative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * This module's only job is forcing `libjuicio-native-cpp.so` to load. That
 * library's load-time initialization (`android/src/main/cpp/OnLoad.cpp` —
 * see its own comment) is what registers the `JuicioNative` HybridObject
 * with Nitro's `HybridObjectRegistry`. Nothing here has any JS-facing
 * surface of its own: JS talks to the HybridObject directly, created
 * through `NitroModules.createHybridObject("JuicioNative")`, exactly the
 * way any other Nitro HybridObject is.
 */
class JuicioNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("JuicioNative")

    OnCreate {
      System.loadLibrary("juicio-native-cpp")
    }
  }
}
