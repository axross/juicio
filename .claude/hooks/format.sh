#!/bin/bash

# posttooluse hook: after a code change, apply the repairs that need no
# authoring decision — the edited file's mechanically fixable eslint
# violations, then the project's formatting — so they never reach the
# blocking Stop hook. fires on edit/write tools. every repair here is
# best-effort and its failure is swallowed: a repair that cannot complete
# must not fail the tool call it is riding on.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${JUICIO_ENABLE_QUALITY_HOOKS:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
# normalize away a trailing slash so the "$PROJECT_DIR"/* guard below matches
# reliably regardless of how PROJECT_DIR was supplied.
PROJECT_DIR="${PROJECT_DIR%/}"

# read the edited file path from the tool payload on stdin.
FILE_PATH="$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

# only act when a source file changed; skip the rest. this outer gate admits
# every extension prettier understands, which is deliberately wider than the
# eslint gate further down.
case "$FILE_PATH" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.json) ;;
  *) exit 0 ;;
esac

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

# skip silently when the package manager is unavailable (e.g. a local shell
# without the toolchain provisioned).
command -v npm >/dev/null 2>&1 || exit 0

# repair the edited file's fixable eslint violations. the "$PROJECT_DIR"/*
# prefix is the load-bearing part of this pattern: it is what confines the
# fixer to files inside the project root. *.json is excluded because eslint
# does not handle it, though the outer gate above admits it. the path is then
# passed project-relative, which changes nothing eslint does — it resolves an
# absolute and a relative path to the same file, and eslint.config.js's own
# `ignores` apply either way (checked against eslint 9.39.5).
case "$FILE_PATH" in
  "$PROJECT_DIR"/*.ts | "$PROJECT_DIR"/*.tsx | "$PROJECT_DIR"/*.js | "$PROJECT_DIR"/*.jsx | "$PROJECT_DIR"/*.mjs)
    FILE_REL="${FILE_PATH#"$PROJECT_DIR"/}"
    FILE_REL="${FILE_REL#/}"
    npm run lint:fix -- "$FILE_REL" >/dev/null 2>&1 || true
    ;;
esac

npm run format >/dev/null 2>&1 || true
exit 0
