# Provenance of `espada-internal`

This directory is a **verbatim copy** of [`axross/espada`](https://github.com/axross/espada).
It is not maintained here. Do not edit the copied files — not to fix a defect, not to
satisfy a lint, not to remove code this project does not call. A change to the evaluator
belongs upstream; a change to how this project uses it belongs in `../espada-engine/`.

That is the whole reason the two are separate crates: it keeps this directory diffable
against upstream, so refreshing it is a re-copy rather than a merge.

## Source

| | |
| --- | --- |
| Repository | `axross/espada` |
| Branch | `main` |
| Commit | `26593b3` |
| Version | 0.5.2 |
| Copied on | 2026-08-27 |

## What was copied

`src/`, `tests/` and `LICENSE.txt`, byte for byte. `src/` includes the 13 `insta` snapshot
fixtures under `src/**/snapshots/`, which the copied inline `#[cfg(test)]` modules assert
against.

## What was not copied, and why

- **`benches/`** — needs `criterion`, which pulls `clap`, `crossbeam` and `plotters` into
  this repository's dependency graph to benchmark code this project does not yet call.
- **`examples/`** — needs `num_cpus`, uses `std::thread::spawn`, and documents the upstream
  crate rather than forming part of its library surface.
- **Upstream's `Cargo.toml`** — replaced by one authored here, because the package is
  renamed to `espada-internal` and the two dev-dependencies above are dropped. Its `[lib]
  name` keeps upstream's `espada`, so no copied source or fixture needed changing.
- **Upstream's `Cargo.lock`, `README.md` and repository tooling** — not part of the library.

## Licences — there are two

The crate is **MIT**, © 2024 Kohei Asai (`LICENSE.txt`).

`src/evaluator/dp_table.rs` is **not**. It is third-party code under the **Apache License
2.0**, © 2016–2024 Henry Lee, and carries its own header at the top of the file. That
header must be preserved: redistributing this directory redistributes Apache-2.0 material,
and `LICENSE.txt` alone does not describe it.

## Refreshing this copy

```
git -C <espada-checkout> archive <commit> src tests LICENSE.txt \
  | tar -x -C modules/espada-engine/lib/espada-internal/
```

Then update the table above. `Cargo.toml` and this file are the only two files here that a
refresh must not overwrite.

## Known-defect status

The proof of concept this module descends from used crates.io `espada` 0.3.1 and reported
two defects in it. Both are fixed at the commit above, verified against the source rather
than taken from release notes:

- A hand range past 255 card pairs was silently truncated. `FlopExhaustiveEvaluator`'s
  `current_player_indexes` is now `Vec<usize>` and no `as u8` cast remains in
  `src/evaluator/flop_exhaustive.rs`.
- `HandRange::from_str` returned an empty range for nonsense input. It now has
  `type Err = ParseHandRangeError`, with `Empty` and `InvalidToken(String)` variants, and
  propagates a token failure rather than dropping it.
