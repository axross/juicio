#!/usr/bin/env bash
set -euo pipefail

# scripts/build-native-library.sh
#
# Reproduces, on a maintainer's own machine, what the "Build Native Library"
# GitHub Actions workflow (.github/workflows/build-native-library.yaml) does
# in CI: cross-compiles modules/espada-engine/lib/ for whichever of Android and iOS
# this host can build, applying the same 16 KB page-alignment requirement to
# the Android .so that CI does, and refusing to leave an unaligned or
# wrong-symbol binary behind rather than emitting one.
#
# It writes directly to the checked-in paths a pull request would otherwise
# carry — modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so
# and modules/espada-engine/ios/EspadaEngine.xcframework. Each platform is
# built and verified into a private temporary directory first; the move to
# the committed path happens only after the 16 KB page-alignment check
# (Android) and the exported-C-ABI-symbol check (both platforms) pass, so a
# failed verification never touches the committed path at all — there is no
# separate "copy it into place yourself" step for a maintainer to skip or get
# wrong.
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
# The Cargo workspace over this module's two crates, and the member crate
# that produces the shipped library. espada-internal, the vendored copy of
# axross/espada, is built too — it is a path dependency of espada-engine —
# which is what proves the copy cross-compiles for these targets at all.
workspace_dir="$repo_root/modules/espada-engine/lib"
crate_dir="$workspace_dir/espada-engine"
ffi_rs_path="$crate_dir/src/ffi.rs"

# The committed paths this script writes to directly. Nothing is moved here
# until the corresponding build function's own verification has passed.
android_dest="$repo_root/modules/espada-engine/android/src/main/jniLibs/arm64-v8a/libespada_engine.so"
ios_dest="$repo_root/modules/espada-engine/ios/EspadaEngine.xcframework"

# A fresh private directory for this run's own build output, outside the
# repository and never committed. Removed on exit regardless of outcome, so
# nothing here ever needs its own gitignore entry the way the old
# .native-build/ staging directory did.
build_root="$(mktemp -d "${TMPDIR:-/tmp}/espada-engine-build.XXXXXX")"
trap 'rm -rf "$build_root"' EXIT

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

# Prints the crate's own C ABI, one symbol name per line, sorted — the
# `#[no_mangle] pub extern "C" fn` / `pub unsafe extern "C" fn` names in
# ffi.rs. This is the ground truth both platform checks below compare a
# built binary's exported symbols against, and it is the same extraction
# merge-checks.yaml's own rust_checks job runs against the committed Android
# .so — so a rename here is caught in both places rather than only in CI.
get_expected_symbols() {
  if [ ! -f "$ffi_rs_path" ]; then
    echo "error: expected $ffi_rs_path to exist — cannot determine the crate's C ABI." >&2
    exit 1
  fi
  grep -oE '^pub (unsafe )?extern "C" fn [A-Za-z0-9_]+' "$ffi_rs_path" | awk '{print $NF}' | sort
}

# Verifies that the given .so's exported dynamic symbols are exactly the
# crate's C ABI — no missing symbol, and no stale one left over from a
# renamed or removed function. This is the check that would have caught this
# project's own past incident: a committed .so that still exported the old
# juicio_native_* names after the C ABI was renamed to espada_engine_*. Exits
# the script rather than returning on failure: a wrong-symbol binary must
# never be left at the output path.
check_android_exported_symbols() {
  local so_path="$1"

  if ! command -v readelf >/dev/null 2>&1; then
    echo "error: readelf not found (it ships with binutils) — cannot verify exported symbols. Install binutils and re-run." >&2
    exit 1
  fi

  local expected
  expected="$(get_expected_symbols)"
  local actual
  actual="$(readelf -sW "$so_path" | awk '$4 == "FUNC" && $5 == "GLOBAL" && $7 != "UND" { print $NF }' | sort -u)"

  if [ "$expected" != "$actual" ]; then
    echo "error: $so_path's exported C ABI symbols do not match modules/espada-engine/lib/espada-engine/src/ffi.rs. Refusing to leave a wrong-symbol binary at the output path." >&2
    echo "Expected (from ffi.rs):" >&2
    echo "$expected" | sed 's/^/  /' >&2
    echo "Found (in the built .so):" >&2
    echo "$actual" | sed 's/^/  /' >&2
    exit 1
  fi

  echo "Exported C ABI symbols verified for $so_path."
}

