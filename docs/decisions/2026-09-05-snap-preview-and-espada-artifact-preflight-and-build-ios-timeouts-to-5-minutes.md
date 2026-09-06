---
status: accepted
---

# Snap Preview and Espada-Artifact Preflight and Build-iOS Timeouts to 5 Minutes

`android-preview.yaml`'s `Preflight` job, `ios-preview.yaml`'s `Preflight`
job, and `espada-engine-artifacts.yaml`'s `Build iOS (.xcframework)` job now
declare `timeout-minutes: 5`. Each previously carried a comment justifying its
value as an unmeasured guess — "generous for what this job does, not a
measured ceiling" on the two `Preflight` jobs, "no run of this job has
completed yet to measure against" on `Build iOS (.xcframework)`. Actual run
history contradicts both claims: all three jobs have now completed many
times, and every one of them finishes in under a minute and a half.

## The measured figures behind each value

This project's `timeout-minutes` derivation — the ladder, and how a value is
raised to a rung — is stated in `docs/conventions/continuous-integration.md`,
not here. What follows is the evidence behind the three values this change
sets, which that document deliberately does not carry and which no longer
lives in a workflow-file comment either.

| Job | Runner measured on | Sampled runs | Max |
| --- | --- | --- | --- |
| `android-preview.yaml` `Preflight` | `ubuntu-slim` | 15 of 78 available | 1:16 |
| `ios-preview.yaml` `Preflight` | `ubuntu-slim` | 4 of 6 available | 0:52 |
| `espada-engine-artifacts.yaml` `Build iOS (.xcframework)` | `macos-latest` | 15 of 19 available | 1:27 |

Doubled, the three maxima are 2:32, 1:44, and 2:54 — all comfortably under
the ladder's smallest rung, 5 minutes, which is what each job now declares.

`ios-preview.yaml`'s sample excludes its two oldest completed runs. Those ran
against an earlier, three-job version of the workflow whose `Preflight` step
did nothing this one does — no checkout, no dependency setup, just a few
seconds of work — so they measure a different job than the one this change
edits, not a slower or faster instance of it.

## What this does not change

No other job's `timeout-minutes` moves. `android-preview.yaml`'s `prebuild`,
`build`, and `publish` jobs, `ios-preview.yaml`'s `prebuild`, `build`, and
`publish` jobs, and every other job in `espada-engine-artifacts.yaml` —
including its own `preflight`, which already conforms and already carries its
own derivation note — keep the values and comments they already had. Each
carries its own "not yet measured" or "estimated" disclaimer describing a
job this change does not touch, and none of that is corrected here.
