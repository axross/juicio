---
status: accepted
---

# Run the Light CI Jobs on `ubuntu-slim`

Seven jobs across four workflows now declare `runs-on: ubuntu-slim` instead
of `ubuntu-latest`: all three `changes` jobs (one per merge-check workflow),
`docs` and `links` in `docs-merge-checks.yaml`, `e2e-coverage` in
`expo-merge-checks.yaml`, both preview pipelines' `preflight` job
(`android-preview.yaml`, `ios-preview.yaml`), and `open-pull-request` in
`espada-engine-artifacts.yaml`. Every one of them runs only Node built-ins,
bash, or a JavaScript action, with a measured maximum wall clock of 20
seconds or less against this repository's own run history.

Deliberately left on `ubuntu-latest`: `expo-merge-checks.yaml`'s `lint`,
`typecheck`, and `test` jobs, and `rust-merge-checks.yaml`'s `lint` and
`test` jobs. All five compile or run a real toolchain — `npm ci`, the
TypeScript compiler, Jest, or Cargo — rather than a handful of scripted
checks, and none has been measured against `ubuntu-slim`'s narrower CPU and
memory budget yet. `espada-engine-artifacts.yaml`'s other jobs
(`build-android`, `build-ios`, `generate-bindings`, `verify-android`,
`verify-ios`) are untouched by this change for the same reason, and
`build-ios` and `verify-ios` also need a macOS runner, which `ubuntu-slim`
cannot provide regardless.

## Why `ubuntu-slim`

`ubuntu-slim` is a 1 vCPU / 5 GB container runner billed at $0.002/minute,
against $0.006/minute for the standard `ubuntu-latest` Linux runner on a
private repository, with a hard 15-minute job ceiling that `timeout-minutes`
cannot raise
(<https://docs.github.com/en/actions/reference/runners/github-hosted-runners>,
<https://docs.github.com/en/billing/reference/actions-minute-multipliers>).
GitHub Actions bills a job's minutes rounded up to the next whole minute, so
a job that finishes in 8 seconds still costs a full billed minute on either
runner — which is exactly why the saving lives in the per-minute rate on the
sub-minute jobs, not in shortening any of them. Every job moved here already
finished in under 20 seconds on `ubuntu-latest`, so the 15-minute ceiling is
not a live constraint for any of them today.

## The saving is small, and cost is not the point

Seven jobs moving from $0.006/minute to $0.002/minute, each billed for one
minute regardless of runner, saves at most a few cents of Actions billing per
pull request. That is the whole of the saving; nothing about this change
makes any job run faster; a job's own wall clock does not change, only its
per-minute rate does. What justifies moving these seven rather than any
other job is legibility, not cost: doing so is consistent with reserving the
compute-heavier runner for jobs that plausibly need it, and it is the
smallest change that puts every job whose own work is trivial on the cheaper
runner, rather than something the arithmetic above compels on its own. The
Rust and Expo compile-bearing jobs stay on `ubuntu-latest` pending
measurement precisely because their cost, unlike these seven jobs', might
turn out to matter.

## A known `ubuntu-slim` cost with `actions/setup-node`

`actions/setup-node` has an open upstream issue where requesting a bare major
version — this project's `engines.node: "24"` is exactly that shape —
downloads Node fresh on `ubuntu-slim` rather than using the image's own
pre-cached copy, while the identical request on `ubuntu-latest` uses the
cache
(<https://github.com/actions/setup-node/issues/1492>). This costs the
download time, on the order of seconds, and does not fail the job.
`./.github/actions/setup-node` resolves its Node version from
`node-version-file: package.json`, which is exactly this project's bare
`"24"`, so every job that calls it hits this on `ubuntu-slim` regardless of
whether it also passes `install: true`. Five of the seven jobs moved here do
call it — `docs`, `links`, `e2e-coverage`, and both preview pipelines'
`preflight` — and each absorbs the extra download seconds. `changes` and
`open-pull-request` never call `setup-node` at all, so they are unaffected
for that reason alone. This is recorded here so a future slowdown on one of
these five is checked against a known cause before it is treated as a new
one.