# Verifies that the given static library (one Apple arm64 slice) defines
# every one of the crate's C ABI symbols. Unlike the Android check above,
# this is a subset check, not an exact-set one: a .a is an intermediate
# build artifact, not a fully linked binary, and it legitimately carries
# many other global symbols (every other pub Rust item, mangled) that a
# cdylib's dynamic symbol table would not. What still must never be true is
# the failure this project actually hit — an expected C ABI name missing, or
# still carrying its old name. Exits the script rather than returning on
# failure, for the same reason the Android check does.
check_ios_exported_symbols() {
  local lib_path="$1"

  if ! command -v nm >/dev/null 2>&1; then
    echo "error: nm not found — cannot verify exported symbols in $lib_path." >&2
    exit 1
  fi

  local expected
  expected="$(get_expected_symbols)"
  # Mach-O symbol names in nm's own output carry a leading underscore
  # (`_espada_engine_start`), unlike the ELF names the Android check reads
  # directly. -gU: global (external) symbols only, defined ones only.
  local found
  found="$(nm -gU "$lib_path" 2>/dev/null | awk '{print $NF}' | sed 's/^_//' | sort -u)"

  local missing=""
  while IFS= read -r symbol; do
    [ -z "$symbol" ] && continue
    if ! printf '%s\n' "$found" | grep -qx "$symbol"; then
      missing="$missing $symbol"
    fi
  done <<<"$expected"

  if [ -n "$missing" ]; then
    echo "error: $lib_path is missing expected C ABI symbol(s) from modules/espada-engine/lib/espada-engine/src/ffi.rs:$missing" >&2
    echo "Refusing to leave a wrong-symbol binary at the output path." >&2
    exit 1
  fi

  echo "Exported C ABI symbols verified for $lib_path."
}

# Returns 0 (and installs) if an NDK is discoverable and the Android build,
# alignment check, and symbol check all succeed; returns 1 if the
# prerequisite is missing, so main() can treat that as "skipped" rather than
# a hard failure. A build that starts but fails (missing cargo-ndk, a real
# compile error, a failed alignment or symbol check) exits the whole script
# non-zero — the committed .so is left untouched in that case.
#
# That last part is NOT `set -e`'s doing, and must not be left to it: main()
# calls this function as an `if` condition, and POSIX suppresses `set -e`
# for the entire body of a command used that way. So every step that can
# fail checks its own status explicitly below. This was a real defect, not a
# hypothetical one — a failing cargo build used to fall through to the
# is-the-output-there check, which the *previous* run's artifact satisfied,
# and the script then verified that stale binary and reported it as freshly
# built. Building into a fresh temporary directory on every run (see
# $build_root above) already rules that particular failure out structurally,
# but the explicit status checks stay: they are what catches a build that
# fails after partially writing output, not only one that leaves a stale
# artifact behind.
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

  local out="$build_root/android"
  mkdir -p "$out"

  echo "Cross-compiling espada-engine for aarch64-linux-android (arm64-v8a)..."
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
  # both. $out is already an absolute path (derived from $build_root above),
  # so it still resolves correctly after the `cd`.
  if ! (
    cd "$crate_dir"
    CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="-C link-arg=-Wl,-z,max-page-size=16384" \
      cargo ndk -t arm64-v8a -o "$out" build --release
  ); then
    echo "error: the Android cross-compile failed — see the cargo output above." >&2
    exit 1
  fi

  local so_path="$out/arm64-v8a/libespada_engine.so"
  if [ ! -f "$so_path" ]; then
    echo "error: expected build output at $so_path but it does not exist." >&2
    exit 1
  fi

  check_16kb_alignment "$so_path"
  check_android_exported_symbols "$so_path"

  mkdir -p "$(dirname "$android_dest")"
  cp "$so_path" "$android_dest"

  echo "Android binary verified and installed at: $android_dest"
  echo "  (review it with 'git diff' / 'git status' and commit it once you're satisfied)"
  return 0
}

