# Navigation

This document describes what the design specifies for the app's navigation
shell — the tab bar, the nav bar, and the destinations a drill-down leads to.
None of it is built yet; this is a record of design intent, not of shipped
behaviour.

## The Tab Bar

A bottom tab bar with four destinations sits on every top-level screen:

| Tab | Icon | Destination |
| --- | --- | --- |
| Analyze | bar chart | the equity analysis screen |
| History | clock with a counter-clockwise arrow | past calculations |
| Presets | clipboard-list | saved hand ranges |
| Settings | cog | app settings |

The active tab's icon and label are lime, with a thin lime indicator above it;
inactive tabs are grey.

## The Nav Bar

Each of the four top-level screens carries a nav bar with a centred title —
`Analyze`, `History`, `Presets`, `Settings`. The Analyze nav bar in the design
also carries a share icon. Analyze's nav bar in the app takes the same shape
as the other three: title only, no icon.

## Drill-Down Destinations

Three rows lead somewhere beyond their own screen:

- An Analyze player row for a **range** player opens the Equity Breakdown
  sheet, reached through the row's `See Details` affordance. See
  [equity-analysis.md](./equity-analysis.md).
- A Presets row opens the preset editor (`Edit Preset`). See
  [hand-ranges.md](./hand-ranges.md).
- Analyze's `+ New Player` control, and an existing player row, both open the
  card/range input sheet. See [hand-ranges.md](./hand-ranges.md).

## The Menu Overlay Is Not Built

The design file carries a floating `Menu` overlay — three rows, `Hand Range
Preset` (folder icon), `Calculation History` (clock icon), and `Setting` (cog
icon) — whose destinations duplicate three of the four tabs. The app does not
build this overlay: the tab bar is the only navigation surface. A later
session that opens the design file will still find the `Menu` frame there;
this is deliberate, not an omission, and is recorded in
[decisions/2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md](../decisions/2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md).
