---
status: accepted
---

# Declare Node and npm in `package.json`'s `engines`, and Ruby in the Workflows, Not Root Version Files

Node's version lived in a root `.nvmrc` (`22`), read by eight
`actions/setup-node` steps across three workflow files via
`node-version-file: .nvmrc`, and by three agent hooks under `.claude/hooks/`
that warned when the local Node's major did not match it. Ruby's version
lived in a root `.ruby-version` (`3.3`), read by neither preview workflow
directly: `ruby/setup-ruby@v1` resolved it implicitly through its documented
fallback chain (`.ruby-version` → `.tool-versions` → `mise.toml`). npm's
version was declared nowhere at all — every job simply ran whatever npm
happened to ship with the Node `actions/setup-node` installed.

`package.json`'s `engines` field is now the single declared source for Node
**and** npm: `engines.node` is `"24"`, moving the project onto Node's current
Active LTS line (`22` entered Maintenance LTS, EOL 2027-04-30), and
`engines.npm` is `"^11"`, the major Node 24 bundles. Every
`actions/setup-node` step reads `node-version-file: package.json` instead of
`.nvmrc`. Because `actions/setup-node` does not read `engines.npm` and
Corepack does not manage npm either, each of the eight jobs now runs an
explicit step between `Setup Node` and dependency installation that installs
the range `engines.npm` declares, sourced from `package.json` rather than
restated in the workflow — declaring the range without enforcing it would
have left it an unenforced comment. Both `ruby/setup-ruby@v1` steps in the
preview workflows now pass `ruby-version: "3.3"` literally, so removing
`.ruby-version` cannot silently change which Ruby the fastlane lanes build
against. `.nvmrc` and `.ruby-version` were deleted from the root, and the
three agent hooks were rewritten to read `engines.node` out of `package.json`
instead of `.nvmrc`, extracting the first integer from the declared value —
correct for a bare major or a leading-major range (`^24`, `>=24`, `24.x`),
but not for a compound OR-range, where no single major is the one a mismatch
warning could compare against.

Three alternatives were rejected. A composite action or reusable workflow for
the repeated Node-plus-npm setup was rejected: this repository has no
`.github/actions/` directory today, the eight jobs already repeat `Setup Node`
verbatim, and introducing that indirection would have made this change about
workflow structure rather than about where the versions are declared — it
stays available as separate work. Keeping `mise` project-pinned by adding a
`devEngines` field to `package.json` was rejected: `mise` only reads
`devEngines` when idiomatic version files are explicitly enabled in a
contributor's own `mise` config, and `actions/setup-node@v4` — the version
this project pins — does not read `devEngines` at all (`v6.3.0` added that
support), so it would have added a second Node declaration in the manifest
for a benefit no contributor gets by default. Declaring `engines.npm` without
installing it in CI was rejected as the cheapest option that does not
actually close the gap this change exists to close.

The accepted cost is that `mise` no longer resolves a project-specific Node
version from this repository: it reads neither `engines.node` nor
`volta.node`, only `devEngines`, under the condition the rejected alternative
above deliberately avoided creating. A contributor who runs `mise` locally now
selects their own Node version; nothing in this repository steers it for
them. In exchange, provisioning a toolchain from a fresh checkout now takes
reading exactly one file for Node and npm — `package.json` — and the workflow
file itself for Ruby, rather than three separate root files whose consumers
differed by tool.
