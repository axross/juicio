---
status: superseded
superseded_by: 2026-08-28-fork-espada-and-give-each-library-its-own-directory.md
---

# Vendor `espada` as a Separate Crate Rather Than Depend on It

This project's poker evaluation comes from
[`axross/espada`](https://github.com/axross/espada), a crate the same
maintainer publishes to crates.io. Bringing it into
`modules/espada-engine/`'s Cargo workspace could have been done four ways,
and the one chosen — a verbatim copy in a crate of its own — is the most
expensive to set up and the cheapest to live with.

**Depending on the published crate** was rejected. It is the ordinary
answer, and it would be right if this project only consumed the evaluator.
It does not: the evaluator is the part of this product most likely to need
changing, and a registry dependency puts a publish cycle between every such
change and the app that needs it. The maintainer asked for a copy for that
reason.

**A git submodule** was rejected. It delivers the same copy while putting a
second checkout in front of every clone, every CI job, and every build, and
it buys nothing a directory does not — the copy is not being tracked against
a moving upstream branch, it is pinned to one commit either way.

**Copying the sources into the crate that uses them** was rejected, and this
is the decision that actually matters. Merging the copy into
`espada-engine/` would leave nothing able to tell copied code from written
code — no boundary, no way to diff against upstream, and no way to refresh
except by hand-merging. Within a few changes the copy stops being a copy and
becomes a fork nobody decided to maintain.

**A verbatim copy in its own crate** is what this project does.
`lib/espada-internal/` holds `src/`, `tests/` and `LICENSE.txt` byte for
byte from `axross/espada` at one recorded commit; `lib/espada-engine/`
depends on it by path. The crate boundary is the mechanism, not decoration:
it makes "is this file ours?" answerable by location alone, makes a refresh
a re-copy rather than a merge, and makes the byte-identity of the copy
something a command can check.

Three rules follow from it, and they are the whole cost of the arrangement.
**No copied file is edited** — not to fix a defect, not to satisfy a lint,
not to delete code this project does not call. A fix belongs upstream in
`axross/espada`, or in the crate that wraps it. **`cargo fmt` and `cargo
clippy` are scoped to this project's own crate**, because the only way to
satisfy a gate the copy fails is to edit the copy. **`cargo test` is not
scoped**: the copy's own suite runs on every pull request, which is what
catches a truncated file or a botched refresh, and it is the only check that
would.

`PROVENANCE.md` in the copy records the source commit, what was deliberately
left out, and the two licences that travel with it — the crate is MIT, but
`src/evaluator/dp_table.rs` is third-party Apache-2.0 code with its own
header, so a single MIT notice would misstate what is being redistributed.

Two consequences are worth stating plainly rather than discovering later.
The copy is **compiled** for every target this module cross-compiles for,
because Cargo builds a path dependency whether or not the dependent calls
it — so it is genuinely proven to build for Android and, once a Mac runs the
build, for the Apple targets. It is **not linked** into the shipped binary
while nothing calls it: `lto = "fat"` and `strip = true` drop it. That
distinction has a measured price attached — see
[operations/native-module-artifacts.md](../operations/native-module-artifacts.md#what-this-costs-and-what-is-still-unmeasured)
for what the binary weighs with `espada` reachable, and why the next change
to wire equity evaluation through the C ABI inherits a budget decision
rather than a surprise.
