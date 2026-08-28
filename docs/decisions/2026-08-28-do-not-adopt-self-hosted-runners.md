---
status: accepted
---

# Do Not Adopt Self-Hosted GitHub Actions Runners

The maintainer holds a MacBook Pro (M1 Max) and a Windows 11 Pro desktop,
both already used for other work, and asked whether either could serve as a
self-hosted GitHub Actions runner — used only while powered on and
networked, and configured so as not to pollute the machine it runs on. This
record states what that investigation established and the decision it led
to: as of 2026-08-28, self-hosted runners are not adopted.

This extends
`2026-08-26-build-ios-on-paid-macos-runners-and-move-previews-to-manual-dispatch.md`
rather than superseding it. That record rejected a self-hosted Mac for two
reasons folded into one sentence: it "does not remove the cost, it only
moves it from a billing line to a machine someone has to provision, patch,
and keep available." The machines this investigation considered already
exist, so "provision" no longer applies — but "patch, and keep available" is
exactly what this investigation went on to examine in detail, and it still
holds. The 2026-08-26 record's own bytes are unchanged by this one.

## Availability: there is no fallback

GitHub has no native mechanism to fall back to a GitHub-hosted runner when a
self-hosted one is offline. Searching GitHub's own documentation and its
2025–2026 changelog turned up no such feature; the gap is filled only by
third-party actions such as
[`mikehardy/runner-fallback-action`](https://github.com/mikehardy/runner-fallback-action),
whose own description is to "determine the availability of self-hosted
runners, and fallback to a GitHub runner if the primary runners are
offline" — work GitHub itself does not do.

Without it, a job whose labels match no available runner "will remain
queued until the 24 hour timeout period expires"
(<https://docs.github.com/en/actions/reference/runners/self-hosted-runners>),
and the limits reference states the same ceiling as "A job can be in the
queue for 24 hours before it is automatically cancelled"
(<https://docs.github.com/en/actions/reference/limits>). Neither page
distinguishes "no runner registered with that label" from "a runner
registered but currently offline" — both fall under the same wording and
the same 24 hours.

Building the fallback by hand needs `GET /repos/{owner}/{repo}/actions/runners`,
which returns each runner's `status` and `busy` fields but states
"Authenticated users must have admin access to the repository to use this
endpoint" (<https://docs.github.com/en/rest/actions/self-hosted-runners>).
`GITHUB_TOKEN`'s `permissions` key has no `administration` scope to grant at
all — it is simply absent from the documented list
(<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions>).
So polling for availability needs a separate, repository-admin-scoped
personal access token stored as a repository secret, on top of everything
else this would add.

## The problem is smaller than it looks here

Every macOS job in this repository already lives in a `workflow_dispatch`-only
workflow: `ios-preview.yaml` and `espada-engine-artifacts.yaml` both declare
`on: workflow_dispatch` and nothing else. The person dispatching is the
person who owns the Mac, so a `workflow_dispatch` input choosing between a
self-hosted and a GitHub-hosted runner would settle availability with no
new secret and no polling — the runner picks itself because the maintainer
already knows, at dispatch time, whether their own machine is up.
GitHub documents exactly this shape: `runs-on: [self-hosted,
"${{ inputs.chosen-os }}"]`, driven by a `workflow_dispatch` choice input
(<https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow>).
This is the form a future reconsideration would take — see "When to reopen
this" below.

## Ephemeral runners do not restart themselves

Configuring a runner with `config.sh --ephemeral` makes GitHub assign it
exactly one job and then de-register it: "The GitHub Actions service will
then automatically de-register the runner after it has processed one job.
You can then create your own automation that wipes the runner after it has
been de-registered."
(<https://docs.github.com/en/actions/reference/runners/self-hosted-runners>)
Nothing restarts it afterward. GitHub's own recommended alternatives are
Actions Runner Controller, "the recommended Kubernetes-based solution for
autoscaling self-hosted runners" (same page) — Kubernetes only, not a shape
this repository has any other reason to run — or just-in-time runners
created through `POST /repos/{owner}/{repo}/actions/runners/generate-jitconfig`,
which needs the same admin-scoped access as the polling workaround above.

## `ios-preview.yaml` would damage a daily-driver Mac as it stands

Its `build` job's "Import Signing Certificate" step runs `security
list-keychains -d user -s` and `security default-keychain -d user -s`
against a throwaway keychain under `$RUNNER_TEMP`, and its "Install
Provisioning Profile" step writes into `$HOME/Library/MobileDevice/Provisioning
Profiles`. Reading the job start to finish confirms the workflow carries no
cleanup step for either — no `security delete-keychain`, no restoring the
previous default keychain, no profile removal, and no `if: always()`
teardown anywhere in the job. That is correct for a GitHub-hosted VM, which
is destroyed the moment the run ends. It is destructive on a machine that
keeps its home directory between runs: the default keychain silently
changes, and provisioning profiles accumulate. Any future adoption fixes
this first, or runs the job inside a disposable VM instead of directly on
the host.

## Two of this repository's own documented premises rest on the runner being GitHub's

Both live in `docs/conventions/security.md`.
Its per-job exposure model opens from "GitHub Actions isolates a job into
its own runner" — a property a persistent self-hosted runner does not carry
(an ephemeral one comes closer, but still shares the host machine's
filesystem and OS state across runs in a way a fresh cloud VM does not).
And its decision to leave `actions/*` unpinned rests on GitHub owning "both
the `actions/` organization and the GitHub-hosted runner that executes it" —
once the runner is not GitHub's, that argument no longer applies to it.
Neither premise is automatically wrong under self-hosting, but both would
need rewriting before a self-hosted runner ran a workflow that depends on
them.

## Isolation, and what it costs

Apple's own licence terms permit "up to two (2) additional copies or
instances of the Apple Software" running as virtual machines on one Mac, and
the limit is enforced by the Virtualization framework itself, in code, not
only by the licence text
(<https://eclecticlight.co/2022/08/04/virtualisation-on-apple-silicon-macs-8-how-apple-limits-vms/>).
[Tart](https://tart.run/) runs macOS guests on Apple Silicon and is free for
this use: "Usage on personal computers including personal workstations is
royalty-free" under Cirrus Labs' Fair Source License, with a paid licence
required only past a 100-CPU-core organizational threshold
(<https://tart.run/licensing/>) — far past anything one maintainer's laptop
could reach. A documented pattern exists for running an ephemeral GitHub
Actions runner inside a Tart VM.

The M1 Max cannot use any of this for isolation depth, though: nested
virtualisation on Apple Silicon needs an M3 or later chip on macOS 15,
reported consistently across Apple's own developer forums and third-party
trackers, including
[`lima-vm/lima#2824`](https://github.com/lima-vm/lima/issues/2824) — so a
macOS VM on this specific machine cannot itself run a container inside it,
which rules out isolating a job two layers deep on this hardware.

**This is inferred, not confirmed:** a dedicated macOS user account would
isolate `~/Library`, that account's keychain, and the `$HOME`-scoped caches
npm, Cargo, Gradle, and CocoaPods each keep — but not `/Applications`, the
shared Homebrew prefix, or any system-level daemon. This follows from how
macOS's own multi-user account model works; GitHub documents no
macOS-specific account-isolation guidance to check it against.

The Windows 11 Pro desktop has no use in this repository at all: there is
no Windows job here, and the Linux work it could in principle take is
already cheap on `ubuntu-slim`.

## Security posture

GitHub's own guidance is blunt: "Self-hosted runners should almost never be
used for public repositories on GitHub, because any user can open pull
requests against the repository and compromise the environment"
(<https://docs.github.com/en/actions/reference/security/secure-use>). This
repository is private, so that specific warning does not apply directly —
but one job in it would stay GitHub-hosted regardless. `claude-review.yaml`'s
`review` job runs `anthropics/claude-code-action` with a broad `Bash` in
`--allowedTools`, and its safety rests on checking out the base ref rather
than the pull request head — a mitigation written for a runner that is
destroyed after the run, which is exactly what a persistent self-hosted
runner is not.

## The cost premise is unstable

Self-hosted runner minutes are currently unbilled
(<https://docs.github.com/en/billing/concepts/product-billing/github-actions>),
but GitHub announced a $0.002/minute charge for them effective 2026-03-01
and then walked it back: "We're postponing the announced billing change for
self-hosted GitHub Actions to take time to re-evaluate our approach."
(<https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/>)
**This is inferred, not confirmed:** a postponement is not a withdrawal —
GitHub said it would re-evaluate its approach, not that it would not
proceed with some version of the charge. A decision to adopt self-hosted
runners purely to save money would be resting on a premise GitHub has
already stated an intent to revisit.

## What the saving would have been

Measured against this repository's own run history, at `macos-latest`'s
$0.062/minute rate
(<https://docs.github.com/en/billing/reference/actions-minute-multipliers>):
the `Compile` job in the now-retired `iOS Native Compile` workflow ran
14:49 and 18:05 across its two recorded runs, and the single `build`-shaped
job in the pre-restructure `iOS Preview` workflow ran 20:14. That puts one
macOS dispatch in this repository at roughly $0.90–$1.25. Both
`ios-preview.yaml` and `espada-engine-artifacts.yaml` are manual dispatches
only, so even generously used the total is a few dollars a month at current
usage — not the kind of spend that justifies the operational cost above on
its own.

## When to reopen this

Nothing here forecloses reconsidering self-hosted runners; it states why
they are not worth adopting today. Worth revisiting if any of the
following changes: the iOS dispatch rate rises enough that a few dollars a
month becomes a real budget line; `ios-preview.yaml` gains the keychain and
provisioning-profile cleanup this record found missing, for reasons of its
own; or the maintainer wants faster iOS builds rather than cheaper ones. A
local M1 Max is plausibly faster than a hosted `macos-latest` runner for
this project's build, but this investigation did not measure it, so that
stays a guess rather than a finding until someone times it.
