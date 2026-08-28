---
status: accepted
---

# Scope CI Jobs by Job-Level `if:`, Not Workflow-Level `paths:` Filters

Not every job `merge-checks.yaml` runs needs to run on every pull request and
push: a change confined to `e2e/flows/**` has no reason to run `cargo
clippy`, and a change confined to `modules/espada-engine/lib/` has no reason
to run the E2E scenario-coverage check. Skipping a job whose relevant input
did not change was wanted, without weakening the required-status-check gate
that blocks a merge to `main`.

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

A job skipped by a job-level `if:` behaves differently: the job still runs,
evaluates its `if:` to false, and completes reporting **Success** without
doing any work. A required check registered against a job (rather than
against the whole workflow) is satisfied by that Success, so a pull request
that touches nothing relevant to a given job still merges cleanly.

(Verified 2026-08-27 against both pages above.)

## The cost this accepts

The conditional logic now lives in one `changes` job and in every dependent
job's own `if:`, rather than in a single `on:` block. The `changes` job
itself carries no `if:` and must never resolve to an empty change set
silently: a false negative there would skip every dependent job while each
one still reports Success, which is indistinguishable, in a pull request's
checks list, from every one of them having actually run and passed.

This constrains any future workflow in this repository that wants to skip
work for an unaffected change, not only `merge-checks.yaml`'s own jobs
today: a workflow-level `paths:` filter is not an option a later change may
reach for, however convenient it looks for a new required check.

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
  false, the job is skipped by its own condition, and a job skipped by a
  conditional reports **Success** — landing in the exact same passing set as
  the ordinary `needs`-cascade skip the paragraph above already covers.
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
job is failing on purpose so the run is red rather than silently green, then
exits non-zero. Only after that check passes does the job go on to evaluate
the android/ios binary-guard outputs its normal path already used — a
`changes` failure means those outputs are untrustworthy, so the job must not
reach that logic at all when it has failed.

This makes `changes` failing outright produce a real `failure` conclusion on
a job, which is not in the passing set GitHub's own documentation quotes
above — so the run goes red and a merge is blocked by a status that actually
reflects what happened, rather than passing quietly.

## Standing recommendation for branch protection

Both failure modes above are closed from the workflow's own side. The same
hole can also be closed from the repository's branch-protection
configuration, by listing `changes` itself among the required status checks
for the default branch — a `changes` failure would then block the merge
directly, on its own status, independent of whether any dependent job also
happens to fail loudly. That configuration is the maintainer's to set, not
reachable from this workflow file, and is recorded here as a standing
recommendation rather than something this decision can itself carry out.
