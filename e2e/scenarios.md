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
