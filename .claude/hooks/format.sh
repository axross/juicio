#!/bin/bash

# posttooluse hook: formats the project after a code change so written files
# stay consistent. fires on edit/write tools.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# read the edited file path from the tool payload on stdin.
FILE_PATH="$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

# only format when a source file the formatter understands changed; skip the
# rest. the case-pattern below is the CODE_FILE_GLOB token, e.g.
# "*.ts | *.tsx | *.js | *.css".
case "$FILE_PATH" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.json) ;;
  *) exit 0 ;;
esac

cd "$PROJECT_DIR"

# activate the project's Node toolchain: mise (which reads the version pinned
# in .nvmrc) if it is on PATH, and otherwise proceed with whatever Node is
# already on PATH, warning to stderr when its major version does not match
# .nvmrc.
export PATH="$HOME/.local/bin:$PATH"
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate bash)"
elif command -v node >/dev/null 2>&1; then
  want="$(tr -d '[:space:]' < .nvmrc 2>/dev/null || true)"
  have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [ -n "$want" ] && [ -n "$have" ] && [ "${want#v}" != "$have" ]; then
    echo "warning: Node ${have} on PATH does not match the version pinned in .nvmrc (${want})" >&2
  fi
fi

# skip silently when the package manager is unavailable (e.g. a local shell
# without the toolchain provisioned).
command -v npm >/dev/null 2>&1 || exit 0

npm run format >/dev/null 2>&1 || true
exit 0
