---
status: accepted
---

# Build iOS on Paid macOS Runners, and Move Both Preview Pipelines to Manual Dispatch

`2026-08-26-target-android-and-ios.md`
moved this project to targeting both platforms but left iOS unshippable on
purpose, closing by naming the build, signing, and distribution pipeline for
iOS as separate work tracked outside that decision. Building it required
settling how to pay for it: Xcode, `xcodebuild`, and `codesign` are
macOS-only, so an iOS build can only be produced on a macOS runner, and
GitHub bills a standard macOS runner at roughly 10.3x a Linux one
($0.062/minute against $0.006/minute for `ubuntu-latest`). Avoiding exactly
that multiplier was the stated reason the Android pipeline ran entirely on
`ubuntu-latest` in the first place.

iOS now builds on `macos-latest`, accepting that cost, and both platforms'
preview pipelines were moved from firing on every `pull_request` event to
running only on `workflow_dispatch` with a required pull request number —
Android's pipeline included, even though its own per-minute cost never
changed. The manual trigger is what bounds the new spend: a maintainer pays
for macOS minutes only when they actually dispatch an iOS build, not on
every push to every open pull request.

Four alternatives were rejected. Staying Android-only was rejected because
the project already committed to shipping iOS, per the decision this one
builds on; leaving it perpetually unshippable was never on the table.
Building iOS on every pull request, the way Android used to, was rejected on
cost alone — a React Native archive runs long enough (roughly 15–30 minutes)
that one build costs on the order of $1–2, and multiplying that by every push
to every open pull request was judged not worth it against a manual
alternative that costs nothing extra to use. A self-hosted or third-party
cloud Mac was rejected because it does not remove the cost, it only moves it
from a billing line to a machine someone has to provision, patch, and keep
available — the manual trigger already bounds the GitHub-hosted cost without
that operational burden. `fastlane match` was rejected in favor of storing
the signing certificate and provisioning profile directly as repository
secrets, because `match` would add a second private Git repository to
operate, where the direct-secret approach reuses the base64-secret pattern
`ANDROID_KEYSTORE_BASE64` already established for Android.

macOS minutes are now a real, ongoing cost this project accepts rather than
avoids. A preview build no longer appears automatically for either platform:
a maintainer has to remember to dispatch one, and nothing currently reminds
them to. An ad-hoc iOS build only installs on a device whose UDID was
registered with Apple and included in the provisioning profile before that
specific build was signed, so every new tester costs a full round trip —
export their UDID from Firebase, register it in the Apple Developer portal,
regenerate the provisioning profile, update the secret, and dispatch a fresh
build — because the build already sitting in Firebase cannot retroactively
serve a device that was not yet registered when it was signed.
