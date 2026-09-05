# Settings

This document describes the Settings screen: `Language`, `Theme`, `About`
(`Feedback` and `Analytics`), and the Technical Information block are built
and shipped, as this document now describes. `Licenses` is not built — a
follow-up issue owns it, together with `react-native-legal`, and that part
of this document remains design intent, marked as such below.

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

Every Settings row — the Settings screen's four disclosure/`Feedback` rows
(`Language`, `Theme`, `Feedback`, and `Analytics`), and every child screen's
own rows below — is **52dp** tall, not the design
file's own 44dp, and both it and the card's inter-row gap are snapped onto
the device's own physical pixel grid before they reach the stylesheet
(`PixelRatio.roundToNearestPixel`). Snapping the gap is what keeps
consecutive rows inside one card rendering an identical gap between them at
every device pixel density, including a non-integral one: at a non-integral
density, an unsnapped gap left Yoga rounding each row's own top and bottom
edge onto that grid independently, so the same nominal 1dp gap resolved to a
different number of physical pixels between different row pairs in the same
card, whereas a snapped gap lands the same whole number of physical pixels
apart regardless of where the row above it starts — including past a
non-integral-height heading, or a row grown past its snapped minimum by its
own content. Snapping the row height alongside it keeps each row's own
rendered height identical across the card. The divider between rows is
still the screen background showing through a 1dp flex gap, not a drawn
border — snapping fixed the arithmetic without changing that mechanism.

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
either screen's display; see
[decisions/2026-09-05-share-the-theme-preference-through-a-store-not-local-state.md](../decisions/2026-09-05-share-the-theme-preference-through-a-store-not-local-state.md)
for why this is a store rather than either screen's own local state.

Language and theme are both persisted on-device, applied before the first
frame paints on every launch after the first; see
[decisions/2026-08-26-store-user-settings-in-async-storage.md](../decisions/2026-08-26-store-user-settings-in-async-storage.md).

## About

An `About` section holds `Feedback` (speech-bubble icon, matching the
catalogued `Baloon`), built and shipped: tapping it opens a screen carrying
its own nav bar above a feedback form that submits to Sentry's User
Feedback API. Beneath it, `About` also holds `Analytics` (issue #211) — a
plain disclosure row with no icon, its current value (`On` / `Off`) shown
the same way `Language`'s and `Theme`'s own rows show theirs — opening the
`Analytics` child screen; see [Analytics](#analytics) below.

The form stacks three labelled fields above an intro line — `Message`
(multi-line, required), `Name` (optional), and `Email` (optional, with a
hint that it is only needed for a reply) — under a full-width Send button
pinned to the bottom of the screen. Send stays pressable at all times;
pressing it validates the draft — never per keystroke — and a blank or
whitespace-only Message, or a non-empty Email that does not parse, each
show an inline error under their own field rather than sending anything.
Send's own always-enabled, validate-on-press behaviour follows the
high-fidelity-ui-design skill's disabled-vs-validate-on-press rule; a
field's error also reaches assistive technology, not only the visible
inline text — see
[conventions/accessibility.md](../conventions/accessibility.md).

Editing either the Message or the Email field clears that field's own error
immediately, following the same skill's rule to re-validate live only after
a field has already shown an error so the user watches it clear — the error
does not reappear until Send is pressed again against the still-invalid
value.

**The submit bar is hidden entirely, not repositioned, while the on-screen
keyboard is open.** The Message field's return key inserts a newline
instead of dismissing the keyboard, so two independent paths close it
instead: dragging the scroll view, and tapping anywhere in it outside the
focused field. The bar reappears the moment the keyboard closes.

On submit, the screen first confirms Sentry can actually accept feedback
(`canSendUserFeedback`, in `src/core/instrumentation/user-feedback.ts`) —
this project's Development build channel ships with no
`EXPO_PUBLIC_SENTRY_DSN` by default, so submitting there always reports
feedback as unavailable rather than sending it. A build that can send
replaces the form and the submit bar with a completion state instead of
navigating away; a send that throws leaves the draft in place and shows an
error instead.

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

## Analytics

Tapping the Settings screen's `Analytics` row (under `About`, beneath
`Feedback`) opens the `Analytics` child screen (issue #211): its own nav
bar titled `Analytics`, a working back affordance, one card holding a single
switch row — this app's first boolean switch control, [`switch-row.tsx`](../../src/features/settings/ui/switch-row.tsx)
— and, 16dp below the card, a description of what the switch controls, the
same `Calculation Accuracy` helper-text pattern `Theme`'s own child screen
already reuses. This is the plan's own chosen hybrid of two of three
presentation options weighed at the plan gate (a new `Privacy` section
holding either an inline switch or its own disclosure row, and an inline
switch inside the existing `About` section): no new section, a disclosure
row inside the existing `About` section, opening a dedicated child screen
rather than an inline switch.

The switch controls whether this app sends product-usage events to
Amplitude — see
[conventions/product-analytics.md](../conventions/product-analytics.md) for
the full event catalogue and the vendor wrapper this row's own preference
gates. It defaults to **on** and is reversible at any time: turning it off
stops every further event in the same running session immediately, with no
app restart, and turning it back on resumes sending the same way. The
preference persists on-device, the same way `Language` and `Theme` already
do, and survives closing and reopening the app.

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
