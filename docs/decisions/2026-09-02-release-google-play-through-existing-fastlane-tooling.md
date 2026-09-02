---
status: accepted
---

# Release to Google Play Through This Repository's Existing Fastlane Tooling

Issue #120 asked for a pipeline that builds a signed Android release and
uploads it to Google Play's internal testing track. Two questions had more
than one reasonable answer: what reaches Google Play at all, and where the
version code baked into each upload comes from.

## Reaching Google Play Through Fastlane, Not a Hosted Service

`android-release.yaml` reaches Google Play the same way this repository's two
preview pipelines already reach Firebase App Distribution: GitHub Actions
driving this repository's own fastlane setup (`fastlane/Fastfile`), with
fastlane's first-party `google_play_track_version_codes` and
`upload_to_play_store` actions doing the actual API work. No new build or
submit service was adopted to do it.

This reinforces a decision already recorded, rather than opening it again:
[operations/agent-skills.md's EAS deviation entry](../operations/agent-skills.md)
states plainly that this project does not use EAS in any form — no EAS
Build, Submit, Update, or Workflows — which rules out the vendor path most
Expo projects take to Google Play. Building this pipeline any other way would
have overturned that decision rather than implemented this issue.

A hosted build-and-submit service in general — not only EAS specifically —
was rejected for the same reason: it is the path with the least machinery
(remote credential storage, a server-side version counter, one command), but
adopting one here still means adopting a vendor pipeline this project has
already decided against.

A third-party GitHub Action for the Google Play upload was rejected too, on a
narrower ground. `android-release.yaml`'s `version-code` and `publish` jobs
each hold the Play service-account key; `build` holds the release keystore.
[conventions/security.md](../conventions/security.md) treats a job holding a
signing key or a distribution credential as the highest-exposure position a
third-party action can occupy, and placing one there would have required
pinning it to a full commit SHA and adding a new row to that document's
exposure table for no capability fastlane's own first-party actions do not
already provide from inside this repository's existing tooling.

Workload identity federation — authenticating to Google Cloud without a
long-lived key in repository secrets — is a materially stronger posture than
the stored service-account key `PLAY_SERVICE_ACCOUNT_JSON` holds, and was
considered. It was not adopted here because the fastlane actions this
pipeline calls authenticate with a key, and because splitting Google Play
from `FIREBASE_SERVICE_ACCOUNT_JSON` — the same shape of credential this
repository already holds for Firebase — onto a different authentication
model would leave the two credentials handled inconsistently for no benefit
specific to this change. It is worth adopting on its own, as a change that
covers both credentials rather than one.

## Deriving the Version Code From the Store, Not the CI Run Number

`android-release.yaml`'s `version-code` job reads the highest version code
Google Play's internal testing track currently reports and uploads one more
than it. This is a different source than either preview pipeline uses:
[decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md](./2026-08-26-derive-build-numbers-from-the-ci-run-number.md)
records `GITHUB_RUN_NUMBER` as this project's build-number source, and that
decision **still holds** for `android-preview.yaml` and `ios-preview.yaml` —
`app.config.ts`'s `resolveBuildNumber` is unchanged by this pipeline, and
both preview pipelines still stamp `GITHUB_RUN_NUMBER` exactly as before.
This record only adds a second, narrower source for this one pipeline, where
the run-number scheme's own properties become liabilities rather than
conveniences.

A Google Play version code is consumed **permanently**— once used for a
package on any track, it can never be reused, and a track refuses a release
whose code is not strictly greater than what it already carries, up to a
maximum of 2,100,000,000. Against that constraint, `GITHUB_RUN_NUMBER` has
two failures the preview pipelines never surface, because nothing about a
preview build's version number is permanent or globally checked the way
Google Play's is:

- **The counter is tied to one workflow's identity.** It resets if the
  workflow file is ever renamed, and two different workflows accumulate two
  unrelated sequences. A Google Play version code cannot un-consume itself
  when that happens; a reset counter producing a code already used, or lower
  than the track's current maximum, fails every upload after it until
  someone notices and intervenes by hand.
- **It cannot account for a manual upload.** This pipeline's own first-upload
  fallback (see [google-play-release.md](../operations/google-play-release.md#the-first-upload-problem))
  has a maintainer upload a bundle through the Play Console directly, outside
  any GitHub Actions run. A run-number scheme has no way to know what code
  that upload consumed and would have to be corrected by hand to avoid
  reusing it — exactly the kind of omission that burns a version code
  irrecoverably.

A version code derived from the build timestamp was also considered:
monotone regardless of workflow identity, and immune to the reset problem
above. It was rejected because it still cannot detect a code a manual upload
already consumed, and because it would introduce a second, unrelated
numbering scheme alongside the existing run-number one rather than removing
a liability.

Reading the code back from the track sidesteps both failures at once: Google
Play's own internal-testing track is the one place that already knows every
code — API-uploaded or manually uploaded alike — that has ever reached it,
so asking it directly is strictly more correct than maintaining a second
ledger of the same fact. The `google_play_track_version_codes` action returns
an empty array, not an error, when the track has no release yet, which is
what makes the first upload possible at all: the fallback there is `1`, not a
failure.

The same store-queried pattern is available on the iOS side, through the
same release tooling this repository already uses for the Android preview
and release pipelines alike. No iOS pipeline reads it yet — this change
builds nothing for iOS — but a future TestFlight pipeline has a pattern to
mirror rather than a second scheme to invent.

## Timeout Projections

Every `timeout-minutes` value in `android-release.yaml` was set on
[conventions/continuous-integration.md](../conventions/continuous-integration.md)'s
fixed ladder, and every one of them is a **projection**, not a measurement:
this workflow has never run, so none of its jobs has a duration of its own to
derive a value from. Each was instead projected from the closest analogous
job already running in `android-preview.yaml`, doubled the same way a real
measurement would be and raised to the same ladder rung that analogous job
already carries, since no better basis exists yet:

| `android-release.yaml` job | Work | Modelled on (`android-preview.yaml`) | Value |
| --- | --- | --- | --- |
| `preflight` | Scripted checks and two `node -p` reads against `app.json` — lighter than its model, since there is no pull-request-origin API call to make | `preflight` (10, itself unmeasured and predating this project's timeout convention) | 5 (the ladder's smallest rung, since this job does less than its own already-generous model) |
| `version-code` | Ruby/bundler install plus one Google Play API call that opens and closes an edit | `publish` (15, unmeasured — "no build, generous for what this job does") | 15 |
| `prebuild` | `npm ci` plus a bare `expo prebuild --platform android`, cached | `prebuild` (15) — identical work | 15 |
| `build` | A single-arch (`arm64-v8a`) Gradle `bundle` with signing, no Sentry upload | `build` (45) — the same signing and Gradle machinery; a `bundle` task without a source-map upload is not assumed meaningfully lighter than an `assemble` task with one | 45 |
| `publish` | Credential write/validation plus one Google Play upload | `publish` (15) — the same shape, a different destination | 15 |

This is a weaker basis than a real measurement, and it is recorded as such
rather than presented as one: `android-preview.yaml`'s own values are
themselves mostly unmeasured allowances rather than durations doubled and
raised to a rung by the letter of the ladder's own derivation rule — its
`preflight` value of 10 does not even land on the ladder. Projecting from
values that are not fully rigorous themselves is still the best available
anchor for work this repository has run before, in preference to guessing at
a duration with no anchor at all. Each value above stands until this pipeline
has run enough times on its own runner to replace it with a measured one.
