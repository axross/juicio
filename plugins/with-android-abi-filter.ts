import type { ConfigPlugin } from 'expo/config-plugins.js';
import { withGradleProperties } from 'expo/config-plugins.js';

// Restricts every native Android build (debug and release alike) to
// arm64-v8a, by overriding the `reactNativeArchitectures` property the
// generated android/gradle.properties otherwise sets to all four ABIs
// (armeabi-v7a, arm64-v8a, x86, x86_64) — see
// react-native/ReactAndroid/build.gradle.kts, which reads this same
// property to build the NDK `abiFilters` list. Building all four produced
// four full native compiles on every Android preview CI run, exhausting the
// runner's disk (see docs/operations/preview-deployment.md). A hand-edit to
// android/gradle.properties would not survive `expo prebuild` regenerating
// it, since android/ is generated output and not committed — this plugin is
// what makes the restriction survive regeneration.
//
// Every physical Android device a tester would install this build on is
// arm64. The cost is that an x86_64 emulator cannot install the resulting
// APK — documented in docs/operations/preview-deployment.md rather than
// left for a tester to discover from a failed install.
export const withAndroidAbiFilter: ConfigPlugin = (config) =>
  withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const key = 'reactNativeArchitectures';
    const value = 'arm64-v8a';
    const existingIndex = properties.findIndex(
      (item) => item.type === 'property' && item.key === key,
    );

    if (existingIndex >= 0) {
      properties[existingIndex] = { type: 'property', key, value };
    } else {
      properties.push({ type: 'property', key, value });
    }

    return config;
  });
