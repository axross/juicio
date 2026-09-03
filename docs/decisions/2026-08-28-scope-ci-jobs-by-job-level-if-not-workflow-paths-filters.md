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
the merge rather than allowing it. That page's own "How to fix or check"
column offers one remedy for the row: "Avoid requiring workflows that can be
skipped."

A job skipped by a job-level `if:` behaves differently: the run evaluates the
condition, the job does no work, and it reaches a **`skipped`** conclusion.
Two things GitHub writes about that case read as contradicting each other and
do not. [Its documentation on conditions that control job
execution](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-jobs-with-conditions)
says in prose that "A job that is skipped will report its status as
'Success.'" and that "It will not prevent a pull request from merging, even
if it is a required check". The troubleshooting page above instead names the
literal conclusions that count: "Successful check statuses are `success`,
`skipped`, and `neutral`." Neither is loose. "Reports Success" is GitHub's
shorthand for landing in that set of three, not a claim that the API's
`conclusion` field reads `success` — for this repository the field is settled
by its own [run
33139533872](https://github.com/axross/juicio/actions/runs/33139533872), where
with `changes` failed every job gated on a `changes` output returned
conclusion `skipped`. The one job in that run whose `if:` did not read such an
output — a since-removed binary guard carrying `if: ${{ always() }}`, so that
a failed `changes` could not skip it — ran and returned `failure` instead,
which is what that condition was there to produce.

What a person reading the checks list sees is neither word: the conditions
page states that too — "Skipped jobs display the message 'This check was
skipped.'" — a grey entry rather than a green tick. Either way the job
reaches a conclusion, so the run leaves behind a complete checks list rather
than a status nothing will ever resolve.

(Verified 2026-08-28 against both pages above.)

Neither documented behaviour is load-bearing in this repository: with no
required status checks configured, a `paths:`-skipped workflow leaves nothing
Pending and a job-level skip satisfies nothing. That hazard is one this
decision forecloses rather than one seen here. What binds the choice today is
where its consequences land — on a checks list a person reads to decide. A
workflow skipped by `paths:` puts nothing on that list at all; a run green
for reasons nobody intended puts something worse there. Both are routes to a
bad merge, and the rest of this record is about what this arrangement does,
and deliberately does not do, about the second.

## The cost this accepts

The conditional logic now lives in one `changes` job and in every dependent
job's own `if:`, rather than in a single `on:` block. The `changes` job
itself carries no `if:` and must never resolve to an empty change set
silently: a false negative there would skip every dependent job, and none of
those skips is a pass. They are not invisible either — seven grey "This check
was skipped" entries do not look like seven green ticks to anyone who reads
them one by one. What they look like is nothing in particular, which is the
real hazard: nothing on this repository obliges the maintainer to read that
list before merging, and a wall of grey is exactly the shape of result that
gets scrolled past. Nothing in the workflow makes that case loud; the next
section states why that is accepted.

A second, quieter cost is structural, and it is not fixed by writing better
filters. A filter can only name the files a check reads; some checks also
resolve things *outside* what they read, and a change to one of those is
invisible to the filter. `check-links.mjs` is the worked example: the `links`
job passes it `.claude`, `README.md`, `AGENTS.md`, and `REVIEW.md` as roots,
but the links inside those roots point at targets all over the repository, so
renaming a file under `docs/` can break a link in `AGENTS.md` without the
`links` filter matching anything. The filter is deliberately not widened —
`links` skipping on a `docs/`-only pull request is one of the approved
acceptance criteria this change was built to, and widening it to every path a
link could name is the whole repository. The class is what is worth naming:
**a check whose inputs include its links' targets can be skipped by a change
to a target alone.** Anything added to `merge-checks.yaml` later that resolves
outside its own filter paths carries the same gap, and the gap is accepted
rather than closed.

This constrains any future workflow in this repository that wants to skip
work for an unaffected change, not only `merge-checks.yaml`'s own jobs
today: a workflow-level `paths:` filter is not an option a later change may
reach for, however convenient it looks for a new job.

## A Second Failure Mode: `changes` Itself Failing

The paragraph above covers `changes` resolving to a wrong-but-successful
output set. `changes` outright failing — `dorny/paths-filter` erroring, the
checkout step failing, the job hitting its `timeout-minutes` — is a distinct
failure mode, and one worth stating precisely, because it is *not* a silent
pass. A failed `changes` is itself a red job, so the run is red whatever else
happens; nothing here rescues a run that would otherwise have gone green.

What the failure costs is narrower than that, and is about what the checks
list *says* rather than what colour it is. Every dependent job lands as
`skipped`, so not one entry reports on the change itself, and the only red is
`changes` itself — which reads as infrastructure that misfired and wants a
re-run, not as a change that nothing checked.

[GitHub's own troubleshooting documentation for required status
checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
states:

> "Successful check statuses are `success`, `skipped`, and `neutral`."

and, in its table of causes:

> "A job depends on a failed job → The dependent job is skipped and may not
> block merging → Use `always()` with `needs` for required checks that depend
> on other jobs."

Its remedy column addresses required status checks, of which this repository
has none, so nothing there applies here.

**This is an accepted property, not a guarded one.** Nothing in
`merge-checks.yaml` overrides the `needs` cascade to report the second fact,
and nothing is planned to. A failed `changes` is already a red job, so the run
is red either way; a guard would only add a second red carrying an explanatory
message, and that is not worth a job of its own. What a reader of this
repository's checks list should know is the behaviour itself: when `changes`
fails, the grey entries below it report nothing about the change, and the one
red entry does not say so in words.

(Verified 2026-08-28 against the troubleshooting page quoted above.)

## Every Job Is Gated the Same Way

There is no exception to the scheme above left in `merge-checks.yaml`: every
job but `changes` itself declares `needs: changes` and an `if:` reading one
of that job's boolean outputs, and none carries a condition of its own on top
of it.

That was not always so. A `committed-binaries` job declared a plain
`needs: changes` with no job-level `if:`, and carried its guard condition on
its own step instead — `pull_request` events only, and not when the head ref
matched the `add-espada-engine-binaries-<12 hex characters>` shape
`espada-engine-artifacts.yaml` used to generate back when it opened a new
pull request of its own for the commit; it now commits onto the pull
request's own existing branch instead, so it generates no branch name at
all. That job has been removed, along
with `nitrogen-drift` and `abi-parity`; nothing replaced any of them, and
[README.md](../../README.md)'s Testing section states what each one covered.
The head-ref carve-out went with it, so no branch name in this repository is
load-bearing any more.

## The workflow side is the only side

Whatever this repository does about either failure mode above, it does from
the workflow's own side, because that is the only side there is: with no
branch protection, `changes` cannot be listed among a branch's required
status checks, and no repository setting can turn its failure into a blocked
merge. So the second failure mode has no repository-side mitigation available
either, which is part of why it is accepted rather than guarded: everything
this arrangement produces is addressed to the maintainer reading the checks
list, and nothing else acts on it.
