# Settings

This document describes the Settings screen: `Language`, `Theme`, `About`,
and the Technical Information block are built and shipped, as this document
now describes. `Licenses` is not built — a follow-up issue owns it, together
with `react-native-legal`, and that part of this document remains design
intent, marked as such below.

## Language

A `Language` section offers two radio rows: `English (United States)` with a
US flag, and `日本語` with a JP flag. Selecting a row changes the app's
language immediately, backed by i18next; see
[decisions/2026-08-26-adopt-i18next-for-localization.md](../decisions/2026-08-26-adopt-i18next-for-localization.md).

## Theme

A `Theme` section offers `System`, `Light`, and `Dark`, shipping as three
radio rows in one card — the same row component `Language` uses — chosen by
the maintainer from three options weighed at the plan gate (a segmented
control and a disclosure row were the other two). **The design file does not
contain this section** — it shows no theme control and no light screens
anywhere — this is settled behaviour ahead of the design; see
[decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md](../decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md).

Language and theme are both persisted on-device, applied before the first
frame paints on every launch after the first; see
[decisions/2026-08-26-store-user-settings-in-async-storage.md](../decisions/2026-08-26-store-user-settings-in-async-storage.md).

## About

An `About` section holds `Feedback` (speech-bubble icon, matching the
catalogued `Baloon`), built and shipped: tapping it opens a screen carrying
only its own nav bar and a working back affordance, to be connected to a
feedback form later.

The design file's `About` section also carries `Licenses` (a circle
enclosing a bracket-pair, a "code"-style mark — not an info icon). **This
row is not built.** That glyph is not among the fourteen icons
[conventions/design-system.md](../conventions/design-system.md)'s Icon Set
catalogues, so which icon a change should use for it is unsettled. A
follow-up issue owns `Licenses`, together with `react-native-legal`, which
shows the full licence text for every installed dependency; see
[decisions/2026-08-26-adopt-react-native-legal-and-drop-expo-go.md](../decisions/2026-08-26-adopt-react-native-legal-and-drop-expo-go.md)
and
[decisions/2026-08-26-adopt-expo-dev-client-and-retire-expo-go-now.md](../decisions/2026-08-26-adopt-expo-dev-client-and-retire-expo-go-now.md).
`react-native-legal`'s compatibility with this project's React Native and
React versions is **not verified** — only its declared peer floor is.

## Technical Information

An unlabelled block of plain text shows four values: `Build`, `App Version`,
`Build Number`, and `SHA`, built and shipped. All four are supplied through
`app.config.ts`'s `extra` at build time, alongside a build channel
(`Development`, `Preview`, or `Production`) set by CI. On a build with no
CI-supplied metadata, each line still renders a legible local fallback
rather than an empty value or the literal word `undefined`. The build
number specifically is derived from the CI run number; see
[decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md](../decisions/2026-08-26-derive-build-numbers-from-the-ci-run-number.md).

## Calculation Accuracy Is Not Part of Settings Yet

The design file carries a `Calculation Accuracy` section (`Speedy` /
`Accurate`), but it is marked hidden in the file itself, its helper text is
an acknowledged draft, and its page title is left as the placeholder `Lorem
Ipsum`. It is not part of this Settings screen.
