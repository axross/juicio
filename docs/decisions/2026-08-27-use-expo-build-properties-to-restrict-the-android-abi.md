---
status: accepted
---

# Use expo-build-properties to Restrict the Android ABI

The Android build's `arm64-v8a`-only ABI restriction needs a mechanism that
writes `reactNativeArchitectures` into the generated
`android/gradle.properties` on every `expo prebuild`, since that file is
generated output and a hand edit to it does not survive regeneration. The
restriction itself was not in question — only how to apply it.

`expo-build-properties`'s Android `buildArchs` option was adopted as that
mechanism, declared in `app.json`'s `plugins` array. It replaced a
hand-written config plugin that called `withGradleProperties` to the same
end. `expo-build-properties` is a first-party Expo package, versioned with
the SDK this project already pins, so it moves the restriction into
declarative config Expo maintains rather than a plugin this project carries
and maintains itself.

Two alternatives were rejected. Passing the property at Gradle invocation
time — through `fastlane/Fastfile`'s `gradle(properties:)` hash for CI, and
an npm script property prefix locally — was rejected because it splits one
setting across two files, leaves the generated `gradle.properties` still
listing all four ABIs so a direct `./gradlew` run stays unrestricted, and an
environment-variable prefix in an npm script does not work under Windows
`cmd`. Inlining the plugin function into `app.config.ts`, keeping the
hand-written `withGradleProperties` call and the type cast it needed, was
rejected because it moves the maintenance burden rather than removing it,
which was the point of the change.

The restriction now depends on a package Expo, not this project, maintains
and versions with the SDK; a later change wanting to drop that dependency
has to weigh the two rejected alternatives above, or find a third, rather
than reaching for either without knowing it was already considered and
rejected.
