# ♠️ espada

Texas Hold'em poker odds evaluator, forked from
[`axross/espada`](https://github.com/axross/espada) and maintained in this repository.

espada scores a five-, six-, or seven-card holding into one comparable number —
the same power-index space regardless of how many cards are known — parses and
expands the range notation players already write, computes one card pair's exact
pairwise lead against an opponent's range on a given board, and walks every board
completion for a set of ranges exhaustively — from a river back to preflop.

One thing is worth knowing before reading any number it returns: **a lower power index
is a stronger hand.** `1` is the royal flush and `7462` the weakest high card, and the
categories `hand_type` returns are bands over that range.

- [`examples/`](./examples) — two runnable programs, single-threaded and multi-threaded
- [`../../README.md`](../../README.md) — the module this crate sits inside, and how its
  Rust, C++, and TypeScript fit together

## Install

Nothing installs this crate. It is `publish = false` and is reached only as a path
dependency of its sibling, declared in
[`../espada-engine/Cargo.toml`](../espada-engine/Cargo.toml):

```toml
espada-internal = { path = "../espada-internal" }
```

The package is `espada-internal` so it is never mistaken for the crates.io crate, but
its library target is named `espada`, so it is imported as `espada::…`.

## Usage

Walk every completion of a three-card board for two ranges, and print each player's
aggregate equity:

```rust
use espada::card::{Card, Rank, Suit};
use espada::evaluator::EquityEvaluator;
use espada::hand_range::HandRange;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let board = [
        Card::new(Rank::Queen, Suit::Spade),
        Card::new(Rank::Eight, Suit::Diamond),
        Card::new(Rank::Deuce, Suit::Heart),
    ];

    // `parse` is fallible: an empty string or an unparseable token is a
    // `ParseHandRangeError` rather than a panic.
    let players: Vec<HandRange> = vec!["JJ+".parse()?, "A2s+".parse()?];

    // So is construction: a board of the wrong size, a player count the sweep
    // does not implement, or a range with no live holding is an
    // `EquityEvaluatorError` rather than a panic.
    let evaluator = EquityEvaluator::postflop(&board, &players)?;

    let mut share = vec![0.0_f64; players.len()];
    let mut total = vec![0.0_f64; players.len()];

    for runout in &evaluator {
        for row in runout.players() {
            // `row.share() / row.total()` is this holding's own equity on this
            // runout. The holding's weight in its range belongs in the
            // aggregate and nowhere else — folding it into the ratio would
            // scale an equity by how often the range plays the hand, which is
            // not an equity at all.
            share[row.player_index()] += row.weight() * row.share();
            total[row.player_index()] += row.weight() * row.total();
        }
    }

    for (index, player) in players.iter().enumerate() {
        println!("{}: {:.2}%", player, share[index] / total[index] * 100.0);
    }

    Ok(())
}
```

`EquityEvaluator::postflop` takes a board of 3, 4, or 5 known cards;
`EquityEvaluator::preflop` takes none. Either way the walk yields one `Runout` per
complete five-card board, and a `Runout` carries one row per `(player, holding)` pair,
for every holding the board leaves live. Each row carries that holding's made hand and
four weights over the *opponents'* combinations: `win` is the weight it beats outright,
`tie` the weight it splits with at any multiplicity, `share` the exact pot-share
numerator, and `total` the weight of every opponent combination consistent with it after
card removal. A holding's equity on that runout is `share / total`; a player's aggregate
over the walk is `Σ weight·share / Σ weight·total`. `tie` is carried rather than left to
be recovered from `share − win`, which cannot tell a two-way split from a three-way one
of twice the weight.

`EquityEvaluator::partition(divisor, from, to)` cuts the walk's index space into
`divisor` contiguous blocks and returns an evaluator over blocks `from..to`. Partitions
of the same evaluator are disjoint and their union is the whole walk, which is how
[`examples/multi-thread`](./examples/multi-thread) parallelises without the evaluator
taking on threading. Boards are visited in a golden-ratio order rather than in board
order, so any prefix of a walk — a partition, or an unfinished one — is spread over the
whole board space rather than biased toward one corner of it.

Both programs under [`examples/`](./examples) are this same loop with a per-holding
breakdown and, in one of them, threads. **Their outputs are identical apart from the
`threads:` and `elapsed:` lines and one exception**: the two sum the same equities in
different associations — the multi-threaded one adds each thread's subtotal, the
single-threaded one adds every runout in walk order — so a figure sitting within an ULP
of the six-decimal rounding boundary the reporting uses can print one digit differently.
No input exhibiting one has been constructed.

## Toolchain

A stable Rust toolchain is all the crate needs. No minimum version is pinned, and
nothing here depends on a particular way of installing one; CI provisions it with
[`.github/actions/setup-rust`](../../../../.github/actions/setup-rust/action.yml),
which installs `stable`.

Two `cargo` subcommands are used by some commands below. Neither is declared in
`Cargo.toml`, because a subcommand is a binary installed into the toolchain rather than
a crate the library links against — the `insta` *library* is a dev-dependency, and only
its CLI is installed this way:

```sh
cargo install cargo-insta     # accepting snapshot changes
cargo install cargo-llvm-cov  # coverage
```

## Commands

The repository root's [`README.md`](../../../../README.md) is the authoritative record
of this project's commands, and its Testing checks table says which of the commands
below run in CI and which do not. The table here covers this crate's own `cargo`
workflow in full, the locally-only ones included. Run format + lint after every change,
and the checks relevant to the changed surface before opening a pull request.

Every command is written from the repository root with an explicit `--manifest-path`,
which is how CI runs them; drop that flag to run them from this directory instead.

| Command | What it does | When to run it |
| ------- | ------------ | -------------- |
| `cargo build --release --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Compiles the library optimized. | After changes to evaluation, ranges, or dependencies. |
| `cargo fmt --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Formats with rustfmt defaults. | After every set of edits, before committing. |
| `cargo fmt --check --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Reports formatting without rewriting. This is a CI gate. | To reproduce the CI gate locally. |
| `cargo clippy --all-targets --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml -- -D warnings` | Lints `src/`, tests, benches, and examples, failing on any warning. This is a CI gate. | After formatting; fix every finding before finishing. |
| `cargo test --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Runs the full suite, including the `insta` snapshot assertions. This is a CI gate. | After any change to Rust source. |
| `cargo test <name> --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Runs the tests whose name matches. | While iterating on one area. |
| `cargo insta test --review --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Runs the suite and opens each snapshot change for accept/reject. | When a change alters snapshotted output. Never hand-edit a `.snap`. |
| `cargo llvm-cov --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Runs the suite under coverage instrumentation. | When coverage itself is the question; `cargo test` covers the rest. |
| `cargo bench --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Runs the criterion benchmarks in [`benches/`](./benches). | After a change intended to affect evaluation throughput. |
| `cargo bench --no-run --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Compiles the benchmarks without running them. | To confirm a bench still builds, when timing is not the point. |
| `cargo run --release --example single-thread --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml -- Qs8d2h JJ+ A2s+` | Walks one board space on one thread and prints every holding's equity and each range's aggregate. The board is 3, 4, or 5 cards written back to back; leave it out entirely for a preflop walk. | To sanity-check end-to-end behaviour by hand. |
| `cargo run --release --example multi-thread --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml -- Qs8d2h JJ+ A2s+` | Runs the same walk cut into one `partition` per core, on the same arguments. Use `--release`; it is slow otherwise. | Same, and when `partition` behaviour is what changed. |
| `cargo doc --no-deps --open --manifest-path modules/espada-engine/lib/espada-internal/Cargo.toml` | Builds this crate's API documentation. | After changing a public signature or a doc comment. |

If a required command cannot be run, say so — naming the command, the reason, and the
residual risk — rather than presenting the change as fully verified.

## License

`src/evaluator/dp_table.rs` is vendored third-party code under the **Apache License
2.0**, © 2016–2024 Henry Lee, and carries its own header. That header must be preserved.

This fork carries no `LICENSE.txt` of its own and declares no `license-file` or `license`
field in `Cargo.toml` — see
[docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md](../../../../docs/decisions/2026-08-28-fork-espada-and-give-each-library-its-own-directory.md)
in the parent repository for why.
