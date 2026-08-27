#include "JuicioNativeRegistration.hpp"

#include <NitroModules/HybridObjectRegistry.hpp>

#include <memory>

#include "JuicioNativeHybridObject.hpp"

namespace juicio {

void registerJuicioNativeHybridObject() {
  margelo::nitro::HybridObjectRegistry::registerHybridObjectConstructor(
      kJuicioNativeHybridObjectName,
      []() -> std::shared_ptr<margelo::nitro::HybridObject> { return std::make_shared<JuicioNativeHybridObject>(); });
}

} // namespace juicio
