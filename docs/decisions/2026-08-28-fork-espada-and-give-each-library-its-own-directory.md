---
status: accepted
---

# Fork `espada` and Give Each Library Its Own Directory

`modules/espada-engine/lib/` was a Cargo workspace holding "the Rust, and
nothing but the Rust," with the module's hand-written C++ sitting beside it
in a module-root `cpp/`, and `lib/espada-internal/` was a verbatim,
refresh-by-re-copy mirror of [`axross/espada`](https://github.com/axross/espada)
(see
`2026-08-27-vendor-espada-as-a-separate-crate-rather-than-depend-on-it.md`).
This decision reverses both: `lib/` is redefined as one directory per
library, whatever its language, and the copy becomes a fork maintained here.

**Keeping the workspace and moving only the C++** was rejected. It would
leave `lib/` defined as "the Rust, and nothing but the Rust" while holding
C++ — a convention contradiction with no offsetting benefit. The two changes
are coherent only together: `lib/` becomes one directory per library
(`bridge/`, `espada-engine/`, `espada-internal/`), the Cargo workspace over
the two Rust crates is dissolved so each carries its own `Cargo.toml` and
`Cargo.lock`, and the release profile — `panic = "unwind"`, `lto = "fat"`,
`codegen-units = 1`, `strip = true` — moves into `espada-engine`'s own
manifest, the crate that ships.

**Landing the three parts as separate pull requests** was rejected. The
directory-structure convention and the CI Rust job would each be rewritten
two or three times, and an intermediate state where `espada-internal` was a
fork inside a workspace whose lockfile ignored its own would be worse than
either endpoint.

**Dissolving the workspace has a genuine cost, accepted rather than
absorbed silently.** `target/` moves one level deeper per crate, roughly
doubling local disk cost (from one shared ~433 MB `target/` to roughly
451 MB across two, with `regex`, `aho-corasick` and `memchr` compiled
twice), and the two crates' lockfiles can now drift independently — nothing
enforces that they resolve `regex`, `fxhash` and `aho-corasick` to the same
versions, though they do today. `cargo test --workspace` also used to be the
single command that ran the forked crate's own suite; after the split that
coverage is preserved only as two explicit invocations, one per crate, with
nothing structural keeping the second one present.

**Copying `axross/espada`'s full repository wholesale, rather than only its
library proper, was rejected on measured evidence.** Placing the complete
upstream tree at `lib/espada-internal/` made `npx prettier --check .` fail
on 37 files and `npx eslint .` fail with 7 errors, all inside upstream's
`.agents/` skill tree — this repository's own `.prettierignore` and
`eslint.config.js` `ignores` do not cover it, and widening either to
accommodate vendored content was rejected too. It would also place a second
`AGENTS.md` and `CLAUDE.md` inside this repository's tree, carrying another
project's working agreement into sessions that touch the directory. Copying
only `src/`, `tests/`, `benches/`, `examples/`, `README.md` and `.gitignore`
— the same set upstream's own `Cargo.toml` `exclude` list names as not part
of the crate — avoids both failures.

**Taking upstream's `Cargo.toml` verbatim and renaming the crate to `espada`
was rejected** as a larger diff for no gain: it would break `espada-engine`'s
own dependency declaration, and the current `[lib] name = "espada"` already
lets the crate be imported as `espada::…` and keeps the 13 `insta` snapshot
fixture filenames valid without renaming anything.

**`PROVENANCE.md` and `LICENSE.txt` are deleted, with no replacement
provenance note.** Once the crate is no longer a byte-identical mirror kept
diffable against one recorded upstream commit, a document asserting that
byte-identity misstates what the directory is; the fork's own history in this
repository's git log is the record of what changed and when. The MIT licence
the crate carried was the maintainer's own to drop; `src/evaluator/dp_table.rs`
remains third-party Apache-2.0 code, © 2016–2024 Henry Lee, and its own file
header — untouched by this change — still carries that notice.

**The format and lint gates now extend to `espada-internal`.** They used to
be scoped away from it because the only way to satisfy a gate the copy
failed was to edit the copy, which would have made it no longer diffable
against upstream. That reason is gone: a fork maintained here is held to the
same gates as any other crate in this repository, the same way
`espada-engine` always was.

Two things this decision does not change: the module's public TypeScript
surface, its C ABI, its `.nitro.ts` spec, and everything under
`nitrogen/generated/` are untouched; and nothing here wires equity evaluation
through the C ABI or otherwise makes `espada` reachable from the shipped
binary — the 1 MB binary-size budget that decision would force stays exactly
as `docs/operations/native-module-artifacts.md` already described it.
