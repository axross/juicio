---
status: accepted
---

# Split Merge Checks Into Three Domain Workflows

`merge-checks.yaml` ran eight jobs in one file — `changes`, `lint`,
`typecheck`, `test`, `e2e-coverage`, `docs`, `links`, and `rust-checks` — so a
failure anywhere in the file read as one undifferentiated CI result until
someone opened the run. It is replaced by three workflows, each scoped to one
domain and each carrying its own `changes` job: `expo-merge-checks.yaml`
(`changes`, `lint`, `typecheck`, `test`, `e2e-coverage`), `rust-merge-checks.yaml`
(`changes`, `lint`, `test`), and `docs-merge-checks.yaml` (`changes`, `docs`,
`links`). The single former `rust-checks` job is also split, into
`rust-merge-checks.yaml`'s own `lint` and `test` jobs, with distinct
`cache-key-prefix` values (`cargo-rust-lint` and `cargo-rust-test`) so the two
do not race to write one shared Cargo cache entry from a cold parallel start.

## What does not change

`2026-08-28-scope-ci-jobs-by-job-level-if-not-workflow-paths-filters.md` is
**not** superseded. The job-level `if:` scheme it records continues exactly
as that record describes it, now replicated once per workflow rather than
once per repository: each of the three files runs its own `dorny/paths-filter`
step in its own `changes` job, and every other job in that file declares
`needs: changes` and an `if:` reading one of that job's boolean outputs. No
workflow in this repository's `.github/workflows/` carries a `paths:` or
`paths-ignore:` filter on its own `on:` block, before or after this split.

## The prohibition, re-examined

The maintainer asked for that prohibition — no workflow-level `paths:` filter
— to be re-examined against the three-workflow shape rather than carried
forward by default. It survives, on the grounds below, but the split
genuinely changes two things the earlier record argued from.

**What weakens.** That record's own binding reason was that a `paths:`-skipped
workflow "puts nothing on that list at all", where "that list" is the pull
request's checks list the maintainer reads to decide whether to merge. That
argument is weaker now than it was against one file. A single `merge-checks.yaml`
gated by `paths:` was all-or-nothing: a docs-only pull request would either run
every job or leave the checks list empty, indistinguishable at a glance from
broken CI. Against three domain-named workflows, a docs-only pull request
would instead show Docs Merge Checks green and Expo Merge Checks and Rust
Merge Checks simply absent — and an absent workflow, named for a domain the
change did not touch, reads as far more legible than an empty list did.
`paths:` would also delete the `changes` job entirely wherever it was adopted,
and with it the whole `changes`-failure mode that record devotes a section to
accepting: nothing to fail loudly, nothing to land every dependent job as
`skipped`. Both of these are real arguments for `paths:`, not swept aside
here, and the rest of this record is why they still lose.

## Why the prohibition survives anyway

Four grounds, two of which the earlier record did not have.

1. **A documented silent no-run above 300 files, which the earlier record
   never considered.** GitHub's own troubleshooting reference states, for
   path filtering: "evaluating diffs is limited to the first 300 files. If
   there are files changed that are not matched in the first 300 files
   returned by the filter, the workflow will not be run."
   (<https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>) That
   is a silent false negative: no run, no checks-list entry, no signal that
   anything was skipped at all. `dorny/paths-filter` does not carry this
   limit for a pull-request event — it fetches the changed-file list from the
   GitHub REST API instead of diffing locally. This repository's largest
   merged change to date touched 196 files: under the 300-file cap, but two
   thirds of the way to it, and nothing here caps how large a future change
   grows.
2. **The filters do not cover the repository.** The union of every filter
   across all three workflows' `changes` jobs still leaves `.github/**`,
   `app.json`, `assets/**`, `modules/espada-engine/lib/bridge/**`, and
   `modules/espada-engine/`'s committed binaries and generated bindings
   matching nothing. One of the last 40 merged changes touched only such
   unmatched paths, and it was a change to a workflow file. Under `paths:`,
   whichever workflow that change's own `paths:` filter named would not have
   run at all — and under three separate `paths:` filters, none of the three
   would have.
3. **A shape worse than an empty checks list, which the earlier record also
   never considered.** A pull request that rewrites this repository's CI
   while incidentally editing documentation matches only the `docs` and
   `links` filters — under `paths:`, such a pull request would be checked
   only by Docs Merge Checks, going green on a run that examined none of the
   CI change itself. The pull request that delivers this very split is
   exactly that shape: it rewrites three workflow files and edits several
   documents in the same change. An empty checks list reads as anomalous to
   anyone who looks; one merge-check workflow going green does not.
4. **GitHub's own remedy points at the arrangement this repository already
   has.** The troubleshooting reference's row for path filtering names its
   fix as "Avoid requiring workflows that can be skipped"
   (<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/troubleshooting-required-status-checks>),
   and the page's contrasting row is the job-level conditional, whose skipped
   job reports success rather than staying Pending. That is the job-level
   `if:` scheme this repository already uses, replicated per workflow by this
   split rather than replaced by it.

The earlier record's own first ground — a required status check belonging to
a `paths:`-skipped workflow staying Pending forever — is not revived by this
split, but it is not dead either; it stays dormant, the same way the earlier
record left it. Classic branch protection and rulesets share one eligibility
line, and both need GitHub Pro on a private repository
(<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches>,
<https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets>),
so neither is configurable on this repository today. That is a plan-tier
limit, not a technical impossibility, and it can change without this
repository doing anything at all — an upgrade, a GitHub pricing change, a
transfer to an organization on a different plan. Adopting `paths:` now would
make "this repository will never require a status check" a load-bearing
assumption behind a CI arrangement meant to outlast today's plan, rather than
an incidental fact about it.

## The cost this accepts

Three `changes` jobs run per pull request now instead of one — three
`dorny/paths-filter` invocations where a single shared job, or a `workflow_call`
reused across the three files, would need only one. Each runs on `ubuntu-slim`
and each is measured in seconds, so the added job-minutes are small, but the
cost is real and accepted rather than engineered away: keeping the three
workflows independent, so a superseded Rust run does not cancel an in-flight
Expo run and so each workflow's own concurrency group is scoped by
`github.workflow` alone, was judged worth three small jobs instead of one.
