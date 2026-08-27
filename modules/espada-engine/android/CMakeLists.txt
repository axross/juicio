# Builds the single C++ Nitro `HybridObject` this module carries — the same
# `../cpp/` directory iOS's podspec compiles unchanged (see
# `../ios/JuicioNative.podspec`'s `source_files`) — into
# `libjuicio-native-cpp.so`, links it against Nitro's own published prefab
# package, and links the prebuilt Rust `libjuicio_native.so` as an imported
# target so this library's calls into `juicio_native_*` (declared in
# `../cpp/juicio_native.h`) resolve at load time.
#
# Modeled on `react-native-nitro-modules/android/CMakeLists.txt` and on
# `react-native-unistyles`'s own Nitro-consuming CMake target (see
# `node_modules/react-native-unistyles/android/CMakeLists.txt` and its
# `nitrogen/generated/android/unistyles+autolinking.cmake`, which is the
# source for the exact `find_package`/`target_link_libraries` names below —
# this module has no Nitrogen step of its own to generate that file, so it
# is written out by hand instead).
cmake_minimum_required(VERSION 3.9.0)

project(juicio_native_cpp)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Shared C++ (compiled on iOS too) plus this platform's own registration
# trampoline (`OnLoad.cpp` — Android-only; see its own header comment for
# why it isn't part of the shared directory).
file(GLOB_RECURSE juicio_native_shared_sources CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR}
     "../cpp/*.cpp"
)
file(GLOB_RECURSE juicio_native_android_sources CONFIGURE_DEPENDS RELATIVE ${CMAKE_SOURCE_DIR}
     "src/main/cpp/*.cpp"
)

add_library(juicio-native-cpp SHARED
  ${juicio_native_shared_sources}
  ${juicio_native_android_sources}
)

set_target_properties(juicio-native-cpp PROPERTIES
  CXX_STANDARD 20
  CXX_STANDARD_REQUIRED ON
  POSITION_INDEPENDENT_CODE ON
)

include_directories(
  ../cpp
  src/main/cpp
)

# Nitro's own HybridObject headers use RTTI (`dynamic_pointer_cast`) and
# throw (`std::runtime_error`) — both need to be enabled explicitly on
# Android, which is why `react-native-nitro-modules/android/build.gradle`
# itself passes these same flags for its own CMake build.
target_compile_options(juicio-native-cpp PRIVATE -frtti -fexceptions -Wall -Wextra)

find_package(fbjni REQUIRED)
find_package(ReactAndroid REQUIRED)
find_package(react-native-nitro-modules REQUIRED)

target_link_libraries(juicio-native-cpp
  fbjni::fbjni
  ReactAndroid::jsi
  react-native-nitro-modules::NitroModules
)

if (ReactAndroid_VERSION_MINOR GREATER_EQUAL 76)
  target_link_libraries(juicio-native-cpp ReactAndroid::reactnative)
else()
  target_link_libraries(juicio-native-cpp ReactAndroid::react_nativemodule_core)
endif()

# The prebuilt Rust cdylib. Declared IMPORTED because it is built by a
# separate (Cargo, not CMake) toolchain and committed straight into
# `jniLibs/` rather than produced by this CMake project. Not committed in
# this session — see this module's own `README`-less state and the parent
# change's plan: the binary is produced by dispatching the workflow this
# slice does not add. `IMPORTED_LOCATION` naming a file that does not yet
# exist is not itself an error; CMake only opens it at link time.
add_library(juicio_native SHARED IMPORTED)
set_target_properties(juicio_native PROPERTIES
  IMPORTED_LOCATION "${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}/libjuicio_native.so"
)

target_link_libraries(juicio-native-cpp juicio_native)
