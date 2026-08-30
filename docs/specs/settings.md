# Settings

This document describes the Settings screen: `Language`, `Theme`, `About`,
and the Technical Information block are built and shipped, as this document
now describes. `Licenses` is not built — a follow-up issue owns it, together
with `react-native-legal`, and that part of this document remains design
intent, marked as such below.

## The Settings Screen Itself

The Settings screen keeps three section headings — `Language`, `Theme`,
`About` — in that order, and the unlabelled Technical Information block
beneath them, but no longer lays every option out inline: `Language` and
`Theme` each collapse to one **disclosure row** — the setting's name on the
left, its current value on the right (`English (United States)` / `日本語`
for `Language`; `System` / `Light` / `Dark` for `Theme`), then a right-facing
chevron — that opens a **child screen** of its own holding that setting's
options (issue #76, option A, chosen by the maintainer from three
presentation options weighed at the plan gate). `About`'s `Feedback` row is
unchanged except that it gains the same chevron, since it already navigates.
A long value (`English (United States)` is the longest) shrinks and
ellipsizes rather than pushing the chevron off the row.

**The design file specifies none of this.** It draws every option inline on
the Settings screen itself, contains no child screen for any setting, and no
chevron on any row, not even `Feedback`'s, which already navigates — this is
settled behaviour ahead of the design file, the same way `Theme`'s own
section already was.

Every Settings row — the Settings screen's three disclosure/`Feedback` rows,
and both child screens' option rows below — is **52dp** tall, not the design
file's own 44dp. Consecutive rows inside one card render an identical gap
between them at every device pixel density, including a non-integral one,
because both the row height and the card's inter-row gap are snapped onto
the device's own physical pixel grid before they reach the stylesheet
(`PixelRatio.roundToNearestPixel`) — at a non-integral density, unsnapped
values left Yoga rounding each row's own top and bottom edge onto that grid
independently, so the same nominal 1dp gap resolved to a different number of
physical pixels between different row pairs in the same card. The divider
between rows is still the screen background showing through a 1dp flex gap,
not a drawn border — snapping fixed the arithmetic without changing that
mechanism.

## Language

Tapping the Settings screen's `Language` row opens the `Language` child
screen: its own nav bar, titled `Language` (and updating immediately, along
with every other visible string, the moment the language actually changes —
including its own title), a working back affordance returning to Settings,
and one card holding two radio rows at the same 16dp inset the Settings
screen's own cards use — `English (United States)` with a US flag, and
`日本語` with a JP flag. Selecting a row changes the app's language
immediately, backed by i18next; see
[decisions/2026-08-26-adopt-i18next-for-localization.md](../decisions/2026-08-26-adopt-i18next-for-localization.md).
The screen shows no description below the card — neither option's name
needs a gloss.

## Theme

Tapping the Settings screen's `Theme` row opens the `Theme` child screen:
its own nav bar titled `Theme`, a working back affordance, and one card of
three radio rows at the same inset — `System`, `Light`, and `Dark` — the
same row component `Language` uses, chosen by the maintainer from three
options weighed at an earlier plan gate (a segmented control and a
disclosure row were the other two). 16dp below the card, at the same 16dp
horizontal inset, a description explains what the three options do — the
design file's own `Calculation Accuracy` helper-text pattern (node
`478:26900`), reused rather than invented, since `System` is the one option
on either child screen whose behaviour is not self-evident from its name.
**The design file does not contain this section at all** — it shows no
theme control and no light screens anywhere — this is settled behaviour
ahead of the design; see
[decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md](../decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md).

The active preference is shared client state (a Zustand store under
`src/features/settings/adapter/`), not local to either screen: the `Theme`
child screen writes the tapped preference to it, and both that screen and
the Settings screen's own `Theme` row read from it, falling back to the
runtime's own reported preference before anything has ever been tapped.
Sharing it this way is what keeps the Settings screen's displayed value
correct after a **same-theme transition** (`Dark` → `System` while the
device is dark, or `Light` → `System` while it's light) — Unistyles fires no
change notification for one, so nothing but an explicit write on tap moves
either screen's display. This is issue #20's original fix (no decision
record of its own, only the code comment on
`src/features/settings/adapter/use-theme-preference.ts` that carries it
forward), extended here from one screen's local state to a store two
screens read.

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
