#!/bin/bash

# stop hook: before the task completes, run the unit tests and lint whenever
# code changed in this session. failures block completion and are reported back
# on stderr so the agent addresses them before finishing.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR"

# activate the project's Node toolchain: mise if it is on PATH, and otherwise
# proceed with whatever Node is already on PATH, warning to stderr when its
# major version does not match package.json's declared engines.node. mise
# itself no longer resolves a project-specific Node version here: it reads
# neither engines.node nor volta.node, only devEngines, and only when
# idiomatic version files are explicitly enabled.
export PATH="$HOME/.local/bin:$PATH"
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash)"
elif command -v node >/dev/null 2>&1; then
  want="$(node -p "(require('./package.json').engines || {}).node || ''" 2>/dev/null | grep -oE '[0-9]+' | head -n1 || true)"
  have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [ -n "$want" ] && [ -n "$have" ] && [ "$want" != "$have" ]; then
    echo "warning: Node ${have} on PATH does not match the major version declared in package.json's engines.node (${want})" >&2
  fi
fi

# nothing to verify without the package manager.
command -v npm >/dev/null 2>&1 || exit 0

# only run when this session has pending code changes, either uncommitted or
# committed but not yet on the upstream branch. avoids checking on plain
# conversational turns. CODE_GLOB below is the CODE_FILE_REGEX token, an
# extended-regex of source extensions, e.g. '\.(ts|tsx|js|css)$'.
CODE_GLOB='\.(ts|tsx|js|jsx|mjs)$'
code_changed() {
  if git status --porcelain 2>/dev/null | grep -qE "$CODE_GLOB"; then
    return 0
  fi
  local upstream
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
  if [ -n "$upstream" ] && git diff --name-only "$upstream...HEAD" 2>/dev/null | grep -qE "$CODE_GLOB"; then
    return 0
  fi
  return 1
}

code_changed || exit 0

# run both checks, collecting output for the failure report.
OUTPUT="$(mktemp)"
STATUS=0
if ! npm run test:unit >>"$OUTPUT" 2>&1; then STATUS=1; fi
if ! npm run lint >>"$OUTPUT" 2>&1; then STATUS=1; fi

if [ "$STATUS" -ne 0 ]; then
  {
    echo "Pre-completion checks failed (npm run test:unit / npm run lint)."
    echo "Fix the errors below before completing the task:"
    echo
    tail -n 100 "$OUTPUT"
  } >&2
  rm -f "$OUTPUT"
  exit 2
fi

rm -f "$OUTPUT"
exit 0
