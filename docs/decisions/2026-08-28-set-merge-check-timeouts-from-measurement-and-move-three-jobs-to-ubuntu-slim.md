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

## The `ubuntu-slim` slowdown the projections rest on

`Docs Check`, `Relative Link Check`, and the three `changes` jobs moved to
`ubuntu-slim` in `2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md`, and their
durations there have been noticed in passing since. Against measured
`ubuntu-latest` maxima of 0:08, 0:09, and 0:07, what has been seen on slim
runs roughly two to three times longer.

That ratio is what the projections below use, and it is worth being exact
about its standing: **it comes from durations observed incidentally, not from
a measurement pass.** No sample was drawn over those five jobs, so this
record states a rough factor rather than a maximum, and a slim run above
anything seen so far would not contradict it — one already happened, with
`Docs Check` taking 0:32 while this change's own pull request was open.

All five are Node jobs doing little CPU work of their own, so a slowdown seen
on them is the **optimistic** end of the range for a job that actually
compiles or type-checks something — Expo `lint` and `typecheck`, and Rust
`lint`, all do. Applying a factor drawn from the lighter jobs to the heavier
ones is the weakest step in this change's reasoning, and doubling the result
before raising it to a rung is what absorbs it.

Because no `ubuntu-slim` duration exists for any of those three jobs, their
new `timeout-minutes` are **projections**, not measurements. Nothing in the
workflow files says so — the values carry no comment at all — which is why
this record does. A later pass replaces each with a measured value once the
job has run there enough times to have one; that pass is deliberately out of
scope here, the same way this one was left out of
`2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md`.

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

## The measured figures behind each value

This project's `timeout-minutes` derivation — the ladder, and how a value is
raised to a rung — is stated in `docs/conventions/continuous-integration.md`,
not here. What follows is the evidence behind the eleven values this change
sets, which that document deliberately does not carry and which no longer
lives in a workflow-file comment either.

| Job | Runner measured on | Sampled runs | Max |
| --- | --- | --- | --- |
| Expo `lint` | `ubuntu-latest` | 15 of 96 available | 0:55 |
| Expo `typecheck` | `ubuntu-latest` | 15 of 94 available | 1:02 |
| Expo `test` | `ubuntu-latest` | 15 of 88 available | 0:52 |
| Expo `e2e-coverage` | `ubuntu-latest`, before it moved to slim | 3 | 0:10 |
| Rust `lint` | `ubuntu-latest` | all 5 runs since the split | 0:49, cold cache |
| Rust `test` | `ubuntu-latest` | all 5 runs since the split | 1:38, cold cache |

Docs `docs`, Docs `links`, and the three `changes` jobs carry no measurement
pass of their own. Their durations on `ubuntu-slim` were only ever noticed
incidentally while checking CI on this branch's own runs — there is no
sample count to state for any of them, and no maximum this record stands
behind. Their `timeout-minutes` of 5 rests on the ladder's smallest rung
sitting far above every duration observed in passing, not on a
doubled-and-rounded measurement. That is the honest basis for the value, and
it is enough for a backstop; it is not a claim that these five jobs were
measured.

Three of the six measured rows above are projections, not direct
`ubuntu-slim` measurements: Expo `lint`, Expo `typecheck`, and Rust `lint`
have never run on `ubuntu-slim` at all, so each one's declared value is its
`ubuntu-latest` maximum above, doubled, projected onto the narrower runner at
the 3x factor [The `ubuntu-slim` slowdown the projections rest on](#the-ubuntu-slim-slowdown-the-projections-rest-on)
above uses, and raised to a rung — not a duration observed there. Expo
`e2e-coverage`'s 0:10 above is a genuine measurement, but it too predates the
job's move to `ubuntu-slim`; the job has not executed once since that move,
so no `ubuntu-slim` measurement exists for it either.

## The values snap to a fixed ladder

`timeout-minutes` in this repository takes one of five values — 5, 15, 30,
45, or 60 — and a derived figure is raised to the smallest rung that covers
it. The ladder is the maintainer's, not a result the measurement produced;
it exists so that a reader comparing two workflows is comparing intent
rather than arithmetic, and so that a value nobody has re-measured in a year
still looks like a decision rather than a leftover.

It costs precision, and the cost lands unevenly. Seven of the eleven jobs
keep the value they already carried, because the rung above their doubled
maximum is the rung they were already on: the three `changes` jobs and both
Rust jobs stay at 5, and Expo `lint` and `typecheck` stay at 15. Only four
values move, all of them from 15 to 5 — Expo `test`, Expo `e2e-coverage`,
`Docs Check`, and `Relative Link Check`. So the section above is accurate
about what the measurement found and about the pass covering all eleven
jobs, and it would overstate this change to read it as eleven corrected
numbers.

What every job does gain is the derivation. Each `timeout-minutes` now
carries a comment naming the maximum it was derived from, the runner that
maximum was measured on, how many runs were sampled, and — for the three
jobs whose slim duration is projected rather than measured — that the figure
is a projection. A value that did not move is still a value someone can now
check.

## What this does not change

Expo `test` and Rust `test` keep `runs-on: ubuntu-latest`. Neither has a
`ubuntu-slim` measurement, and neither needs one for this decision: both run
a test suite that parallelises across cores, which is reasoning independent
of any number a slim run would have produced. Every other job in the three
merge-check workflows — the three `changes` jobs, Expo `e2e-coverage`, `Docs
Check`, and `Relative Link Check` — keeps the runner
`2026-08-28-run-light-ci-jobs-on-ubuntu-slim.md` already gave it; only its
`timeout-minutes` was re-derived here.
