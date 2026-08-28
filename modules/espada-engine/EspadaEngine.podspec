Pod::Spec.new do |s|
  # `modules/espada-engine/` has no `package.json` of its own — Expo's
  # autolinking discovers a local module under `./modules` (its own
  # default `nativeModulesDir`) by directory name alone when no
  # `package.json` is present (see `expo-modules-autolinking`'s
  # `scanDependenciesInSearchPath`). This pod's own versioning is therefore
  # nominal — it always builds from source, alongside the app.
  s.name         = "EspadaEngine"
  s.version      = "1.0.0"
  s.summary      = "The C++ Nitro HybridObject that runs espada-engine's Rust job off the JS thread on iOS."
  s.homepage     = "https://github.com/axross/juicio"
  s.license      = "UNLICENSED"
  s.authors      = "axross"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/axross/juicio.git" }

  # This podspec lives at the module root, as Nitrogen's own `init` template
  # places it (see `nitro.json`'s sibling comment) — which puts `lib/bridge/`
  # inside this pod's own directory too. CocoaPods refuses `source_files`
  # outside the directory a pod is declared `:path =>` (see `expo-sqlite`'s
  # own `ExpoSQLite.podspec`, which documents the identical constraint
  # verbatim), but that no longer applies here: unlike the previous layout,
  # where the podspec lived in `ios/` and had to copy `../cpp/` into a
  # gitignored directory inside itself to satisfy that restriction,
  # `lib/bridge/` is already inside this pod's directory, so this
  # references it directly and needs no copy step. It moved here from a
  # module-root `cpp/` so `lib/` could hold one directory per library
  # (`bridge/`, `espada-engine/`, `espada-internal/`) instead of being
  # Rust-only.
  s.source_files = "lib/bridge/*.{h,hpp,cpp}"

  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "DEFINES_MODULE" => "YES",
  }

  # The Rust crate's two Apple slices (`aarch64-apple-ios`,
  # `aarch64-apple-ios-sim`), assembled with `xcodebuild -create-xcframework`
  # — not committed in this session; see the plan's own binary-provenance
  # note. Path is relative to this podspec's own directory (the module
  # root), so this vendors `ios/EspadaEngine.xcframework`.
  s.vendored_frameworks = "ios/EspadaEngine.xcframework"

  # Adds Nitrogen's generated C++ sources and Swift bridges, the
  # `NitroModules` dependency, and the xcconfig entries the generated
  # Objective-C++/Swift interop needs — see this file's own comment for the
  # exact list.
  load "nitrogen/generated/ios/EspadaEngine+autolinking.rb"
  add_nitrogen_files(s)

  # `espada_engine.h` and `EspadaEngineHybridObject.hpp` both pull in
  # `<jsi/jsi.h>` transitively through `NitroModules/HybridObject.hpp`.
  s.dependency "React-jsi"

  install_modules_dependencies(s)
end
