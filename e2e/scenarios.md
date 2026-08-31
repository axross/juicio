# E2E scenario catalog

This file is the source of truth for which user journeys the end-to-end
suite is expected to cover. Each scenario has a stable identifier
(`SCN-NNN`) that never changes once assigned, even if the scenario's
description is edited later.

A scenario is considered covered when a Maestro flow file named
`e2e/flows/<id>.yaml` exists (for example, `SCN-001` is covered by
`e2e/flows/SCN-001.yaml`). `e2e/check-scenario-coverage.mjs` enforces this
and fails the build if a catalogued scenario has no matching flow.

To add a scenario: append a new `## SCN-NNN: <title>` section below, then
add its flow file under `e2e/flows/`.

## SCN-001: App launches and shows the Analyze tab

Launching the app lands on the Analyze tab, active, without crashing. Its
identifier is stable for the life of the project — the phase that built the
four-tab shell changed what it asserts (it used to assert the placeholder
`Juicio` home screen, now deleted) rather than retiring it.

## SCN-002: Moving between all four tabs shows each one's content

Tapping History, Presets, and Settings in turn, then back to Analyze, shows
each tab's own nav-bar title and content, and marks the tapped tab active.

## SCN-003: Switching the language to 日本語 and back

From Settings, opening the `Language` child screen and selecting `日本語`
changes the visible strings — the tab labels, the Settings screen's own
section headings, and the `Language` screen's own nav-bar title — to
Japanese without a reload. Selecting `English (United States)` again changes
them back. `Language` and `Theme` moved onto their own child screens in
issue #76; this scenario's identifier is stable for the life of the
project — it now reaches the same selection through that screen rather than
a radio row on Settings itself.

## SCN-004: Switching the theme to Light

From Settings, opening the `Theme` child screen and selecting `Light` marks
that row selected immediately. Moved onto that child screen in issue #76,
same as SCN-003 above.

## SCN-005: Relaunching after switching the language persists the choice

After selecting `日本語` on the `Language` child screen, force-quitting and
relaunching the app opens it in Japanese, with no visible flash of English.

## SCN-006: Relaunching after switching the theme persists the choice

After selecting `Light` on the `Theme` child screen, force-quitting and
relaunching the app opens it with `Light` still selected.

## SCN-007: Tapping Feedback and returning

From Settings, tapping the `About` section's `Feedback` row opens the
Feedback screen, showing its own nav bar. Tapping its back affordance
returns to Settings without crashing.

## SCN-008: Starting a native job from Presets and watching it complete

From the Presets tab, tapping the native job demo's start control begins a
job: its cancel control and progress indicator appear, and the demo shows
the completed result once the job settles. The demo itself relocated from
Analyze to Presets in issue #64; this scenario's identifier is stable for
the life of the project — it now reaches the same demo through a different
tab rather than being retired.

## SCN-009: Switching the theme through a same-theme transition

