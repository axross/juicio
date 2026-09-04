# Amp Orb Toolchain

An Amp orb receives this project's supported toolchain from the executable
repository lifecycle script [`.agents/setup`](../../.agents/setup). On a fresh
orb Amp runs the script before work begins and can snapshot its result. On a
stale warm filesystem it runs the same idempotent script again; an exact current
snapshot may skip setup. Provisioning is therefore versioned and reviewed with
the repository rather than held in Amp project settings.

This is distinct from the Claude Code-specific lifecycle that
[`operations/agent-sessions.md`](./agent-sessions.md) solves in its
Session-Start Hook section. `.claude/hooks/session-start.sh` runs only for a
Claude remote session, activates an available toolchain, and restores that
session's dependencies. It is not Amp's setup entry point. Amp needs no
`.agents/resume` because this repository has no service, authentication, or
connection that must be repaired whenever an orb wakes.

## What Setup Provisions

The script installs the official mise v2026.9.1 Linux x64 release binary after
verifying its published SHA-256 checksum. It configures Node 24, npm 11,
Temurin Java 17, and the Android command-line SDK. Node and npm come from
`package.json`'s `engines`; Java matches
[`.github/actions/setup-android-toolchain`](../../.github/actions/setup-android-toolchain/action.yml).
After `npm ci` restores the exact `package-lock.json`, setup reads React
Native's installed `gradle/libs.versions.toml` and installs its compile SDK,
build tools, and NDK together with platform tools. This keeps dependency-owned
Android versions out of a second repository pin.

Stable Rust is installed through `mise` with `rustfmt` and `clippy`, matching
the components exercised by the merge checks. Mise uses Rustup internally for
this backend. The project tool declarations live in the dedicated
`~/.config/mise/juicio.toml`; setup leaves mise's default global config
untouched. `MISE_GLOBAL_CONFIG_FILE` and mise activation are recorded once in
`~/.bash_profile`, making the complete environment available to later clean
non-interactive login shells.

JavaScript dependencies use `npm ci`. A marker tied to `package-lock.json` and
the supported Node major avoids deleting and recreating an already-restored
`node_modules` on a warm setup run. `.env.example` is copied to `.env.local`
only when the local file does not exist.

`ANDROID_HOME` is deliberately overridden to `~/.android-sdk`, outside
`mise`'s own install tree. The `vfox-android-sdk` plugin otherwise points it at
the plugin's versioned installation directory, where a later plugin version
change could remove packages installed by `sdkmanager`.

Setup is non-interactive and uses `set -euo pipefail`. A failed download,
dependency restore, SDK install, or final version/directory check exits
non-zero at the named timed step. This deliberately prevents Amp from
publishing a refreshed snapshot whose toolchain is incomplete.

## Where Each Version Comes From

- **Node 24 and npm 11** — [`package.json`](../../package.json)'s `engines`.
- **Temurin 17** —
  [`.github/actions/setup-android-toolchain/action.yml`](../../.github/actions/setup-android-toolchain/action.yml),
  which installs the same JDK for CI.
- **The NDK, Android platform, and build tools** —
  `node_modules/react-native/gradle/libs.versions.toml`'s `ndkVersion`,
  `compileSdk`, and `buildTools` keys, the same source
  [`operations/native-module-artifacts.md`](./native-module-artifacts.md)
  names for CI's own NDK resolution. These pins travel with the exact React
  Native package restored from `package-lock.json`.
- **Stable Rust with `rustfmt` and `clippy`** —
  [`.github/actions/setup-rust`](../../.github/actions/setup-rust/action.yml)
  and the six Rust commands documented in the README.

## Operational Limits

Setup does not install Ruby or Fastlane, Xcode, an emulator, a system image,
or Maestro. Those tools either cannot run meaningfully on a Debian orb or are
assigned to device, macOS, release, or manually dispatched workflows. It also
starts no server, watcher, or daemon. Long-running processes belong in an Amp
service definition if the project acquires one in the future.

No configuration makes the Android emulator work in a cloud session; see
[`decisions/2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md`](../decisions/2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md)
for the blockers and the physical-device alternative. Setup therefore installs
no emulator or system image.
