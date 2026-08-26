---
status: accepted
---

# Adopt i18next for Localization

Settings' `Language` section offers `English (United States)` and `日本語`,
and switching the selection needs to actually change the app's language, not
merely record a preference — the design's own copy already uses plurals and
interpolation that a translation layer has to support.

`i18next`, `react-i18next`, and `expo-localization` were adopted together,
wired far enough that switching languages works end to end.

Two alternatives were rejected. `expo-localization` plus a hand-rolled
dictionary was rejected: it costs one dependency instead of three, but
plurals and interpolation — both already present in the design's own copy —
would then have to be hand-written and hand-maintained rather than handled by
a library built for it. Lingui was rejected too: it has a smaller runtime
footprint, but its Babel macro and extraction step would need co-existence
testing against `react-native-unistyles` and `react-native-reanimated`, both
already load-bearing in this project's build, before it could be trusted.

Three packages are added rather than one, and localization now depends on a
runtime library rather than on values resolved at build time.