On the `Theme` child screen, pressing `Light`, then `System`, then `Dark`,
then `System` in that order moves the radio to each tapped row in turn.
Whichever colour scheme the device's OS is in, one of the two `System`
presses in this sequence resolves to the same theme as the option selected
just before it — `System` after `Light` while the OS is light, or `System`
after `Dark` while it's dark — so this flow catches the same-theme-transition
regression (#20) without depending on the device's OS setting either way.
Issue #76 extends that same fix across two screens, sharing one store rather
than a single screen's own local state, so this flow also returns to
Settings afterward and confirms its `Theme` row shows the same `System`
value the child screen ended on.

## SCN-010: Cold-launching with the selected theme differing from the device colour scheme

With the device's own colour scheme set to Light, selecting `Dark` on the
`Theme` child screen marks that row selected. Force-quitting and
relaunching — the device left on its own Light scheme throughout — keeps
`Dark` selected and every tab still reachable, reproducing the exact launch
ordering issue #68 was filed against.

This scenario proves that the theme selection survives the relaunch and that
the tab bar stays reachable afterward; it does not, and cannot, assert the
tab bar's rendered colour — Maestro has no colour-assertion command in this
suite's vocabulary. The defect's actual symptom (the tab bar's background
painted in the wrong theme's colour) is confirmed by the maintainer's own
device check, not by this flow.

## SCN-011: Opening the card/range input sheet from + New Player and dismissing it

From the Analyze tab's empty state, tapping `+ New Player` opens the
card/range input sheet, showing its two tabs, `Cards` (selected by
default) and `Hand Range`. Tapping the `Hand Range` tab switches to it.
Tapping the sheet's drag handle dismisses it, returning to the Analyze tab's
empty state without crashing. Not covered here, because Maestro cannot
assert on either: the haptic feedback each of these touches fires, and a
drag-based dismissal (only a tap on the handle is exercised, not a drag past the
sheet's own dismiss threshold).

## SCN-012: Feedback's Send validates on press and reports unavailable from a development build

From the Feedback screen (SCN-007 covers reaching it), Send starts pressable
with the Message field still empty — it is never disabled, per the
high-fidelity-ui-design skill's disabled-vs-validate-on-press rule — and
tapping it in that state shows an
inline `A message is required.` error under the Message field rather than
sending anything. Typing a message and tapping Send again shows the
`unavailable` message rather than completing: a development build carries no
`EXPO_PUBLIC_SENTRY_DSN` by default, so `Sentry.getClient()` returns
`undefined` and `canSendUserFeedback()` reports `false` deterministically —
see `src/core/instrumentation/user-feedback.ts` and
docs/specs/settings.md. This scenario cannot reach the completion state,
which needs a real Sentry client, and does not attempt to.

## SCN-013: Picking board cards from a board slot and dismissing the sheet

From the Analyze tab, tapping one of the board's five slots opens the board
input sheet, showing its own five preview slots and the fanned card picker
directly beneath the drag handle — no tab row and no heading, both of which
would ride the sheet's header chrome, so the flow asserts that chrome never
renders. Tapping three cards in the fan fills the first three preview slots
in turn. Tapping the sheet's drag handle dismisses it, returning to the
Analyze tab with the board still showing five empty slots, since nothing
yet reads what the sheet submits. Not covered here, because Maestro cannot
assert on any of them: the haptic feedback each of these touches fires, the
fade a board slot shows while a finger is down on it, and which preview
slot carries the focus ring. The absence of a confirm button is not covered
either, for a different reason — the sheet draws none, so there is no id or
copy for an `assertNotVisible` to name.

## SCN-014: Adding a player from the empty state, then swiping the row away

From the Analyze tab's empty state, tapping `+ New Player` opens the
card/range input sheet (SCN-011 covers the sheet's own tabs and its
handle-tap dismissal), switching to `Hand Range` and tapping the `55+`
shorthand chip selects a range. Tapping the sheet's drag handle submits it,
replacing the empty state with the players list: a row showing the
`Player 1` label and its own card-pair-count subtitle. Swiping that row
left past the design's own commit offset deletes it without a further tap,
returning the screen to the empty state. Not covered here, because Maestro
cannot assert on either: the haptic feedback the swipe and the delete both
fire, and the row's own accessibility-action deletion path (SCN-014
exercises the gesture, not the alternative it exists alongside).

## SCN-015: Editing a player's holding by tapping its row preview

From the Analyze tab's empty state (SCN-014 covers reaching it), adding a
hand-range player the same way SCN-014 does. Tapping that row's own preview
— not the rest of the row — reopens the card/range input sheet, this time
on the `Hand Range` tab with the `55+` selection already showing (this
scenario's own proof that the sheet reseeds from the player being edited,
rather than opening blank). Tapping the `A2s+` shorthand chip changes the
selection, and tapping the sheet's drag handle submits it: the row still
reads `Player 1` — the same player, its number and position unchanged —
with its subtitle's own card-pair count now reflecting the new selection.
Not covered here, because Maestro cannot assert on it: the haptic feedback
the preview tap fires, and the row's own accessibility-action edit path
(SCN-015 exercises the tap, not the alternative it exists alongside).
