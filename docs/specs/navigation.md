# Navigation

This document describes the app's navigation shell — the tab bar, the nav
bar, and the destinations a drill-down leads to. The tab bar and the nav bar
are built and shipped, as this document now describes; the drill-down
destinations beyond the four top-level tabs, other than `Feedback`,
`Language`, `Theme`, and `Analytics`, are still design intent, marked as
such below.

## The Tab Bar

A bottom tab bar with four destinations sits on every top-level screen. What
renders it is a platform split.

**Android, and every other non-iOS platform,** render it with the fully
custom tab bar built on `expo-router`'s JavaScript `Tabs` navigator and a
custom `tabBar` render prop; see
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
grey. The bar's own background is `background.neutral.subtle`, the same
token the nav bar below uses. The bar is 90px tall on the design's own
reference device — 56px of fixed per-cell content plus that device's 34px
home-indicator inset, added rather than baked in, so a device with a smaller
or zero inset renders a correspondingly shorter bar.

**iOS** renders the same four destinations through `expo-router`'s native
tab bar (`NativeTabs`, from `expo-router/unstable-native-tabs`) instead —
standard system chrome rather than this design's own custom cell; see
[decisions/2026-09-04-render-the-ios-tab-bar-with-expo-routers-native-tabs.md](../decisions/2026-09-04-render-the-ios-tab-bar-with-expo-routers-native-tabs.md)
for why. Its tint and icon colour still follow this app's own tokens — lime
(`text.accent.brand`) selected, `text.neutral.low` unselected — and its
background is `background.neutral.subtle` on iOS below 26; iOS 26 and later
ignores that in favour of the system's own Liquid Glass material, applied
automatically with no application code of its own. Each tab carries an SF
Symbol matching the icon column above: `chart.bar`/`chart.bar.fill`
(Analyze), `clock.arrow.circlepath` for History in both states (no filled
variant of that symbol exists), `square.grid.2x2`/`square.grid.2x2.fill`
(Presets), and `gearshape`/`gearshape.fill` (Settings). The tab label
attempts this app's own `fontFaces.medium` face and per-state colour, though
a known open upstream bug
([expo/expo#44029](https://github.com/expo/expo/issues/44029)) may keep the
label's colour specifically from taking effect.

## The Nav Bar

Each of the four top-level screens, and the `Feedback`, `Language`, `Theme`,
and `Analytics` screens below, carries a nav bar with a centred title —
`Analyze`, `History`, `Hand Range Preset` (the Presets tab's own title; see
[hand-ranges.md](./hand-ranges.md)'s "The Preset List"), `Settings`,
`Feedback`, `Language`, `Theme`, `Analytics`. The design's Analyze nav bar
also carries a share icon, but every nav bar the app renders is title
only, with an optional back affordance on a screen that has somewhere to
go back to (`Feedback`, `Language`, `Theme`, and `Analytics` are the only
ones that do). Leaving the share icon out is deliberate, not an omission:
a later session that opens the design file will still find it there.

**The design file draws neither `Language`, `Theme`, nor `Analytics` as a
child screen at all.** It lays out `Language`'s and `Theme`'s options
inline on the Settings screen itself, with no destination for either to
navigate to and no nav bar for either title above, and carries no
`Analytics` control at all — the maintainer's own addition, issue #211;
every row this section names them on is settled behaviour ahead of the
design file, the same way `Feedback`'s own nav bar already was.

## Drill-Down Destinations

Settings' `Feedback`, `Language`, `Theme`, and `Analytics` rows each open a
screen carrying only its own nav bar, a working back affordance, and — for
`Language`, `Theme`, and `Analytics` — one card of that setting's own
options; see [settings.md](./settings.md) for what each card holds. These
are the four drill-down destinations this change builds; `Language`'s and
`Theme`'s were added by issue #76, which also raised every Settings row's
own touch target from the design file's 44dp to 52dp and gave each of those
two rows a right-facing chevron; `Analytics`'s was added by issue #211,
following the identical shape — none of which the design file specifies
either.

Four further rows or controls lead somewhere beyond their own screen. One
of them is still a record of design intent; the other three — Analyze's
`+ New Player` control, a Presets row, and the Presets tab's own
`+ New Preset` control — are now built:

- An Analyze player row for a **range** player, once a result exists, opens
  the Equity Breakdown sheet through its own detail press — a second press
  target covering the row except its own preview — and is built and shipped.
  See [equity-breakdown.md](./equity-breakdown.md) for the sheet, and
  [equity-analysis.md](./equity-analysis.md) for the row's own detail press.
- A Presets row opens the preset editor in edit mode, carrying that
  preset's own id, and is built and shipped (issue #176) — the editor
  itself is, today, a field-less stub carrying only its own nav bar
  (titled `Edit Preset`) and a working back action; see
  [hand-ranges.md](./hand-ranges.md)'s "The Preset Editor" for what it
  still lacks, tracked separately in issue #177.
- The Presets tab's own persistent `+ New Preset` floating action button
  opens the same preset editor in create mode (titled `New Preset`), with
  no preset id, and is built and shipped (issue #176) — matching Analyze's
  `+ New Player` button below in placement and always-visible behaviour,
  except that the preset list has no cap that would ever hide it.
- Analyze's `+ New Player` control opens the card/range input sheet, and is
  built and shipped — a single persistent floating action button, fixed to
  the screen's bottom-right corner regardless of whether the empty state or
  the players list is showing, hidden once the list reaches its
  three-player cap (issue #155, superseding the empty state's own button
  and the list's own trailing row issue #87 first built). An **existing**
  player row's own preview tap reopens the same sheet to edit that player,
  and is built and shipped — see [equity-analysis.md](./equity-analysis.md)'s
  own "Tapping a row's preview edits that player" passage for what that does.
  See [hand-ranges.md](./hand-ranges.md).

## The Menu Overlay Is Not Built

The design file carries a floating `Menu` overlay — three rows, `Hand Range
Preset` (folder icon), `Calculation History` (clock icon), and `Setting` (cog
icon) — whose destinations duplicate three of the four tabs. The app does not
build this overlay: the tab bar is the only navigation surface. A later
session that opens the design file will still find the `Menu` frame there;
this is deliberate, not an omission, and is recorded in
[decisions/2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md](../decisions/2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md).
