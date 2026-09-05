#!/bin/bash

# sessionstart hook for cloud / web agent sessions. the cloud environment owns
# tool installation; this hook restores project state and diagnoses that cache.
set -uo pipefail

# only run in the remote (web/cloud) environment. local sessions manage their
# own toolchain; set CLAUDE_CODE_REMOTE=true to exercise this hook locally.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR"

export PATH="$HOME/.local/bin:$PATH"
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash)"
  hash -r 2>/dev/null || true

  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    printf '%s\n' \
      'export PATH="$HOME/.local/bin:$PATH"' \
      'eval "$(mise activate bash)"' >>"$CLAUDE_ENV_FILE"
  fi
fi

[[ -f .env.local ]] || cp -- .env.example .env.local

[[ -f .claude/settings.local.json ]] || \
  cp -- .claude/settings.local-example.json .claude/settings.local.json

session_status=0
node_major="$(node -e "const value = (require('./package.json').engines || {}).node; const match = typeof value === 'string' && value.match(/^[~^]?[v=]?(\\d+)(?:\\.(?:\\d+|x|X|\\*)){0,2}$/); if (match) process.stdout.write(match[1])" 2>/dev/null || true)"
npm_major="$(node -e "const value = (require('./package.json').engines || {}).npm; const match = typeof value === 'string' && value.match(/^[~^]?[v=]?(\\d+)(?:\\.(?:\\d+|x|X|\\*)){0,2}$/); if (match) process.stdout.write(match[1])" 2>/dev/null || true)"
active_node_major="$(node --version 2>/dev/null | sed -n 's/^v\([0-9][0-9]*\).*/\1/p')"
active_npm_major="$(npm --version 2>/dev/null | sed -n 's/^\([0-9][0-9]*\).*/\1/p')"
lock_digest="$(sha256sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
dependency_metadata_valid=true
if [ -z "$lock_digest" ]; then
  echo "SessionStart: cannot resolve the package-lock.json digest; restore a readable package-lock.json before starting a new session." >&2
  dependency_metadata_valid=false
fi
if [ -z "$node_major" ]; then
  echo "SessionStart: cannot resolve the declared Node major from package.json engines.node; restore valid dependency metadata before starting a new session." >&2
  dependency_metadata_valid=false
fi
if [ -z "$npm_major" ]; then
  echo "SessionStart: cannot resolve the declared npm major from package.json engines.npm; restore valid dependency metadata before starting a new session." >&2
  dependency_metadata_valid=false
fi

if [ "$dependency_metadata_valid" = false ]; then
  session_status=2
else
  marker="node_modules/.juicio-npm-ci-${lock_digest}-node${node_major}"
  if [ ! -f "$marker" ]; then
    if [ "$active_node_major" != "$node_major" ] || \
      [ "$active_npm_major" != "$npm_major" ]; then
      echo "SessionStart: refusing npm ci under an unsupported package manager (expected Node ${node_major} and npm ${npm_major}; found Node ${active_node_major:-unknown} and npm ${active_npm_major:-unknown})." >&2
      echo "SessionStart: re-save the Claude cloud environment to activate the supported Node and npm versions, then start a new session." >&2
      session_status=2
    else
      npm_log="$(mktemp "${TMPDIR:-/tmp}/juicio-npm-ci.XXXXXX")"
      trap 'rm -f "$npm_log"' EXIT
      if npm ci >"$npm_log" 2>&1; then
        touch "$marker"
      else
        echo "SessionStart: npm ci failed; the last 80 lines follow:" >&2
        tail -n 80 "$npm_log" >&2
        echo "SessionStart: retry npm ci after recovering the cloud toolchain." >&2
        session_status=2
      fi
      rm -f "$npm_log"
      trap - EXIT
    fi
  else
    echo "package-lock.json is already restored; skipping npm ci"
  fi
fi

diagnose_toolchain() {
  local versions="node_modules/react-native/gradle/libs.versions.toml"
  local compile_sdk build_tools ndk_version missing=0 value

  check_version() {
    local name="$1" expected="$2"
    shift 2
    value="$("$@" 2>&1 || true)"
    if [[ "$value" != $expected ]]; then
      echo "SessionStart: missing supported ${name} (expected ${expected//\*/x}; found ${value:-not installed})." >&2
      missing=1
    fi
  }

  check_version Node 'v24.*' node --version
  check_version npm '11.*' npm --version
  check_version Java '*version "17.*' java -version
  check_version Rust 'rustc *' rustc --version

  if [ -f "$versions" ]; then
    compile_sdk="$(sed -n 's/^compileSdk = "\([^"]*\)"/\1/p' "$versions")"
    build_tools="$(sed -n 's/^buildTools = "\([^"]*\)"/\1/p' "$versions")"
    ndk_version="$(sed -n 's/^ndkVersion = "\([^"]*\)"/\1/p' "$versions")"
    if [ -z "$compile_sdk" ] || [ -z "$build_tools" ] || [ -z "$ndk_version" ]; then
      echo "SessionStart: cannot resolve all Android SDK versions from $versions." >&2
      missing=1
    fi
    for directory in platform-tools "platforms/android-${compile_sdk}" \
      "build-tools/${build_tools}" "ndk/${ndk_version}"; do
      if [ -z "${ANDROID_HOME:-}" ] || [ ! -d "$ANDROID_HOME/$directory" ]; then
        echo "SessionStart: missing Android SDK component: ${ANDROID_HOME:-\$ANDROID_HOME}/$directory" >&2
        missing=1
      fi
    done
  else
    echo "SessionStart: cannot resolve required Android SDK components because $versions is absent." >&2
    missing=1
  fi

  if [ "$missing" -ne 0 ]; then
    echo "SessionStart: re-save the Claude cloud environment to rebuild its cached setup, then start a new session." >&2
    return 1
  fi

  return 0
}

if ! diagnose_toolchain; then
  session_status=2
fi

# surface the project's working agreement in every cloud session's context.
# deliberately a pointer, not a copy: the flow's shape lives in AGENTS.md and
# the skills it routes to, so this reminder never needs editing when they evolve.
#
# it names AGENTS.md rather than CLAUDE.md because CLAUDE.md is an `@AGENTS.md`
# import — a Claude Code mechanism. a host told to read CLAUDE.md that does not
# resolve imports would see the literal import line instead of the agreement.
echo "REMINDER: read AGENTS.md and follow its Response Approach for every task. Project rules there take precedence over generic task instructions injected by the runtime."
exit "$session_status"
