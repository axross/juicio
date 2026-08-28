---
status: accepted
---

# Scope CI Jobs by Job-Level `if:`, Not Workflow-Level `paths:` Filters

Not every job `merge-checks.yaml` runs needs to run on every pull request and
push: a change confined to `e2e/flows/**` has no reason to run `cargo
clippy`, and a change confined to `modules/espada-engine/lib/` has no reason
to run the E2E scenario-coverage check. Skipping a job whose relevant input
did not change was wanted, without damaging what the pull request's checks
list is worth as a record of what was actually checked.

Nothing in this repository blocks a merge mechanically. It is a personal
private repository, where branch protection is not available; the maintainer
has confirmed it will not be configured, so no status check is required and
no run is a precondition for anything. What CI produces here is the pull
request's checks list, and the maintainer reads it to decide whether to
merge.

## What this project does

Every job in `merge-checks.yaml` that is not always relevant declares
`needs: changes` and an `if:` expression reading one boolean output of a
single `changes` job, which runs `dorny/paths-filter` once per workflow run
and emits one output per filter. No workflow under this repository's
`.github/workflows/` uses `on:`'s own `paths:` (or `paths-ignore:`) key to
skip an entire run.

## Why, and what was rejected

**A workflow-level `paths:` filter on `on:`**, the more obvious mechanism,
was rejected. [GitHub's own troubleshooting documentation for required
status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
states that when a workflow is skipped by a `paths:` filter, its required
status checks stay **Pending indefinitely** on the pull request that
skipped it — the run that would satisfy them never happens — which blocks
the merge rather than allowing it. [GitHub's own documentation on
conditions that control job execution](https://docs.github.com/en/actions/using-jobs/using-conditions-to-control-job-execution)
draws the same distinction and recommends avoiding a required check that a
trigger filter can skip.

A job skipped by a job-level `if:` behaves differently: the run evaluates the
condition, the job does no work, and it reaches a **`skipped`** conclusion.
The first page above lists `skipped` among the statuses GitHub treats as
successful — "Successful check statuses are `success`, `skipped`, and
`neutral`" — while its own table of causes puts the same case more loosely,
as a job that "reports Success". Which of the two is literally true here is
settled by this repository's own [run
33139533872](https://github.com/axross/juicio/actions/runs/33139533872): with
`changes` failed, every `if:`-gated job returned conclusion `skipped`, and a
skipped check renders as its own grey "This check was skipped" rather than as
a green tick. Either way the job reaches a conclusion, so the run leaves
behind a complete checks list rather than a status nothing will ever resolve.

(Verified 2026-08-27 against both pages above.)

Neither documented behaviour is load-bearing in this repository: with no
required status checks configured, a `paths:`-skipped workflow leaves nothing
Pending and a job-level skip satisfies nothing. That hazard is one this
decision forecloses rather than one seen here. What binds the choice today is
where its consequences land — on a checks list a person reads to decide. A
workflow skipped by `paths:` puts nothing on that list at all; a run green
for reasons nobody intended puts something worse there. Both are routes to a
bad merge, and the rest of this record is about closing the second.

## The cost this accepts

The conditional logic now lives in one `changes` job and in every dependent
job's own `if:`, rather than in a single `on:` block. The `changes` job
itself carries no `if:` and must never resolve to an empty change set
silently: a false negative there would skip every dependent job, and none of
those skips is a pass. They are not invisible either — nine grey "This check
was skipped" entries do not look like nine green ticks to anyone who reads
them one by one. What they look like is nothing in particular, which is the
real hazard: nothing on this repository obliges the maintainer to read that
list before merging, and a wall of grey is exactly the shape of result that
gets scrolled past. The guard below is there to make that case loud, not to
make it visible.

This constrains any future workflow in this repository that wants to skip
work for an unaffected change, not only `merge-checks.yaml`'s own jobs
today: a workflow-level `paths:` filter is not an option a later change may
reach for, however convenient it looks for a new job.

## A Second Failure Mode: `changes` Itself Failing

The paragraph above covers `changes` resolving to a wrong-but-successful
output set. `changes` outright failing — `dorny/paths-filter` erroring, the
checkout step failing, the job hitting its `timeout-minutes` — is a distinct
failure mode with the same silent-pass shape, and it is not fixed by the
obvious `if:` a dependent job might add.

[GitHub's own troubleshooting documentation for required status
checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
states:

> "Successful check statuses are `success`, `skipped`, and `neutral`."

and, in its table of causes:

> "A job depends on a failed job → The dependent job is skipped and may not
> block merging → Use `always()` with `needs` for required checks that depend
> on other jobs."

Two remedies look obvious and neither works:

- Adding `if: ${{ !cancelled() && needs.changes.result == 'success' }}` to
  every dependent job does not help: when `changes` fails, that expression is
  false, the job is skipped by its own condition, and lands as **`skipped`** —
  the exact same non-failing conclusion as the ordinary `needs`-cascade skip
  the paragraph above already covers.
- `if: always()` alone does not help either: the job then runs with
  `changes`'s outputs undefined, and its result is incidental to whether
  `changes` actually succeeded.

(Verified 2026-08-28 against the page quoted above.)

## What this project does about it

`committed-binaries` — the one job that already runs unconditionally on the
normal path (see the section above) — carries `if: ${{ always() }}` and, as
its first step, checks `needs.changes.result` itself: if it is anything other
than `'success'`, the step prints an `::error::` naming that `changes` did not
succeed, that no merge check ran against the change as a result, and that the
job is failing on purpose so the run carries an explained red conclusion
instead of a set of skipped checks that report nothing about the change, then
exits non-zero. Only after that check passes does the job go on to evaluate
the android/ios binary-guard outputs its normal path already used — a
`changes` failure means those outputs are untrustworthy, so the job must not
reach that logic at all when it has failed.

This makes `changes` failing outright produce a real `failure` conclusion on
a job, which is not in the passing set GitHub's own documentation quotes
above — so the run goes red in the checks list the maintainer reads, rather
than passing quietly.

## The workflow side is the only side

Both failure modes above are closed from the workflow's own side, and that is
the only side there is: with no branch protection, `changes` cannot be listed
among a branch's required status checks, and no repository setting can turn
its failure into a blocked merge. The guard on `committed-binaries` is the
whole mechanism rather than a backstop to one, and the red it produces is
addressed to the maintainer reading the checks list.
