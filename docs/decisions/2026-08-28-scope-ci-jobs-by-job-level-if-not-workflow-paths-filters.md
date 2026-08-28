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
