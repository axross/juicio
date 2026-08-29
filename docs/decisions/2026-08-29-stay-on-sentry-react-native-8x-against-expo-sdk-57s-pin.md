---
status: accepted
---

# Stay on `@sentry/react-native` 8.x Against Expo SDK 57's `~7.11.0` Pin

This project runs `@sentry/react-native` on the 8.x line — `8.24.0` — while
Expo SDK 57's own `bundledNativeModules.json` recommends `~7.11.0`. That gap is
deliberate. `npx expo install --check` no longer reports it, not because the
versions agree, but because `package.json` now carries an
`expo.install.exclude` entry naming the package, which tells that check, and
`expo-doctor` and `expo start`'s equivalent check, to stop looking at it at
all.

## The 7 → 8 jump breaks no JavaScript API

`getsentry/sentry-react-native`'s `CHANGELOG.md` lists, under `## 8.0.0`
"Breaking Changes", only minimum native-tooling floors: iOS 15.0+ (up from
11.0+), macOS 10.14+, tvOS 15.0+, Sentry Android Gradle Plugin 6.0.0, Android
Gradle Plugin 7.4.0+, Kotlin 1.8+, and self-hosted Sentry 25.11.1+. No
JavaScript API was removed or renamed in that release.

Sentry's [v7-to-v8 migration guide](https://docs.sentry.io/platforms/react-native/migration/v7-to-v8/)
adds one further floor the changelog does not carry — Xcode 16.4+, "required
for proper Swift module compilation". It is a native-tooling floor like the
rest, so it does not change the conclusion above; it is cited to its own source
here because the changelog does not state it, and a reader checking that list
against the changelog would not find it there.

The JS-level breaks that are easy to misattribute to this jump —
`Sentry.captureUserFeedback` removed, `hasTracingEnabled` renamed to
`hasSpansEnabled` — belong to `## 7.0.0`, one major earlier. Downgrading to
`~7.11.0` would not undo an API migration this project depends on; it would
lower the SDK for its own sake, while still crossing that same 7.0.0 boundary
in the other direction.

## Expo's pin lags generally, not just on SDK 57

`expo/expo`'s `bundledNativeModules.json` names `~7.2.0` on the `sdk-54`
branch and `~7.11.0` on both `sdk-57` and `main` — all still on the 7.x line
more than six months after `8.0.0` shipped on 2026-02-12. This is read
directly from the file across three branches, not from any changelog entry
explaining the lag. The pattern reads as a table Expo has not refreshed since
before 8.0.0 existed, rather than as a compatibility boundary either vendor
has drawn.

## The 7.x line is stale, and neither line carries a known vulnerability

The last 7.x release is `7.13.0`, published 2026-02-12 — the same day `8.0.0`
shipped — with no 7.x patch since. Staying on 7.x going forward means staying
on a line its own maintainers stopped patching the day the next major shipped.

Neither line carries a security advisory. Snyk lists exactly one vulnerability
for this package, `SNYK-JS-SENTRYREACTNATIVE-6358886`, affecting `>=5.16.0
<5.19.1` — well below both lines in question. Security posture does not favour
either version.

## What this costs

`expo.install.exclude` does not narrow the check to accept the current
version; it removes `@sentry/react-native` from `expo install --check`,
`expo-doctor`, and `expo start`'s equivalent check **entirely**. A genuine
future incompatibility between this package and a later Expo SDK will not
surface through any of those commands. Whoever next bumps the Expo SDK has to
check this package's compatibility by hand — the tooling that would otherwise
flag it has been told not to look.

No Android or iOS native build verified the `8.24.0` bump, either in the
change that made it or in this project's CI. The changelog for `8.24.0`
declares no new floor beyond what `8.23.0` already required and the project
already satisfies, and its Expo-specific entry is a build fix rather than a
new requirement, so the risk is judged low — but it is asserted, not
demonstrated by a compile.

## What was not settled

Two questions were researched and left open because no primary source
answered them; neither changes the decision above, but a reader should not
mistake either for verified:

- Which Expo SDK version introduced `expo.install.exclude`. Expo's
  `package.json` configuration reference documents the field without dating
  it, and no changelog entry or introducing pull request was found. That this
  project's installed `expo@57.0.18` honours it is established by running
  `npx expo install --check` and reading its output, not by the documentation.
- Any first-party statement from Expo or Sentry acknowledging the
  `bundledNativeModules.json` lag. None was found. The lag claim above rests
  on reading the file across three branches, not on either vendor
  acknowledging it.
