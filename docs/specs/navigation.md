# Navigation

This document describes the app's navigation shell — the tab bar, the nav
bar, and the destinations a drill-down leads to. The tab bar and the nav bar
are built and shipped, as this document now describes; the drill-down
destinations beyond the four top-level tabs, other than `Feedback`, are
still design intent, marked as such below.

## The Tab Bar

A bottom tab bar with four destinations sits on every top-level screen, built
with `expo-router`'s JavaScript `Tabs` navigator and a custom `tabBar` render
prop; see
[decisions/2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md](../decisions/2026-08-26-build-the-tab-bar-with-expo-routers-tabs-navigator.md)
for why:

| Tab | Icon | Destination |
| --- | --- | --- |
| Analyze | bar chart | the equity analysis screen |
| History | clock with a counter-clockwise arrow | past calculations |
| Presets | clipboard-list | saved hand ranges |
| Settings | cog | app settings |

The active tab's icon and label are lime (`text.accent.brand`), with a thin
lime gradient hairline along that cell's own top edge; inactive tabs are
grey. The bar is 90px tall on the design's own reference device — 56px of
fixed per-cell content plus that device's 34px home-indicator inset, added
rather than baked in, so a device with a smaller or zero inset renders a
correspondingly shorter bar.

## The Nav Bar

Each of the four top-level screens, and the `Feedback` screen below, carries
a nav bar with a centred title — `Analyze`, `History`, `Presets`, `Settings`,
`Feedback`. The design's Analyze nav bar also carries a share icon, but every
nav bar the app renders is title only, with an optional back affordance on a
screen that has somewhere to go back to (`Feedback` is the only one that
does). Leaving the share icon out is deliberate, not an omission: a later
session that opens the design file will still find it there.

## Drill-Down Destinations

Settings' `Feedback` row opens the Feedback screen, a screen carrying only
its own nav bar and a working back affordance; see
[settings.md](./settings.md). This is the one drill-down destination this
change builds.

Three further rows lead somewhere beyond their own screen; none of them are
built yet, and this remains a record of design intent for each:

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