# Same return-code convention as build_android: 1 for "skipped, prerequisite
# missing", a script-ending failure via set -e for a build that started and
# failed. The committed xcframework is left untouched unless every build
# step and both symbol checks succeed.
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

  local out="$build_root/ios"
  mkdir -p "$out"

  echo "Building espada-engine for aarch64-apple-ios and aarch64-apple-ios-sim..."
  # -p espada-engine, not a bare workspace build: without it cargo would
  # build every workspace member as a top-level target.
  #
  # Each build's status is checked explicitly, for the same reason the
  # Android one is: `set -e` does not apply inside this function. Unlike
  # $build_root, Cargo's own target/ directory is not fresh on every run —
  # it is the persistent build cache under $workspace_dir — so a previous
  # run's artifact is removed first for the same reason the historical
  # incident described above matters here too.
  rm -f "$workspace_dir/target/aarch64-apple-ios/release/libespada_engine.a" \
    "$workspace_dir/target/aarch64-apple-ios-sim/release/libespada_engine.a"
  if ! cargo build --release -p espada-engine --target aarch64-apple-ios --manifest-path "$workspace_dir/Cargo.toml"; then
    echo "error: the aarch64-apple-ios build failed — see the cargo output above." >&2
    exit 1
  fi
  if ! cargo build --release -p espada-engine --target aarch64-apple-ios-sim --manifest-path "$workspace_dir/Cargo.toml"; then
    echo "error: the aarch64-apple-ios-sim build failed — see the cargo output above." >&2
    exit 1
  fi

  # One target directory for the whole workspace, at the workspace root —
  # not under the member crate.
  local device_lib="$workspace_dir/target/aarch64-apple-ios/release/libespada_engine.a"
  local sim_lib="$workspace_dir/target/aarch64-apple-ios-sim/release/libespada_engine.a"
  for lib in "$device_lib" "$sim_lib"; do
    if [ ! -f "$lib" ]; then
      echo "error: expected build output at $lib but it does not exist." >&2
      exit 1
    fi
    check_ios_exported_symbols "$lib"
  done

  local xcframework_path="$out/EspadaEngine.xcframework"
  rm -rf "$xcframework_path"

  # lipo cannot merge these two: it keys on CPU architecture alone and both
  # slices are arm64, so an .xcframework is the only mechanism that carries
  # both. No -headers argument — the C header this static library
  # implements is compiled in directly through the Expo module's own
  # podspec (source_files), not through the xcframework.
  echo "Assembling EspadaEngine.xcframework from the two arm64 slices..."
  if ! xcodebuild -create-xcframework \
    -library "$device_lib" \
    -library "$sim_lib" \
    -output "$xcframework_path"; then
    echo "error: xcodebuild -create-xcframework failed — see the output above." >&2
    exit 1
  fi

  rm -rf "$ios_dest"
  cp -R "$xcframework_path" "$ios_dest"

  echo "iOS xcframework verified and installed at: $ios_dest"
  echo "  (review it with 'git diff' / 'git status' and commit it once you're satisfied)"
  return 0
}

main() {
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
    echo "  Android: installed"
  else
    echo "  Android: skipped"
  fi
  if [ "$ios_built" -eq 1 ]; then
    echo "  iOS: installed"
  else
    echo "  iOS: skipped"
  fi

  if [ "$android_built" -eq 0 ] && [ "$ios_built" -eq 0 ]; then
    echo "error: neither platform could be built on this host — see the messages above for what's missing." >&2
    exit 1
  fi
}

main "$@"
