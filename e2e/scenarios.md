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

## SCN-009: Cold-launching with the selected theme differing from the device colour scheme

With the device's own colour scheme set to Light, selecting `Dark` in
Settings marks that row selected. Force-quitting and relaunching — the
device left on its own Light scheme throughout — keeps `Dark` selected and
every tab still reachable, reproducing the exact launch ordering issue #68
was filed against.
