require "fileutils"

Pod::Spec.new do |s|
  # `modules/juicio-native/` has no `package.json` of its own — Expo's
  # autolinking discovers a local module under `./modules` (its own
  # default `nativeModulesDir`) by directory name alone when no
  # `package.json` is present (see `expo-modules-autolinking`'s
  # `scanDependenciesInSearchPath`). This pod's own versioning is therefore
  # nominal — it always builds from source, alongside the app.
  s.name         = "JuicioNative"
  s.version      = "1.0.0"
  s.summary      = "The C++ Nitro HybridObject that runs juicio-native's Rust job off the JS thread on iOS."
  s.homepage     = "https://github.com/axross/juicio"
  s.license      = "UNLICENSED"
  s.authors      = "axross"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/axross/juicio.git" }

  # CocoaPods resolves `source_files` relative to — and will not look
  # outside — the directory this pod is declared `:path =>`, which Expo's
  # autolinking sets to *this podspec's own directory*
  # (`expo-modules-autolinking`'s `precompiled_modules.rb`,
  # `pod_registration_options`, sets `:path => podspec_dir`), i.e. `ios/`
  # itself, not the module root. `expo-sqlite`'s own `ExpoSQLite.podspec`
  # documents the identical constraint verbatim: "CocoaPods does not
  # support source_files outside of the pod's directory" — and works around
  # it exactly this way, by copying shared source into the pod's own
  # directory at podspec-evaluation time rather than referencing it where
  # it lives. This podspec does the same, into `generated-cpp/`
  # (`.gitignore`d — every plain build regenerates it, the same way this
  # project already treats every other CNG-generated directory): the
  # authored, single source of truth stays `../cpp/`, exactly as it is for
  # Android's CMake target (`../android/CMakeLists.txt`, which globs it
  # in place — CMake has no such directory restriction).
  generated_cpp_dir = File.join(__dir__, "generated-cpp")
  FileUtils.rm_rf(generated_cpp_dir)
  FileUtils.mkdir_p(generated_cpp_dir)
  Dir.glob(File.join(__dir__, "..", "cpp", "*")).each do |file|
    FileUtils.cp(file, generated_cpp_dir) if File.file?(file)
  end

  s.source_files = "generated-cpp/*.{h,hpp,cpp}", "*.{h,mm,swift}"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "DEFINES_MODULE" => "YES",
  }

  # The Rust crate's two Apple slices (`aarch64-apple-ios`,
  # `aarch64-apple-ios-sim`), assembled with `xcodebuild -create-xcframework`
  # — not committed in this session; see the plan's own binary-provenance
  # note. Path is relative to this podspec's own directory (`ios/`), per the
  # same rule as `source_files` above.
  s.vendored_frameworks = "JuicioNative.xcframework"

  # `s.dependency "React-jsi"` mirrors `NitroModules.podspec`'s own comment
  # ("Nitro depends on JSI"): `juicio_native.h` and
  # `JuicioNativeHybridObject.hpp` both pull in `<jsi/jsi.h>` transitively
  # through `NitroModules/HybridObject.hpp`.
  s.dependency "NitroModules"
  s.dependency "React-jsi"

  install_modules_dependencies(s)
end
