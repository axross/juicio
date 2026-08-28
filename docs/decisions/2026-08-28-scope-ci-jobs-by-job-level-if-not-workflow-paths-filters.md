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
with `changes` failed every `if:`-gated job returned conclusion `skipped`.
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
re-run, not as a change that nothing checked. The
remedies below, and the guard in the next section, exist to put that second
fact somewhere a reader will see it. The obvious `if:` a dependent job might
add does not achieve even that.

[GitHub's own troubleshooting documentation for required status
checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
states:

> "Successful check statuses are `success`, `skipped`, and `neutral`."

and, in its table of causes:

> "A job depends on a failed job → The dependent job is skipped and may not
> block merging → Use `always()` with `needs` for required checks that depend
> on other jobs."

Three candidate remedies, of which only the third is what ships:

- Adding `if: ${{ !cancelled() && needs.changes.result == 'success' }}` to
  every dependent job does not help: when `changes` fails, that expression is
  false, the job is skipped by its own condition, and lands as **`skipped`** —
  the exact same non-failing conclusion as the ordinary `needs`-cascade skip
  the paragraph above already covers.
- `if: always()` on one job overrides the cascade, but at a cost paid on every
  cancellation rather than only on a failure. [GitHub's expressions
  reference](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)
  says `always()` "Causes the step to always execute, and returns `true`, even
  when canceled", and names the alternative outright: "If you want to run a job
  or step regardless of its success or failure, use the recommended
  alternative: `if: ${{ !cancelled() }}`". Since `merge-checks.yaml` sets
  `cancel-in-progress` on pull request refs, superseded runs are cancelled
  routinely; under `always()` the job runs on through the cancellation, reads
  `needs.changes.result` as `cancelled`, and turns an ordinary supersede into a
  red `failure` conclusion. A guard that cries wolf on every rebase is a guard
  the maintainer learns to ignore.
- `if: ${{ !cancelled() }}` on that one job is what ships. It still overrides
  the `needs` cascade when `changes` *fails* — the only case this override
  exists for — and stays out of the way when the run is cancelled, letting the
  job be cancelled with it.

Overriding the cascade is not by itself sufficient, whichever of the last two
is used: the job then runs with `changes`'s outputs undefined, so it must
check `needs.changes.result` explicitly rather than treat its own completion
as evidence that `changes` succeeded. The next section is that check.

(Verified 2026-08-28 against the troubleshooting page quoted above and the
expressions reference linked here.)

## What this project does about it

`change-detection` is a job of its own, whose one step checks
`needs.changes.result`: if it is anything other than `'success'`, the step
prints an `::error::` naming that `changes` did not succeed, that no merge
check ran against the change as a result, and that the job is failing on
purpose so the run carries an explained red conclusion instead of a set of
skipped checks that report nothing about the change, then exits non-zero. It
carries `if: ${{ !cancelled() }}` so that a `changes` failure reaches it at
all, per the section above.

It is a separate job rather than a first step on an existing one, and that
shape is load-bearing rather than tidiness. `merge-checks.yaml` runs exactly
one check per job precisely so a red entry names the tool that failed; what
this guard buys is entirely in what the checks list *communicates*, so a
guard failure filed under another check's display name argues against its own
message. Sharing `committed-binaries`'s job would have shown a red **"Guard
Committed Binaries"** for a change-detection failure, which reads as a
hand-edited binary — the opposite of what happened.

Keeping them apart also removes the ordering constraint the shared job
needed. `committed-binaries` now declares a plain `needs: changes` with no
job-level `if:`, so a `changes` failure skips it through the ordinary
cascade and it never reaches the android/ios binary-guard outputs with those
outputs untrustworthy.

Its one step, the binary guard proper, carries a condition of its own: it
runs on `pull_request` events only, and not when the head ref is one
`espada-engine-artifacts.yaml` generates.
Two legitimate binary landings are why. A push to `main` merging one of those
pull requests carries the binary paths in its own diff, so an unconditional
guard would go red on `main` telling the maintainer to redo the merge they
just made. And `espada-engine-artifacts.yaml` opens its pull request with the
default `GITHUB_TOKEN`, which triggers no workflow, so both that pull
request's own body and
[native-module-artifacts.md](../operations/native-module-artifacts.md)
tell the maintainer to push an empty commit or open a follow-up pull request
to get checks running on it — advice that, followed, is guaranteed to put
those paths in a pull-request diff. The head ref is matched against the exact
shape that workflow generates — the `add-espada-engine-binaries-` prefix
followed by a commit SHA's first twelve hex characters — rather than the
prefix alone, which narrows the branch a contributor could name into the
carve-out by accident.

Two costs are accepted. A hand-edited binary reaching `main` is not
re-flagged by the push run; it was already flagged on the pull request that
introduced it, which is where anyone could still act on it. And the carve-out
keys on a name the pull request's author chooses, so a branch named to fit
that shape on purpose still evades the guard — with a solo maintainer and no
branch protection, that is a self-inflicted wound rather than a threat model.

What this buys is worth stating exactly, because it is less than a first
reading suggests. It does not turn a green run red: `changes` failing has
already done that on its own. What it adds is a second red whose message
names what the first one does not — that no merge check ran against this
change, and that the change-detection outputs cannot be trusted. Without it
the maintainer reads one failed setup job and ten grey skips, a shape that
invites a re-run; with it, the list also says in words that nothing here
checked the change.

That is a smaller claim than "the run would otherwise pass quietly", which is
what this section said before [run 33139533872](https://github.com/axross/juicio/actions/runs/33139533872)
settled it. The guard is still worth its seconds — an unexplained red gets
retried, and a retry that succeeds looks like the problem went away — but it
is a guard on what the checks list communicates, not on whether it is red.

## The workflow side is the only side

Both failure modes above are closed from the workflow's own side, and that is
the only side there is: with no branch protection, `changes` cannot be listed
among a branch's required status checks, and no repository setting can turn
its failure into a blocked merge. The `change-detection` job is the whole
mechanism rather than a backstop to one, and the red it produces is addressed
to the maintainer reading the checks list.
