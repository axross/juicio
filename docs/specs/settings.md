# Settings

This document describes what the design specifies for the Settings screen,
together with the settings behaviour the maintainer settled beyond what the
design file shows. None of it is built yet; this is a record of design
intent, not of shipped behaviour.

## Language

A `Language` section offers two radio rows: `English (United States)` with a
US flag, and `日本語` with a JP flag. Switching the selection actually changes
the app's language, backed by i18next; see
[decisions/2026-08-26-adopt-i18next-for-localization.md](../decisions/2026-08-26-adopt-i18next-for-localization.md).

## Theme

A `Theme` section offers `System`, `Light`, and `Dark`. **The design file
does not contain this section yet** — it shows no theme control and no light
screens anywhere — this is settled behaviour ahead of the design; see
[decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md](../decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md).

Language and theme are both persisted on-device; see
[decisions/2026-08-26-store-user-settings-in-async-storage.md](../decisions/2026-08-26-store-user-settings-in-async-storage.md).

## About

An `About` section holds two rows: `Feedback` (speech-bubble icon) and
`Licenses` (info icon). `Feedback` opens an empty screen for now, to be
connected to a feedback form later. `Licenses` is backed by
`react-native-legal`, which shows the full licence text for every installed
dependency; see
[decisions/2026-08-26-adopt-react-native-legal-and-drop-expo-go.md](../decisions/2026-08-26-adopt-react-native-legal-and-drop-expo-go.md).
`react-native-legal`'s compatibility with this project's React Native and
React versions is **not verified** — only its declared peer floor is.

## Technical Information

An unlabelled block of plain text shows four values: `Build`, `App Version`,
`Build Number`, and `SHA`. All four are supplied through `app.config.ts`'s
`extra` at build time, alongside a build channel (`Development`, `Preview`,
or `Production`) set by CI. The build number specifically is derived from the
CI run number; see
[decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md](../decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md).

## Calculation Accuracy Is Not Part of Settings Yet

The design file carries a `Calculation Accuracy` section (`Speedy` /
`Accurate`), but it is marked hidden in the file itself, its helper text is
an acknowledged draft, and its page title is left as the placeholder `Lorem
Ipsum`. This section is out of scope until the calculation engine exists to
judge it against, and is not part of this Settings screen.
