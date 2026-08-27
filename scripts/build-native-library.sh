#!/usr/bin/env bash
set -euo pipefail

# scripts/build-native-library.sh
#
# Reproduces, on a maintainer's own machine, what the "Build Native Library"
# GitHub Actions workflow (.github/workflows/build-native-library.yaml) does
# in CI: cross-compiles rust/juicio-native/ for whichever of Android and iOS
# this host can build, applying the same 16 KB page-alignment requirement to
# the Android .so that CI does, and refusing to leave an unaligned binary
# behind rather than emitting one.
#
# It never writes to a checked-in path. Output lands under .native-build/
# (gitignored) instead of directly at the committed jniLibs/ or
# JuicioNative.xcframework path a pull request would eventually carry — copy
# the artifact into place yourself once you're satisfied with it, or let the
# CI workflow's own pull-request job do that as part of a real dispatch.
#
# Android builds wherever an NDK is discoverable through one of the
# environment variables cargo-ndk itself already resolves, in the same
# order: ANDROID_NDK_HOME, ANDROID_NDK_ROOT, ANDROID_NDK, NDK_HOME. iOS
# builds only on macOS with Xcode installed. Whichever platform's
# prerequisite is missing is skipped, with a message naming what to set up —
# this is the "builds whichever platforms the host supports" the plan asks
# for, not a hard requirement that every host build both.
#
# Usage: scripts/build-native-library.sh

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
crate_dir="$repo_root/rust/juicio-native"
output_dir="$repo_root/.native-build"

