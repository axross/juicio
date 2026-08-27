package expo.modules.espadaengine

import com.margelo.nitro.espada.engine.EspadaEngineOnLoad
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * This module's only job is forcing `libEspadaEngine.so` to load. That
 * library's load-time initialization (`android/src/main/cpp/OnLoad.cpp` —
 * see its own comment) is what registers the `EspadaEngine` HybridObject
 * with Nitro's `HybridObjectRegistry`, through the Nitrogen-generated
 * `registerAllNatives()`. Nothing here has any JS-facing surface of its
 * own: JS talks to the HybridObject directly, created through
 * `NitroModules.createHybridObject("EspadaEngine")`, exactly the way any
 * other Nitro HybridObject is.
 *
 * Loads the library through the Nitrogen-generated
 * `EspadaEngineOnLoad.initializeNative()` — idempotent, and the one place
 * the library's own name is spelled — rather than a bare
 * `System.loadLibrary` call of this file's own.
 */
class EspadaEngineModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EspadaEngine")

    OnCreate {
      EspadaEngineOnLoad.initializeNative()
    }
  }
}
