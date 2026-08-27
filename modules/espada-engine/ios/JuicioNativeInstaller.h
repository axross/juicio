#pragma once

// A plain C function (no C++ types in its signature) so Swift can import it
// directly from this pod's own auto-generated bridging — see this header's
// sibling `.mm` and the Swift app-delegate subscriber that calls it.
//
// Deliberately not a static initializer: unlike Android (see
// `../android/src/main/cpp/OnLoad.cpp`), this pod is compiled into a
// CocoaPods static library, and a global C++ constructor's translation unit
// can be dropped by the linker along with the rest of that object file if
// nothing in the app directly references one of its symbols — which
// nothing would, since nothing calls into this file except this explicit
// entry point. See `../cpp/JuicioNativeRegistration.hpp`'s own comment for
// the fuller version of this reasoning.
#ifdef __cplusplus
extern "C" {
#endif

void JuicioNativeRegisterHybridObject(void);

#ifdef __cplusplus
}
#endif
