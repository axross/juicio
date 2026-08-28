# Builds the single C++ Nitro `HybridObject` this module carries — the same
# `../lib/bridge/` directory iOS's podspec compiles unchanged (see
# `../EspadaEngine.podspec`'s `source_files`) — into `libEspadaEngine.so`,
# and links the prebuilt Rust `libespada_engine.so` as an imported target so
# this library's calls into `espada_engine_*` (declared in
# `../lib/bridge/espada_engine.h`) resolve at load time. `lib/bridge/` sits
# under `lib/` alongside `lib/espada-engine/` and `lib/espada-internal/`,
# since `lib/` now holds one directory per library rather than only Rust.
#
# The CMake project/library name must be exactly `EspadaEngine` — matching
# `../nitro.json`'s `android.androidCxxLibName` — because the
# Nitrogen-generated `EspadaEngine+autolinking.cmake` (included below)
# references this target by that literal name in its own
# `target_sources`/`target_link_libraries` calls.
cmake_minimum_required(VERSION 3.9.0)

project(EspadaEngine)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Shared C++ (compiled on iOS too) plus this platform's own JNI entry point
# (`OnLoad.cpp` — Android-only; see its own header comment for why it isn't
# part of the shared directory).
file(GLOB_RECURSE espada_engine_shared_sources CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR}
     "../lib/bridge/*.cpp"
)
file(GLOB_RECURSE espada_engine_android_sources CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR}
     "src/main/cpp/*.cpp"
)

add_library(EspadaEngine SHARED
  ${espada_engine_shared_sources}
  ${espada_engine_android_sources}
)

set_target_properties(EspadaEngine PROPERTIES
  CXX_STANDARD 20
  CXX_STANDARD_REQUIRED ON
  POSITION_INDEPENDENT_CODE ON
)

include_directories(
  ../lib/bridge
  src/main/cpp
)

# Nitro's own HybridObject headers use RTTI (`dynamic_pointer_cast`) and
# throw (`std::runtime_error`) — both need to be enabled explicitly on
# Android, which is why `react-native-nitro-modules/android/build.gradle`
# itself passes these same flags for its own CMake build.
target_compile_options(EspadaEngine PRIVATE -frtti -fexceptions -Wall -Wextra)

# Adds Nitrogen's own generated sources (`EspadaEngineOnLoad.cpp`,
# `HybridEspadaEngineSpec.cpp`) to this target, and resolves and links
# `fbjni`, `ReactAndroid` and `react-native-nitro-modules`'s own prefab
# packages — replacing what this file declared by hand before this module
# adopted Nitrogen. See that generated file's own comments for the exact
# list; it declares nothing about the Rust library below, which this
# project still links by hand.
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/EspadaEngine+autolinking.cmake)

# The prebuilt Rust cdylib. Declared IMPORTED because it is built by a
# separate (Cargo, not CMake) toolchain and committed straight into
# `jniLibs/` rather than produced by this CMake project. This change only
# renames the committed file to match this crate's own output name — it does
# not rebuild it, so its own content is not this change's to verify.
add_library(espada_engine SHARED IMPORTED)
set_target_properties(espada_engine PROPERTIES
  IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libespada_engine.so"
  # Without this, CMake — given only a path to a SHARED IMPORTED library
  # with no SONAME of its own — records that absolute build-host path as
  # this consumer's DT_NEEDED entry instead of the library's own file name,
  # which cannot resolve on a device (see
  # docs/operations/native-module-artifacts.md's SONAME section). This
  # property is what keeps the link correct against the binary committed
  # today, whether or not that binary was ever built with -Wl,-soname
  # itself, so do not remove it once the committed .so does carry one: a
  # future dispatch could still commit one without it, and this property is
  # what keeps that case correct too.
  IMPORTED_NO_SONAME TRUE
)

target_link_libraries(EspadaEngine espada_engine)
