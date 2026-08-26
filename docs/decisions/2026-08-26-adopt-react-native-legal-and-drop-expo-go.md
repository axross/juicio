---
status: accepted
---

# Adopt react-native-legal for the Licenses Screen, and Drop Expo Go

Settings' `Licenses` row needs a real licence screen listing every installed
dependency's full licence text, and this project has over a thousand
installed packages, ruling out a hand-maintained list.

`react-native-legal` was adopted for it. At the time this decision was made,
it was verified against the npm registry and the library's own repository:
version `1.6.5`, published 2026-08-13, MIT-licensed, maintained by Callstack,
a TurboModule wrapping AboutLibraries on Android and LicensePlist on iOS,
shipping both build-time licence-list generation and a native licence screen
that renders full licence text. Its compatibility with this project's exact
React Native (`0.86.2`) and React (`19.2.3`) versions was **not verified** —
only against its declared peer floor, `react-native >=0.76.0`.

Two categories of alternative were rejected. `generate-license-file` (ISC,
`4.2.4`, actively maintained, produces full licence text, and works under
Expo Go) plus a hand-written screen was rejected because it trades a
maintained native screen for one this project would then own and keep in
sync itself. A hand-maintained static list was rejected outright — it drifts
against a dependency tree this large the first time any package updates.
Four further candidates were checked and rejected as abandoned:
`react-native-oss-license` (`0.7.0`, 2022-10-02), `expo-license-list`
(`1.0.5`, 2021-02-23), `license-checker` (`25.0.1`, 2022-06-19), and
`npm-license-crawler` (`0.2.1`, 2019-03-28).

`react-native-legal` is a native module and its own README states it cannot
run under Expo Go. Adopting it therefore removes Expo Go from this project's
development flow entirely: both platforms now require a dev client, which in
practice makes macOS necessary to build and iterate on this repository, since
an iOS dev client cannot be built on Linux or Windows.
