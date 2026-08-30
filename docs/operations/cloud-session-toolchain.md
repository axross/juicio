# Cloud Session Toolchain

A Claude Code cloud session cannot build this app on the image it starts
from. The image ships Node 20, 21, and 22; `package.json` declares
`engines.node: "24"`, and under anything older than 24, `npx expo prebuild
--platform android --no-install` fails reading `app.config.ts` with
`SyntaxError: Unexpected token 'export'`. Nothing else in the toolchain is
present either: no JDK, no Android SDK. The cloud environment's setup script
closes all three gaps in one pass, through [`mise`](https://mise.jdx.dev/),
before any session starts.

This is a distinct problem from the one
[`operations/agent-sessions.md`](./agent-sessions.md) solves in its
Session-Start Hook section. `.claude/hooks/session-start.sh` activates a
toolchain that is already there; it does not install one. What follows is
how the toolchain gets there in the first place, so the hook has something
to activate.

## The Setup Script

The cloud environment's setup script — configured outside this repository, at
the environment level — runs this, verbatim:

```bash
curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh || true
export PATH="/usr/local/bin:$PATH"

mkdir -p ~/.config/mise
cat > ~/.config/mise/config.toml <<'TOML'
[tools]
node = "24"
java = "temurin-17"
android-sdk = "23.0"

[env]
ANDROID_HOME = "{{env.HOME}}/.android-sdk"
ANDROID_SDK_ROOT = "{{env.HOME}}/.android-sdk"
_.path = ["{{env.HOME}}/.android-sdk/platform-tools"]
TOML

mise install || true
eval "$(mise env -s bash)" || true
sdkmanager --sdk_root="$ANDROID_HOME" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "ndk;27.1.12297006" "cmake;3.22.1" || true

ok=1
mise doctor || ok=0
for d in platform-tools platforms build-tools ndk/27.1.12297006 cmake; do
  [ -d "$ANDROID_HOME/$d" ] || { echo "missing: \$ANDROID_HOME/$d"; ok=0; }
done
if [ "$ok" = 1 ]; then
  echo "toolchain ok: $(node --version), npm $(npm --version), ANDROID_HOME=$ANDROID_HOME"
else
  echo "TOOLCHAIN INCOMPLETE — this environment will fall back to the image's own Node."
  echo "Re-save the environment to rebuild its cache, or run 'mise install' in a session."
fi
exit 0
```

No file in this repository configures `mise` — not `mise.toml`, not
`.tool-versions`. The `[tools]` block above lives only in this script and in
`~/.config/mise/config.toml` once it runs; `mise` resolves that global config
when no project config exists, which is the case here. This keeps the
existing session-start hook's conditional activation
(`eval "$(mise activate bash)"` when `mise` is on `PATH`) sufficient on its
own: once this script has run, the hook needs no change to pick up `mise`,
Node 24, the JDK, and `ANDROID_HOME`.

`ANDROID_HOME` is deliberately overridden to `~/.android-sdk`, outside
`mise`'s own install tree. The `vfox-android-sdk` plugin points it at
`~/.local/share/mise/installs/android-sdk/<version>` by default, which would
put every `sdkmanager`-installed package where a later `mise` version bump
deletes it. The `[env]` block moves it out of that tree, and `sdkmanager
--sdk_root` installs into the override.

Every command in the script carries `|| true`, and the script ends in `exit
0`, because a non-zero exit here fails session start rather than degrading
it — a session that never starts is worse than one that starts with a
reported gap. The verification block at the end is written so it cannot
break that guarantee either: it only sets a flag and prints, and never exits
non-zero itself — see The Verification Block below for what it checks and
what it does not.

## Where Each Version Pin Comes From

- **Node `24`** — [`package.json`](../../package.json)'s `engines.node`.
- **Temurin `17`** —
  [`.github/actions/setup-android-toolchain/action.yml`](../../.github/actions/setup-android-toolchain/action.yml),
  which installs the same JDK for CI.
- **NDK `27.1.12297006`** —
  `node_modules/react-native/gradle/libs.versions.toml`'s `ndkVersion`, the
  same source
  [`operations/native-module-artifacts.md`](./native-module-artifacts.md)
  already names for CI's own NDK resolution.
- **`platforms;android-36`, `build-tools;36.0.0`, `cmake;3.22.1`, and the
  `android-sdk` `mise` plugin version `23.0`** are not pinned by any file in
  this repository. They are what this session's own `./gradlew
  assembleDebug` actually resolved against and completed with — verified by
  running the build to `BUILD SUCCESSFUL`, not read off a manifest. A future
  session adding a package here should install what the build itself asks
  for, the same way, rather than guessing a version forward.

## What Each Step Costs

Measured cold, in the session that produced this document, with everything
removed first:

| Step | Cost |
| ---- | ---- |
| `mise` installer | 2.8 s |
| `mise install` for `node@24`, `java@temurin-17`, `android-sdk@23.0` (parallel) | 9.2 s |
| `sdkmanager` for the five packages listed above | 62.9 s |
| **Total** | **~75 s**, against the setup script's roughly five-minute budget |
| `mise doctor` plus the five directory checks (the verification block) | 0.1 s |

The three `mise install` targets above are each a download-and-extract of a
prebuilt archive, which is why they finish in single-digit seconds run in
parallel — see Prebuilt Archive or Source Build below for a tool that does
not work that way.

The build this toolchain enables — `./gradlew assembleDebug`, under Node 24
— reported `BUILD SUCCESSFUL in 19m 6s` and produced a 100 MB
`app-debug.apk` (`arm64-v8a` only). That figure was measured while an
emulator experiment competed for the same four vCPUs, so it is an upper
bound rather than a clean cold-build number.

## Prebuilt Archive or Source Build

Before adding a tool to the `[tools]` block, check whether `mise` installs it
from a prebuilt archive or compiles it, because the two differ by two orders
of magnitude in cost and change what the setup script's five-minute budget
can absorb.

The three tools this script installs are all prebuilt: `mise install` fetches
an archive for each and extracts it, which is why all three together took
9.2 s in parallel. **Ruby is the counter-example**, and does not belong in
this script: `mise install ruby@3.3` runs `./configure` and `make -j 4` from
source and took **4 m 25 s** on its own — more than three times the entire
budget this script otherwise uses. (Ruby is not needed for an Android build
in a cloud session; `fastlane` runs on GitHub runners instead, where
`ruby-version: "3.3"` is already passed literally.)

There is no flag that tells you which behavior a tool has in advance; the
reliable check is to look at how the relevant `mise` plugin installs the
tool (an asset-download step versus a `make`/`configure` step) or to time a
first `mise install` for it before committing to putting it in this script.

## Operational Limits

A cloud session's disk is finite, and this toolchain is not free on it:

- The Android SDK root (`~/.android-sdk`) reaches **2.3 GB** after the
  `sdkmanager` install above.
- `~/.gradle` reached **5.3 GB** after a single `./gradlew assembleDebug`
  run.
- The session's writable allowance is otherwise limited: adding the Android
  emulator and one x86_64 system image (see Emulators Do Not Run in a Cloud
  Session below) added a further 5 GB on top of the above and took the disk
  to 90% full. Do not add either to this script.

## The Silent Fallback

**A partly-provisioned session degrades silently, with no warning, into a
toolchain that cannot build this app — and this is the failure the
verification block exists to catch.** The setup script must exit zero, so
every command in it carries `|| true`; a `mise install` that half-fails on a
network hiccup produces a session that starts normally, with `mise`
activated but missing a tool.

Reproduced directly: with `node@24` removed and a fresh shell opened, the
activated `PATH` simply lost its Node entry and the image's own Node won —
no warning, no error. The shell resolved `/opt/node22/bin/node`, `node
v22.22.2`, `npm 10.9.7`. That is exactly the Node under which `expo
prebuild` fails with the `SyntaxError` described at the top of this
document.

**Recovery:** run `mise doctor`. It reports the gap in 0.1 s —
`1 problem found: tool core:node@24.20.0 is not installed`, exiting 1 — where
a healthy toolchain prints `No problems found` and exits 0. Follow it with
`mise install` to fill the gap; restoring the removed tool in the
reproduction above took about ten seconds.

## The Verification Block

The block at the end of the setup script (reproduced in The Setup Script
above) checks two surfaces, because neither sees the other's:

- `mise doctor` answers for the three `mise`-managed tools — `core:java`,
  `core:node`, and the `vfox-android-sdk` plugin — and exits non-zero when
  one is missing or misconfigured.
- The `sdkmanager`-installed packages under `$ANDROID_HOME` are invisible to
  `mise doctor`, so the block tests each as a directory instead. The NDK is
  tested at its exact pinned path (`ndk/27.1.12297006`), not as a bare `ndk/`
  directory, so a wrong or partial NDK is caught rather than passed.

**This check fires only when the setup script itself runs** — at
environment creation, and again on a cache rebuild. A session started from
an already-cached, previously-verified snapshot is not re-checked; nothing
runs this block again for it. That is the coverage this design gives up in
exchange for keeping the check out of every session's own start-up path —
see [`operations/agent-sessions.md`](./agent-sessions.md)'s Session-Start
Hook section for why the hook is deliberately not where this lives instead.
A snapshot that goes stale between a cache build and a much later session
using it announces nothing on its own, and the recovery described in The
Silent Fallback above is what a session run then has to reach for by hand.

## Emulators Do Not Run in a Cloud Session

No configuration makes the Android emulator work in a cloud session; see
[`decisions/2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md`](../decisions/2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md)
for the three blockers and the alternative. This document's setup script
therefore installs no emulator and no system image — see Operational Limits
above for what they would have cost.
