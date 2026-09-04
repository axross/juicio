---
status: accepted
---

# Write a Local Config Plugin for Gradle Properties `expo-build-properties` Can't Set

Turning on Gradle's own local build cache and parallel task execution needed
`org.gradle.caching=true` and `org.gradle.parallel=true` written into the
generated `android/gradle.properties` on every `expo prebuild`, the same
regeneration problem
[2026-08-27-use-expo-build-properties-to-restrict-the-android-abi.md](./2026-08-27-use-expo-build-properties-to-restrict-the-android-abi.md)
already solved for the ABI restriction by routing through the
`expo-build-properties` config plugin instead of a hand edit to the
generated file.

That record's own alternatives explicitly rejected a hand-written config
plugin calling `withGradleProperties`, in favor of a mechanism Expo itself
maintains. Reading `expo-build-properties`'s installed source (pinned at
`~57.0.15`) found that its Android configuration surface does not extend to
these two flags: it exposes a fixed, typed list of properties — `buildArchs`,
`enableMinifyInReleaseBuilds`, and so on — each wired to one hardcoded
`gradle.properties` key via `expo/config-plugins`' own
`AndroidConfig.BuildProperties.createBuildGradlePropsConfigPlugin` helper,
with no option that passes an arbitrary property through. There is no
version of that package pinned in this project, today, that this change
could route these two flags through.

A small local config plugin, `plugins/with-gradle-performance-properties.ts`,
was written instead — built directly on the same
`createBuildGradlePropsConfigPlugin` helper `expo-build-properties` itself
calls internally, rather than on a hand-rolled `gradle.properties`
reader/writer. This is not the alternative the ABI record rejected: that
record rejected hand-written code duplicating logic Expo already ships in
`expo-build-properties`, when `expo-build-properties` already covered the
setting in question. Here nothing already ships the setting at all, so the
choice is between this small plugin and one of two costlier alternatives:
patching or forking `expo-build-properties` to add the option upstream, or
passing the properties at Gradle invocation time (rejected for the ABI
restriction on its own terms — it splits one setting across two files and
leaves the generated `gradle.properties` unrestricted for a direct
`./gradlew` run — and rejected again here for the same reasons).

This project now carries its first local Expo config plugin. A future
Android Gradle property this project wants that a newer `expo-build-properties`
release does cover should go through that package's own option instead of
this pattern; this pattern is for a property no installed version of
`expo-build-properties` exposes.
