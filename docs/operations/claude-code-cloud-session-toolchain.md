# Claude Code Cloud Session Toolchain

A Claude Code cloud session needs Node 24, npm 11, Java 17, Rust, and the
Android SDK components required by the locked React Native package. The cloud
environment's externally configured setup script provisions those VM-level
tools before Claude Code starts. The repository's SessionStart hook restores
project state and validates the cached result; it does not provision the VM.

Claude cloud environment settings live at claude.ai rather than in this
repository. Repository code cannot install or update the setup script there.
An environment owner must keep the script below aligned with this document.

## Configure the cached setup

Use the following setup script for this repository's Claude cloud environment:

```bash
set -uo pipefail

curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh || true
export PATH="/usr/local/bin:$PATH"

mkdir -p ~/.config/mise ~/.android-sdk
cat > ~/.config/mise/config.toml <<'TOML'
[tools]
node = "24"
npm = "11"
java = "temurin-17"
android-sdk = "23.0"
rust = { version = "stable", profile = "minimal", components = ["rustfmt", "clippy"] }

[env]
ANDROID_HOME = "{{env.HOME}}/.android-sdk"
ANDROID_SDK_ROOT = "{{env.HOME}}/.android-sdk"
_.path = ["{{env.HOME}}/.android-sdk/platform-tools"]
TOML

mise install --yes || true
eval "$(mise env -s bash)" || true

compile_sdk="36"
build_tools="36.0.0"
ndk_version="27.1.12297006"

yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
sdkmanager --sdk_root="$ANDROID_HOME" \
  "platform-tools" "platforms;android-${compile_sdk}" \
  "build-tools;${build_tools}" "ndk;${ndk_version}" || true

ok=1
[[ "$(node --version 2>/dev/null)" == v24.* ]] || ok=0
[[ "$(npm --version 2>/dev/null)" == 11.* ]] || ok=0
[[ "$(java -version 2>&1)" == *'version "17.'* ]] || ok=0
[[ "$(rustc --version 2>/dev/null)" == rustc\ * ]] || ok=0
for directory in platform-tools "platforms/android-${compile_sdk}" \
  "build-tools/${build_tools}" "ndk/${ndk_version}"; do
  [ -d "$ANDROID_HOME/$directory" ] || {
    echo "missing: $ANDROID_HOME/$directory"
    ok=0
  }
done

if [ "$ok" = 1 ]; then
  echo "toolchain ok: $(node --version), npm $(npm --version), ANDROID_HOME=$ANDROID_HOME"
else
  echo "TOOLCHAIN INCOMPLETE — re-save this environment to rebuild its cache."
fi
exit 0
```

The setup script runs before Claude starts and deliberately ends successfully.
Claude cloud setup has a roughly five-minute limit, and a non-zero result
prevents the session from opening.
Each potentially fallible provisioning command therefore degrades to the final
diagnosis instead of failing the setup lifecycle. Do not add source-built Ruby
or an Android emulator: Ruby can consume most of the limit, and the cloud VM
cannot run the emulator.

The setup is cached by the cloud environment. Reusing that cache avoids the
downloads, but a stale or partly populated cache can still open a session. The
SessionStart diagnosis covers that case on every new or resumed session without
moving slow provisioning into the hook.

## Keep version ownership aligned

- Node 24 and npm 11 come from [`package.json`](../../package.json)'s
  `engines`.
- Temurin 17 comes from
  [`.github/actions/setup-android-toolchain`](../../.github/actions/setup-android-toolchain/action.yml).
- Stable Rust with `rustfmt` and `clippy` matches
  [`.github/actions/setup-rust`](../../.github/actions/setup-rust/action.yml).
- The setup script carries React Native's current Android values explicitly:
  compile SDK 36, build tools 36.0.0, and NDK 27.1.12297006. It cannot derive
  them from `node_modules` because SessionStart exclusively restores project
  dependencies after setup completes.

These are the same supported surfaces as the repository-owned Amp setup, but
the ownership differs. [`.agents/setup`](../../.agents/setup) runs as Amp's
fail-fast, snapshot-producing lifecycle and derives Android versions after its
own `npm ci`. Claude's setup remains external, cached, and time-limited. It
deliberately diagnoses failures and exits 0 so a partial cache does not prevent
the session from opening. Neither lifecycle calls the other.

SessionStart validates the Android directories against the requirements in its
installed `node_modules` on every startup and resume. A React Native update
that changes an Android version therefore reports a visible mismatch until an
environment owner updates this setup script and rebuilds the cache. This
tradeoff keeps SessionStart as the only Claude lifecycle that restores project
dependencies; Amp remains dynamic because its repository setup owns `npm ci`.

`ANDROID_HOME` points to `~/.android-sdk`, outside `mise`'s versioned Android
SDK installation. This prevents a plugin update from deleting packages that
`sdkmanager` installed.

## Restore and validate each session

On `startup` and `resume`,
[`.claude/hooks/session-start.sh`](../../.claude/hooks/session-start.sh):

1. activates the cached `mise` environment and persists it through
   `CLAUDE_ENV_FILE`;
2. confirms that active Node and npm match `package.json`, then runs exact
   `npm ci` restoration unless a marker for the lockfile digest and supported
   Node major already exists;
3. initializes absent local examples without overwriting contributor files;
4. checks each supported tool and React Native-required Android directory.

The hook exits 2 before dependency restoration under unsupported Node or npm,
after a failed dependency restore, or after an incomplete-toolchain diagnosis.
Claude Code displays the hook's actionable stderr for that status, but
SessionStart remains nonblocking and creates the session. Successful
dependency restoration stays quiet instead of adding `npm ci` output to model
context. If the hook reports an incomplete toolchain, re-save the cloud
environment to rebuild its cache, then start a new session. Running `mise
install` alone is insufficient when an Android component is missing.

## Operational limits

Cloud sessions do not install Ruby, Fastlane, Xcode, an emulator, a system
image, or Maestro. Those tools belong to release workflows, macOS, physical
devices, or hosted device infrastructure. See
[`2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md`](../decisions/2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md)
for the emulator constraints and alternative.
