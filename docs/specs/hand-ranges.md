# Hand Ranges

This document describes what the design specifies for hand ranges, the
presets built from them, and the sheet used to enter either a hand range or
an exact hand. None of it is built yet; this is a record of design intent,
not of shipped behaviour.

## Hand Range

A **hand range** is a set of starting-hand **combos** — two-card holdings —
selected on a 13×13 grid: pocket pairs (`AA` down to `22`) sit on the
diagonal, suited combinations (suffix `s`) sit above it, and offsuit
combinations (suffix `o`) sit below it. A selected cell is lime. Three
shorthand controls bulk-select common shapes in one tap — observed examples
are `A*s` (every suited ace), `55+` (every pocket pair from `55` up), and
`98s-54s` (a run of suited connectors) — and the current selection's combo
count is shown alongside them (`230 Combos`).

## Preset

A **preset** is a named, reusable hand range: a `Name` field (e.g. `HJ Call
against CO 4bet`), the hand-range grid above, and a `Tags` section of four
chip groups, the **tag axes**:

| Internal name | Display label | Observed values |
| --- | --- | --- |
| `position` | `Position` | `UTG`, `HJ`, `CO`, `BTN`, `SB`, `BB` |
| `players` | `# of Players` | `Heads-up`, `6max`, `9max` |
| `stack` | `Depth` | `200BB`, `150BB`, `100BB`, `75BB` |
| `action` | `Action` | `Open`, `Call`, `3bet`, `4bet` |

Each axis is multi-select. These four axis names are settled, not observed
directly: the design file disagrees with itself on both the axis set and
their labels between the preset editor's `Tags` section and the preset list's
filter row, and this is the reconciliation — see
[decisions/2026-08-26-unify-preset-filters-and-tags-on-four-axes.md](../decisions/2026-08-26-unify-preset-filters-and-tags-on-four-axes.md).

## The Preset Editor

Titled `Edit Preset`, the editor holds the `Name` field, the `Hand Range`
section (shorthand controls, combo count, the 13×13 grid), and the `Tags`
section (the four axes above), each showing the preset's current selection.

## The Preset List

Titled `Hand Range Preset`, the list carries a filter chip row — one chip per
tag axis — above a row of active-filter pills (e.g. `6max ✕`, `BTN ✕`,
`100 BB ✕`) for whichever filters are applied. Each preset row shows the
13×13 dot-matrix icon, the preset's name, a subtitle, and a chevron; a row
opens the preset editor. The subtitle's format — the four tag values joined
in a fixed order — is catalogued in
[conventions/design-system.md](../conventions/design-system.md).

## The Card/Range Input Sheet

Reached from Analyze's `+ New Player` or an existing player row (see
[navigation.md](./navigation.md)), this bottom sheet is where a player's hole
cards or hand range are set. It has two tabs: `Hand Range` and `Cards`.
Preset selection is a separate button, placed away from the tab row rather
than living inside either tab.

The `Cards` tab is a card picker: four fanned arcs of thirteen cards, one arc
per suit, feeding slots at the top of the sheet. The same picker serves both
a player's two hole cards and the board's five community cards — only the
slot count differs.

**This exact arrangement does not exist in the design file yet.** Two other
designs exist there — one with segmented tabs `Hand Range` / `Hand`, one with
segmented tabs `Preset` / `Hand range` / `Hand` where `Preset` embeds the
preset list in the tab row — and neither matches the sheet described above.
Both are superseded by it; this is settled behaviour ahead of the design,
see
[decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](../decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md).
