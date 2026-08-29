# Hand Ranges

This document describes hand ranges, the presets built from them, and the
sheet used to enter either a hand range or an exact hand. The hand-range
grid, its three shorthand chips, and the card/range input sheet's `Cards`
tab are built and shipped, as [The Card/Range Input Sheet](#the-cardrange-input-sheet)
below now describes. Presets — the preset editor, the preset list, and
selecting a saved preset from the sheet — remain a record of design intent,
not of shipped behaviour, as their own sections below say. Nothing described
here has been verified on a real device yet; this document describes
behaviour, not aspiration.

## Hand Range

A **hand range** is a set of **rank pairs** selected on a 13×13 grid: pocket
pairs (`AA` down to `22`) sit on the diagonal, suited rank pairs (suffix `s`)
sit above it, and offsuit rank pairs (suffix `o`) sit below it. A selected
cell is lime. Three shorthand chips bulk-select common shapes in one tap:
`A2s+` (every suited ace — the design file itself draws this chip's label as
`A*s`, which the maintainer ruled a design mistake and corrected; see
[decisions/2026-08-29-correct-the-suited-ace-shorthand-label-to-a2s-plus.md](../decisions/2026-08-29-correct-the-suited-ace-shorthand-label-to-a2s-plus.md)),
`55+` (every pocket pair from `55` up), and `98s-54s` (a run of suited
connectors, `98s` down to `54s`). A chip press adds its shape to whatever is
already selected rather than replacing it, so pressing more than one chip in
turn combines their selections. The current selection's card pair count —
each selected rank pair's own card pairs, summed — is shown alongside the
chips (`230 Combos`; that on-screen word is design copy, not this project's
own term for either **rank pair** or **card pair** — see
[conventions/design-system.md](../conventions/design-system.md)'s copy
conventions).

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
section (shorthand controls, card pair count, the 13×13 grid), and the
`Tags` section (the four axes above), each showing the preset's current
selection.

## The Preset List

Titled `Hand Range Preset`, the list carries a filter chip row — one chip per
tag axis — above a row of active-filter pills (e.g. `6max ✕`, `BTN ✕`,
`100 BB ✕`) for whichever filters are applied. Each preset row shows the
13×13 dot-matrix icon, the preset's name, a subtitle, and a chevron; a row
opens the preset editor. The subtitle's format — the four tag values joined
in a fixed order — is catalogued in
[conventions/design-system.md](../conventions/design-system.md).

## The Card/Range Input Sheet

Reached from Analyze's `+ New Player` (see [navigation.md](./navigation.md)),
this bottom sheet is where a player's holding is set: either their two
specific hole cards, or a hand range. It is built and shipped, as this
section now describes.

**This is the two-slot player-holding sheet, distinct from the board's own
five-slot variant.** The same picker this section describes is meant to also
feed the board's five community-card slots, differing only in slot count —
but that five-slot variant is not built; only the two-slot, player-holding
sheet described below exists. See
[operations/design-source.md](../operations/design-source.md) for the design
frames behind each of the two, including why an earlier reading of the
design file conflated them.

**Two tabs, no preset control.** The sheet has two tabs, `Hand Range` and
`Cards`, defaulting to `Hand Range`. Selecting a saved preset is not built:
the design file's own preset button is deliberately not present, because
there is no preset list or data layer yet for such a button to reach — see
[decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](../decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md).
Both tabs keep their own state independently: switching tabs never clears
the other tab's selection, so a player who fills in two hole cards, checks
the `Hand Range` grid, and switches back finds their two cards exactly as
left.

**The `Hand Range` tab** is the 13×13 grid, its three shorthand chips, and
the card pair count, all described in [Hand Range](#hand-range) above.

**The `Cards` tab** is a card picker: four fanned arcs of thirteen cards, one
arc per suit, feeding two preview slots above the fan. A card is chosen
either with a tap on a fan card or by dragging a finger across the arc and
releasing on the desired card; while dragging, the candidate card lifts
clear of the fan so it stays visible past the fingertip. A card already
sitting in either slot is skipped in its own suit's arc, styled as taken, and
cannot be picked again. Filling the two slots:

- With both slots empty, a picked card fills the first empty slot (slot 0
  before slot 1) — there is no game meaning to which physical slot a card
  lands in.
- With one or both slots already filled, tapping a filled slot **arms** it
  for overwrite (ringed in the accent colour); the next card picked from the
  fan replaces that slot's card and disarms. Tapping the already-armed slot
  again clears it instead, without arming or filling anything.
- With both slots full and neither armed, a fan tap or drag does nothing —
  a slot has to be armed first to be overwritten.

**Dismissing the sheet.** The sheet has no separate confirm button: a drag
past the handle's own dismiss threshold, or a backdrop tap, is the only way
to close it, and closing always resolves to exactly one outcome —
submitting the active tab's holding, or dismissing with a reason, never
both and never neither. The active tab at the moment of dismissal decides
which tab's selection counts; the inactive tab's own selection, if any, is
discarded. In order:

1. If neither tab has anything selected at all, the sheet dismisses with
   reason `NothingSelected`.
2. Otherwise, if the active tab is `Cards` with fewer than two cards picked,
   it dismisses with reason `IncompleteHoleCards`.
3. Otherwise, if the active tab is `Hand Range` with no rank pairs selected,
   it dismisses with reason `EmptyHandRange`.
4. Otherwise, the sheet submits the active tab's holding — two hole cards or
   a set of rank pairs.

Rule 1 taking precedence over rules 2 and 3 — an active `Hand Range` tab
left empty dismisses `EmptyHandRange` even when the inactive `Cards` tab was
also never touched — is this implementation's own reading of that
precedence, not something confirmed against the design file, since the
design draws no dismissal states at all.

**Still only design intent, not built:** the preset button, the board's own
five-slot variant of this sheet, and the preset list and editor that
[Preset](#preset), [The Preset Editor](#the-preset-editor), and
[The Preset List](#the-preset-list) below describe.

**This exact two-tab, no-preset-button arrangement does not exist in the
design file.** Two other designs exist there — one with segmented tabs
`Hand Range` / `Hand`, one with segmented tabs `Preset` / `Hand range` /
`Hand` where `Preset` embeds the preset list in the tab row — and neither
matches the sheet described above. Both are superseded by it; this is
settled behaviour ahead of the design, see
[decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](../decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md).