# Verifies that every PT_LOAD segment in the given ELF file is aligned to at
# least 16384 bytes (16 KB), the alignment Google Play has required for
# native code since 2025-11-01. Exits the script rather than returning on
# failure: an unaligned binary must never be left at the output path.
check_16kb_alignment() {
  local so_path="$1"

  if ! command -v readelf >/dev/null 2>&1; then
    echo "error: readelf not found (it ships with binutils) — cannot verify 16 KB page alignment. Install binutils and re-run." >&2
    exit 1
  fi

  local max_align=0
  local load_count=0
  while read -r align_hex; do
    load_count=$((load_count + 1))
    local align_dec=$((16#${align_hex#0x}))
    if [ "$align_dec" -gt "$max_align" ]; then
      max_align=$align_dec
    fi
  done < <(readelf -lW "$so_path" | awk '$1 == "LOAD" { print $NF }')

  if [ "$load_count" -eq 0 ]; then
    echo "error: readelf found no LOAD segments in $so_path — cannot verify page alignment." >&2
    exit 1
  fi

  echo "Largest LOAD segment alignment: $max_align bytes (across $load_count LOAD segments)."

  if [ "$max_align" -lt 16384 ]; then
    echo "error: $so_path is not 16 KB page aligned (largest LOAD segment alignment is $max_align bytes, need at least 16384)." >&2
    echo "This normally means -Wl,-z,max-page-size=16384 was not applied to the link, or the installed NDK is r27 or earlier and needs it explicitly. Refusing to leave an unaligned binary at the output path." >&2
    exit 1
  fi

  echo "16 KB page alignment verified for $so_path."
}

# Returns 0 (and builds) if an NDK is discoverable and the Android build
# succeeds; returns 1 if the prerequisite is missing, so main() can treat
# that as "skipped" rather than a hard failure. A build that starts but
# fails (missing cargo-ndk, a real compile error, a failed alignment check)
# still exits the whole script non-zero via `set -e`.
build_android() {
  local ndk_dir=""
  local ndk_var=""
  for var in ANDROID_NDK_HOME ANDROID_NDK_ROOT ANDROID_NDK NDK_HOME; do
    local value="${!var:-}"
    if [ -n "$value" ] && [ -d "$value" ]; then
      ndk_dir="$value"
      ndk_var="$var"
      break
    fi
  done

  if [ -z "$ndk_dir" ]; then
    echo "Skipping Android: no NDK found. Set one of ANDROID_NDK_HOME, ANDROID_NDK_ROOT, ANDROID_NDK, or NDK_HOME to an installed NDK's directory (cargo-ndk resolves the same variables, in this order)."
    return 1
  fi
  echo "Using NDK from \$$ndk_var: $ndk_dir"

  if ! command -v cargo-ndk >/dev/null 2>&1; then
    echo "error: cargo-ndk is required to cross-compile for Android but was not found on PATH. Install it with: cargo install cargo-ndk --locked" >&2
    exit 1
  fi

  # Best-effort: adds the target if rustup manages this toolchain. Ignored
  # on failure (a non-rustup toolchain that already carries the target, for
  # example) — the build step below fails loudly and specifically if the
  # target genuinely is not installed.
  rustup target add aarch64-linux-android >/dev/null 2>&1 || true

  local out="$output_dir/android"
  mkdir -p "$out"

  echo "Cross-compiling rust/juicio-native for aarch64-linux-android (arm64-v8a)..."
  # -Wl,-z,max-page-size=16384 unconditionally: harmless on NDK r28+
  # (16 KB-aligned by default already), required on r27 and earlier. Set
  # only through the environment, never through a committed
  # .cargo/config.toml — a hard-coded NDK path in exactly that file is the
  # one thing the reference proof of concept did that this project
  # deliberately does not copy.
  #
  # Run from inside the crate directory rather than passing cargo-ndk's own
  # --manifest-path: cargo-ndk 4.1.2 runs `cargo metadata` against the
  # current directory before it ever looks at that flag, so from the repo
  # root it fails with "could not find `Cargo.toml`" regardless of whether
  # --manifest-path is placed before or after `build` — confirmed by trying
  # both. $out is already an absolute path (derived from $repo_root above),
  # so it still resolves correctly after the `cd`.
  (
    cd "$crate_dir"
    CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
      cargo ndk -t arm64-v8a -o "$out" build --release
  )

  local so_path="$out/arm64-v8a/libjuicio_native.so"
  if [ ! -f "$so_path" ]; then
    echo "error: expected build output at $so_path but it does not exist." >&2
    exit 1
  fi

  check_16kb_alignment "$so_path"

  echo "Android binary ready at: $so_path"
  echo "  (commit it to modules/juicio-native/android/src/main/jniLibs/arm64-v8a/libjuicio_native.so once you're satisfied with it)"
  return 0
}

# Same return-code convention as build_android: 1 for "skipped, prerequisite
# missing", a script-ending failure via set -e for a build that started and
# failed.
build_ios() {
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Skipping iOS: not running on macOS."
    return 1
  fi

  if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "Skipping iOS: xcodebuild not found — Xcode is required."
    return 1
  fi

  if ! xcodebuild -version >/dev/null 2>&1; then
    echo "Skipping iOS: xcodebuild is present but not usable. Try 'sudo xcode-select -s /Applications/Xcode.app' or accept the license with 'sudo xcodebuild -license'."
    return 1
  fi

  rustup target add aarch64-apple-ios aarch64-apple-ios-sim >/dev/null 2>&1 || true

  local out="$output_dir/ios"
  mkdir -p "$out"

  echo "Building rust/juicio-native for aarch64-apple-ios and aarch64-apple-ios-sim..."
  cargo build --release --target aarch64-apple-ios --manifest-path "$crate_dir/Cargo.toml"
  cargo build --release --target aarch64-apple-ios-sim --manifest-path "$crate_dir/Cargo.toml"

  local device_lib="$crate_dir/target/aarch64-apple-ios/release/libjuicio_native.a"
  local sim_lib="$crate_dir/target/aarch64-apple-ios-sim/release/libjuicio_native.a"
  for lib in "$device_lib" "$sim_lib"; do
    if [ ! -f "$lib" ]; then
      echo "error: expected build output at $lib but it does not exist." >&2
      exit 1
    fi
  done

  local xcframework_path="$out/JuicioNative.xcframework"
  rm -rf "$xcframework_path"

  # lipo cannot merge these two: it keys on CPU architecture alone and both
  # slices are arm64, so an .xcframework is the only mechanism that carries
  # both. No -headers argument — the C header this static library
  # implements is compiled in directly through the Expo module's own
  # podspec (source_files), not through the xcframework.
  echo "Assembling JuicioNative.xcframework from the two arm64 slices..."
  xcodebuild -create-xcframework \
    -library "$device_lib" \
    -library "$sim_lib" \
    -output "$xcframework_path"

  echo "iOS xcframework ready at: $xcframework_path"
  echo "  (commit it to modules/juicio-native/ios/JuicioNative.xcframework once you're satisfied with it)"
  return 0
}

main() {
  mkdir -p "$output_dir"

  local android_built=0
  local ios_built=0

  if build_android; then
    android_built=1
  fi

  echo
  if build_ios; then
    ios_built=1
  fi

  echo
  echo "Summary:"
  if [ "$android_built" -eq 1 ]; then
    echo "  Android: built"
  else
    echo "  Android: skipped"
  fi
  if [ "$ios_built" -eq 1 ]; then
    echo "  iOS: built"
  else
    echo "  iOS: skipped"
  fi

  if [ "$android_built" -eq 0 ] && [ "$ios_built" -eq 0 ]; then
    echo "error: neither platform could be built on this host — see the messages above for what's missing." >&2
    exit 1
  fi
}

main "$@"
