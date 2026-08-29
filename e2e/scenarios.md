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

From Settings, selecting `日本語` changes the visible strings — the tab
labels and the Settings screen's own section headings — to Japanese without
a reload. Selecting `English (United States)` again changes them back.

## SCN-004: Switching the theme to Light

From Settings, selecting `Light` marks that row selected immediately.

## SCN-005: Relaunching after switching the language persists the choice

After selecting `日本語` in Settings, force-quitting and relaunching the app
opens it in Japanese, with no visible flash of English.

## SCN-006: Relaunching after switching the theme persists the choice

After selecting `Light` in Settings, force-quitting and relaunching the app
opens it with `Light` still selected.

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

From Settings, pressing `Light`, then `System`, then `Dark`, then `System`
in that order moves the radio to each tapped row in turn. Whichever colour
scheme the device's OS is in, one of the two `System` presses in this
sequence resolves to the same theme as the option selected just before it —
`System` after `Light` while the OS is light, or `System` after `Dark` while
it's dark — so this flow catches the same-theme-transition regression (#20)
without depending on the device's OS setting either way.

## SCN-010: Cold-launching with the selected theme differing from the device colour scheme

With the device's own colour scheme set to Light, selecting `Dark` in
Settings marks that row selected. Force-quitting and relaunching — the
device left on its own Light scheme throughout — keeps `Dark` selected and
every tab still reachable, reproducing the exact launch ordering issue #68
was filed against.

This scenario proves that the theme selection survives the relaunch and that
the tab bar stays reachable afterward; it does not, and cannot, assert the
tab bar's rendered colour — Maestro has no colour-assertion command in this
suite's vocabulary. The defect's actual symptom (the tab bar's background
painted in the wrong theme's colour) is confirmed by the maintainer's own
device check, not by this flow.

## SCN-011: Opening the card/range input sheet from + New Player and dismissing it

From the Analyze tab's empty state, tapping `+ New Player` opens the
card/range input sheet, showing its two tabs, `Hand Range` (selected by
default) and `Cards`. Tapping the `Cards` tab switches to it. Tapping the
sheet's drag handle dismisses it, returning to the Analyze tab's empty
state without crashing. Not covered here, because Maestro cannot assert on
either: the haptic feedback each of these touches fires, and a drag-based
dismissal (only a tap on the handle is exercised, not a drag past the
sheet's own dismiss threshold).
