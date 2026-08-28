# ♠️ espada

Texas Hold'em poker odds evaluator.

[![Latest Version](https://img.shields.io/crates/v/espada)](https://crates.io/crates/espada)
[![Recent Downloads](https://img.shields.io/crates/dr/espada)](https://crates.io/crates/espada)
![License](https://img.shields.io/crates/l/espada)

espada scores a seven-card holding into one comparable number, parses and expands the
range notation players already write, and walks every post-flop board completion for a
set of ranges exhaustively.

One thing is worth knowing before reading any number it returns: **a lower power index
is a stronger hand.** `1` is the royal flush and `7462` the weakest high card, and the
categories `hand_type` returns are bands over that range.

- [API documentation](https://docs.rs/espada/latest/espada/) on docs.rs
- [The crate](https://crates.io/crates/espada) on crates.io
- [`examples/`](./examples) — two runnable programs, single-threaded and multi-threaded
- [`docs/`](https://github.com/axross/espada/blob/main/docs/index.md) — this
  repository's own account of itself, for contributors

## Install

```sh
cargo add espada
```

## Usage

Run two ranges against a three-card board and print each player's equity:

```rust
use espada::card::{Card, Rank, Suit};
use espada::evaluator::FlopExhaustiveEvaluator;
use espada::hand_range::{HandRange, ParseHandRangeError};

fn main() -> Result<(), ParseHandRangeError> {
    let board = [
        Some(Card::new(Rank::Queen, Suit::Spade)),
        Some(Card::new(Rank::Eight, Suit::Diamond)),
        Some(Card::new(Rank::Deuce, Suit::Heart)),
        None,
        None,
    ];

    // `parse` is fallible: an empty string or an unparseable token is a
    // `ParseHandRangeError` rather than a panic.
    let players: Vec<HandRange> = vec!["JJ+".parse()?, "A2s+".parse()?];

    let mut wins = vec![0.0_f64; players.len()];
    let mut total = 0.0_f64;

    for showdown in FlopExhaustiveEvaluator::new(&board, &players) {
        // A range may weight a holding, so every showdown counts for what it is
        // worth rather than for one.
        let probability = showdown.probability() as f64;

        for (player_index, player) in showdown.players().iter().enumerate() {
            if player.is_winner() {
                wins[player_index] += probability / showdown.winner_len() as f64;
            }
        }

        total += probability;
    }

    for (player_index, player) in players.iter().enumerate() {
        println!("{}: {:.2}%", player, wins[player_index] / total * 100.0);
    }

    Ok(())
}
```

The board is five slots with the unknown ones left `None`, and
`FlopExhaustiveEvaluator` fills the turn and the river with every remaining pair of
cards, yielding one `Showdown` per completion. A completion that would deal one
physical card twice — a player's hole card already on the board, or one another
player holds — is skipped rather than yielded. A split pot is handled by `winner_len`,
which counts the winners a showdown has rather than assuming one. Both programs under
[`examples/`](./examples) are this same loop with a per-card-pair breakdown and, in
one of them, threads.

## Toolchain

A stable Rust toolchain is all the crate needs. No minimum version is pinned, and
nothing here depends on a particular way of installing one; CI provisions it with
`rustup update stable`.

Two `cargo` subcommands are used by some commands below. Neither is declared in
`Cargo.toml`, because a subcommand is a binary installed into the toolchain rather than
a crate the library links against — the `insta` *library* is a dev-dependency, and only
its CLI is installed this way:

```sh
cargo install cargo-insta     # accepting snapshot changes
cargo install cargo-llvm-cov  # coverage, as CI measures it
```

Node runs the tooling that lives outside the crate: the documentation validators and
the installed-copies gate below, `npx skills` for refreshing the installed skills, and
`semantic-release` in the publish workflow. None of it is a project dependency — there
is no `package.json` and no JavaScript in the crate. CI runs the checks on Node 22 and
the release job on Node 20.

## Commands

This file is the authoritative record of the repository's commands, for human
contributors and agents alike: the table below covers the `cargo` workflow, and the
documentation-validator and skill commands follow further down. Run format + lint
after every change, and the checks relevant to the changed surface before opening a
pull request — see
[docs/operations/verification.md](https://github.com/axross/espada/blob/main/docs/operations/verification.md),
which says which change owes which.

| Command                                    | What it does                                                                | When to run it                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `cargo build --release`                    | Compiles the library optimized.                                             | After changes to evaluation, ranges, or dependencies.                 |
| `cargo fmt`                                | Formats with rustfmt defaults.                                              | After every set of edits, before committing.                          |
| `cargo fmt --check`                        | Reports formatting without rewriting. This is what CI runs.                 | To reproduce the CI gate locally.                                     |
| `cargo clippy --all-targets -- -D warnings`| Lints `src/`, tests, benches, and examples, failing on any warning. This is a CI gate. | After formatting; fix every finding before finishing.                 |
| `cargo test`                               | Runs the full suite, including the `insta` snapshot assertions.             | After any change to Rust source.                                      |
| `cargo test <name>`                        | Runs the tests whose name matches.                                          | While iterating on one area.                                          |
| `cargo insta test --review`                | Runs the suite and opens each snapshot change for accept/reject.            | When a change alters snapshotted output. Never hand-edit a `.snap`.   |
| `cargo llvm-cov --all-features`            | Runs the suite under coverage instrumentation. CI adds `--codecov --output-path codecov.json` and uploads the report. | When coverage itself is the question; `cargo test` covers the rest.   |
| `cargo bench`                              | Runs the criterion benchmarks in [`benches/`](./benches).                   | After a change intended to affect evaluation throughput.              |
| `cargo bench --no-run`                     | Compiles the benchmarks without running them.                               | To confirm a bench still builds, when timing is not the point.        |
| `cargo run --example single-thread Qs8d2h JJ+ A2s+` | Runs the single-threaded exhaustive evaluation. Arguments are required: a board, then one range per player. | To sanity-check end-to-end behaviour by hand.                         |
| `cargo run --release --example multi-thread Qs8d2h JJ+ A2s+` | Runs the same evaluation split across threads, on the same arguments. Use `--release`; it is slow otherwise. | Same, and when `scope` behaviour is what changed.                     |
| `cargo doc --no-deps --open`               | Builds this crate's API documentation.                                      | After changing a public signature or a doc comment.                   |

Documentation under
[`docs/`](https://github.com/axross/espada/blob/main/docs/index.md) has five validators
of its own plus a link checker. They ship inside the installed skills rather than as
project scripts, so they are invoked by path. CI runs the same sequence on every pull
request; run it locally after changing any document there:

```sh
failed=
for check in .agents/skills/living-project-documentation/scripts/check-*.mjs; do
  node "$check" docs || failed=1
done
node .agents/skills/agent-skill-authoring/scripts/check-links.mjs docs || failed=1
[ -z "$failed" ]
```

Each answers one question: `check-index.mjs` that every document is listed in
`docs/index.md`, `check-references.mjs` that every relative link resolves,
`check-glossary.mjs` that every spec has a glossary heading,
`check-decision-naming.mjs` that every decision filename conforms, and
`check-decision-supersede.mjs` that the supersede chain is sound.

A repository-local skill is validated rather than reinstalled. Run the three
`agent-skill-authoring` structure validators and the link checker against it after any
edit:

```sh
for check in .agents/skills/agent-skill-authoring/scripts/check-skill-*.mjs; do
  node "$check" .agents/skills/<name> || exit 1
done
node .agents/skills/agent-skill-authoring/scripts/check-links.mjs .agents/skills/<name>
```

The two loops fail differently, and both behaviours are deliberate. The `docs` loop
records a failure and carries on, so one broken document does not hide the next. The
skill loop stops at the first failing check, because a skill that fails one structure
validator usually fails the others for the same reason and the first report is the one
worth reading. CI runs the `docs` loop; the skill loop is run by hand.

If a required command cannot be run, say so — naming the command, the reason, and the
residual risk — rather than presenting the change as fully verified.

## Documentation

[`docs/`](https://github.com/axross/espada/blob/main/docs/index.md) is this repository's
own account of itself: what the library does (`specs/`), the rules a change has to
satisfy (`conventions/`), the procedures someone executes (`operations/`), and why past
constraints exist (`decisions/`), with a glossary holding the vocabulary all four
bodies use. The index is one screen and says which document holds what. It describes
the repository rather than the library, so the published crate does not carry it.

## Review

Every change is reviewed against
[REVIEW.md](https://github.com/axross/espada/blob/main/REVIEW.md), the review policy:
what a posted review reports, the two severity labels it may use, the severity floors
this crate fixes for its own recurring defect classes, and the four checks a review
runs every time.

The review itself runs in a separate session under a bot identity, wired up in
[`claude-review.yml`](https://github.com/axross/espada/blob/main/.github/workflows/claude-review.yml)
and triggered by a comment on the pull request. It is advisory: it posts findings and
never approves or merges, because merging stays a human decision. See
[docs/operations/code-review.md](https://github.com/axross/espada/blob/main/docs/operations/code-review.md)
for how it is invoked and the three safety properties its workflow depends on.

## Agent skills

`.agents/skills/` holds two kinds of skill, and which kind a skill is decides whether it
may be edited here. `skills-lock.json` is the record: a skill listed there is installed,
one absent from it is this repository's own.

**Installed skills** are copies of upstream capabilities from
[axross/skills](https://github.com/axross/skills), committed so a session finds them
without a network fetch. This repository neither authors nor publishes them, and they
MUST NOT be edited here — the next reinstall discards a hand-edit.

**Repository-local skills** are authored here, and their committed copy *is* the source
of truth, so editing them in place is the correct workflow. `npx skills` never touches
them and they never appear in `skills-lock.json`. There is one: `texas-holdem`, the
rules, procedure, notation, and strategy of the game this crate evaluates.

The files live once, under `.agents/skills/<name>/`, and `.claude/skills/<name>` is a
symlink into that directory, so Codex and Claude Code read the same bytes from the path
each looks in. Both roots and `skills-lock.json` are committed, and `Cargo.toml`'s
`exclude` list keeps every one of those files out of the published crate. Refresh the
**installed** skills with:

```sh
npx skills add axross/skills --agent codex --skill '*' --yes
```

The CLI writes `.agents/skills/` and does not create the Claude Code symlinks, so a
skill added or removed needs its link kept in step:

```sh
for d in .agents/skills/*/; do
  n=$(basename "$d")
  ln -sfn "../../.agents/skills/$n" ".claude/skills/$n"
done
```

That the two roots agree is a merge gate rather than a manual confirmation — CI fails
the pull request when they diverge. Run it yourself after any install or symlink edit:

```sh
node .agents/skills/agent-skill-management/scripts/check-installed-copies.mjs \
  .agents/skills .claude/skills
```

[docs/conventions/agent-skills.md](https://github.com/axross/espada/blob/main/docs/conventions/agent-skills.md)
carries the rest: why `texas-holdem` lives under the skill root rather than in a
`skills/` source directory, the deviations from an installed skill this repository has
already accepted, and what to do when an installed skill turns out to be wrong.

## Releasing

Releases are automatic: every push to `main` runs `semantic-release`, which derives the
version from commit messages and publishes to crates.io. The version in `Cargo.toml`
is an output and MUST NOT be edited by hand, and there is no `CHANGELOG.md` — the
GitHub release notes are the changelog. A `BREAKING CHANGE:` footer bumps the minor
rather than the major while the crate is pre-1.0 — see
[docs/operations/releasing.md](https://github.com/axross/espada/blob/main/docs/operations/releasing.md),
which also explains why the order of two release plugins is load-bearing, and why no
version number is written into prose anywhere in this repository.

## License

MIT, with one exception: `src/evaluator/dp_table.rs` is vendored third-party code under
the **Apache License 2.0**, and carries its own header. That header must be preserved —
redistributing this crate redistributes Apache-2.0 material. See
[docs/conventions/generated-tables.md](https://github.com/axross/espada/blob/main/docs/conventions/generated-tables.md).

This fork carries no `LICENSE.txt` of its own and declares no `license-file` or `license`
field in `Cargo.toml` — see
[docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md](../../../../docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md)
in the parent repository for why. The licence badge above, inherited unlinked from
upstream, still reads "non-standard": upstream's own `Cargo.toml` declares `license-file`
rather than an SPDX `license` expression, because the crate is not MIT alone.
