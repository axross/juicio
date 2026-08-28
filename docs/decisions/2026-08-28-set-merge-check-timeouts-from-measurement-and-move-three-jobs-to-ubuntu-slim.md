---
status: accepted
---

# Set Merge-Check Timeouts from Measurement, and Move Three Jobs to `ubuntu-slim`

Expo `lint`, Expo `typecheck`, and Rust `lint` now declare `runs-on:
ubuntu-slim`. Expo `test` and Rust `test` stay on `ubuntu-latest`,
deliberately: both run a test suite — Jest for Expo, `cargo test` for Rust —
and a test suite parallelises its work across cores, which is exactly where a
1 vCPU runner costs the most. A lint or a type-check does not parallelise the
same way, so the three moved jobs lose less to the narrower runner than the
two held back would.

Every `timeout-minutes` in `expo-merge-checks.yaml`, `rust-merge-checks.yaml`,
and `docs-merge-checks.yaml` was also re-derived from measured run history,
covering all eleven jobs across the three files rather than only the five
this change set out to touch. See
[Why All Eleven, Not Five](#why-all-eleven-not-five) below for why the scope
widened.

## This extends, not supersedes

`2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md` moved seven sub-minute jobs
to `ubuntu-slim` and left five compile-bearing jobs — Expo `lint`,
`typecheck`, and `test`, and Rust `lint` and `test` — on `ubuntu-latest`,
explicitly pending measurement against the narrower runner. This record does
not replace that one; it is the measurement arriving. That record's own
reasoning for the seven jobs it moved, and for why the five stayed put at the
time, still holds and is not restated here.

## The trade, stated plainly

Moving three jobs to `ubuntu-slim` saves roughly **$0.50 a month** in Actions
billing. Against that: wall-clock on a pull request touching `src/**` rises
from about one minute to about two, since Expo `lint` and `typecheck` roughly
double while Expo `test` does not; a pull request touching
`modules/espada-engine/lib/**` rises similarly for Rust `lint` while Rust
`test` is unchanged. This is not a cost win — it is a small saving bought
with a real, if bounded, latency cost, and it is recorded as such rather than
presented as free.

That is a different shape of trade than the one `2026-08-28-run-light-ci-jobs-
on-ubuntu-slim.md` made. The seven jobs it moved finish in seconds on either
runner, so nobody waits longer for them regardless of which one they land
on — the saving there cost nothing. Three of the five jobs this change moves
are the ones that do the most work of any merge-check job in this
repository, so their wall-clock is the one place a `ubuntu-slim` move was
never going to be free. The maintainer chose to move them anyway, with the
cost above stated rather than left implicit.

## The measured `ubuntu-slim` slowdown

The projections below rest on the slowdown measured on the jobs
`2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md` already moved: `Docs Check`
went from a 0:08 measured maximum on `ubuntu-latest` to 0:17–0:23 on
`ubuntu-slim`; `Relative Link Check` went from 0:09 to 0:20–0:26; each
workflow's `changes` job went from 0:07 to 0:09–0:14. All three are Node jobs
doing little CPU work of their own, so a slowdown measured on them is the
**optimistic** end of the range for a job that actually compiles or
type-checks something — Expo `lint` and `typecheck`, and Rust `lint`, all do.

Because no `ubuntu-slim` sample exists yet for any of those three jobs, their
new `timeout-minutes` in the workflow files are **projections**, not
measurements, and each carries a comment saying so. A later pass replaces
each with a measured value once the job has run on `ubuntu-slim` enough times
to have one; that pass is deliberately out of scope here, the same way this
one was left out of `2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md`.

## Two facts the measurement established

**A cold Cargo cache costs roughly double.** Rust `lint` measured a 0:49
maximum with a cold cache, against 0:14–0:25 warm; Rust `test` measured 1:38
cold against 0:52–1:00 warm. A timeout sized only for the warm case would be
undersized every time either crate's `Cargo.lock` changes.

**A push to the default branch cannot restore a cache a pull request branch
wrote.** GitHub scopes a cache to the branch that wrote it, so a run on
`main` can only restore from `main`'s own cache scope — the first run on
`main` after a cache key changes is effectively cold there too, regardless of
how warm the pull request's own branch was. The merge of #50 measured Rust
`lint` and `test` between the cold and warm cases above, which is consistent
with this: the push landed on a cache scope neither fully cold nor
already warm from repeated runs on `main` itself. The practical consequence
is that the cold case recurs on two branches, `main` included, rather than
only on whichever branch first changes a lockfile.

## Why all eleven, not five

This change was opened to re-derive `timeout-minutes` for the two Rust jobs
and to decide whether to move all five compile-bearing jobs to
`ubuntu-slim`. The measurement it gathered showed a third problem neither of
those two questions anticipated: the four jobs still carrying a
`timeout-minutes` of `15` from before the earlier split, and the three
`changes` jobs still carrying `5`, were between 15x and 90x their own
measured maxima — an order of magnitude looser than either Rust job, whose
existing value of `5` was at most 6x its measured maximum. The two jobs this
change was opened about turned out to be the best-sized ones already; what
needed correcting was everything else. The timeout pass was widened to cover
all eleven jobs in the three merge-check workflows once the measurement made
that visible, rather than re-deriving two values and leaving nine others
known to be loose.

## What this does not change

Expo `test` and Rust `test` keep `runs-on: ubuntu-latest`. Neither has a
`ubuntu-slim` measurement, and neither needs one for this decision: both run
a test suite that parallelises across cores, which is reasoning independent
of any number a slim run would have produced. Every other job in the three
merge-check workflows — the three `changes` jobs, Expo `e2e-coverage`, `Docs
Check`, and `Relative Link Check` — keeps the runner
`2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md` already gave it; only its
`timeout-minutes` was re-derived here.
