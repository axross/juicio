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
connectors, `98s` down to `54s`). A chip press toggles exactly its own rank
pairs: if any of them is not yet selected, the press selects all of them; if
every one of them is already selected, the press deselects all of them. Rank
pairs outside a chip's own set are never touched either way, which is what
still lets a player combine more than one chip's shape in the same range —
pressing `55+` after `A2s+` still keeps every suited ace the first chip
selected. A chip whose own rank pairs are all currently selected — the
same condition its own press checks to decide whether to select or
deselect — fills lime, its label turns lime, and a lime ring draws around
it, so a player can tell a shorthand is fully applied without counting
cells; the fill and the label reuse the grid's own selected-cell tokens.
The current selection's card pair
count — each selected rank pair's own card pairs, summed — is shown
alongside the chips (`230 combos`; that on-screen word is design copy, not
this project's own term for either **rank pair** or **card pair** — see
[conventions/design-system.md](../conventions/design-system.md)'s copy
conventions).

## Preset

A **preset** is a named, reusable hand range: a `Name` field (e.g. `HJ Call
against CO 4bet`), the rank-pair grid above, and a `Tags` section of four
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

**Modal, and rendered above the tab bar.** The sheet is modal in the
modal-versus-modeless sense — the frontmost surface among the UI this app
renders today, covering the tab bar the four-tab shell draws
([navigation.md](./navigation.md)) rather than sitting clipped beneath it.
It is rendered through an in-tree portal mounted at the app root, above
every screen a tab hosts, precisely so it can paint over that tab bar; see
[decisions/2026-08-29-render-the-bottom-sheet-through-an-in-tree-portal.md](../decisions/2026-08-29-render-the-bottom-sheet-through-an-in-tree-portal.md)
for why. A future modal dialog, once one exists, would render above this
sheet in turn.

The sheet's panel caps at 600 wide and centres above that width, rather
than stretching to fill a wider screen — a tablet or an unfolded foldable
otherwise inflates the fan, the grid, and the preview slots past their
designed scale, since each scales proportionally to the panel's own
measured width. 600 was chosen directly with the maintainer rather than
read off the design file; see
[conventions/design-system.md](../conventions/design-system.md)'s Bottom
Sheet Panel Width entry. Below 600 nothing changes.

**This is the two-slot player-holding sheet, distinct from the board's own
five-slot variant.** Both are built now, on one shared picker: the board's
own input sheet feeds the same fanned card picker into five community-card
slots, under its own left-packed fill rules — see
[equity-analysis.md](./equity-analysis.md)'s The Board Input Sheet for what
differs. The picker itself carries no copy for either sheet; whichever sheet
mounts it supplies its slot labels. See
[operations/design-source.md](../operations/design-source.md) for the design
frames behind each of the two, including why an earlier reading of the
design file conflated them.

**Two tabs, no preset control.** The sheet has two tabs, `Cards` and
`Hand Range`, defaulting to `Cards`. Selecting a saved preset is not built:
the design file's own preset button is deliberately not present, because
there is no preset list or data layer yet for such a button to reach — see
[decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](../decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md).
Both tabs keep their own state independently: switching tabs never clears
the other tab's selection, so a player who fills in two hole cards, checks
the `Hand Range` tab's rank-pair grid, and switches back finds their two
cards exactly as left.

**The `Cards` tab** is a card picker: four fanned arcs of thirteen cards, one
arc per suit, feeding two preview slots above the fan. A card is chosen
either with a tap on a fan card or by dragging a finger across the arc and
releasing on the desired card; while dragging, the candidate card lifts
clear of the fan so it stays visible past the fingertip. A card already
sitting in either slot is skipped in its own suit's arc, styled as taken, and
cannot be picked again — there is no game meaning to which physical slot a
card lands in. **A card already spoken for elsewhere is excluded too**
(issue #99): every card already on the board, and every card another player
already holds as an exact holding, is skipped in its own suit's arc and
cannot be picked — rendered dimmed with a hairline slash across its face,
distinct from the accent "taken" treatment above, since the two mean
different things (a card sitting in this sheet's own slot, versus a card
this sheet can never place no matter what it does). The player currently
being edited is the one exception: that player's own two cards stay
pickable and clearable in its own reopened sheet, never rendered as
unavailable, or an edit could never be completed. A hand-range player
excludes nothing of its own — see [equity-analysis.md](./equity-analysis.md)'s
The Players List for why. One of the two slots always has **focus** —
ringed in the accent colour — there is no state where neither slot has it.
Filling the two slots:

- A picked card always replaces the focused slot's card, filling it if it
  was empty; focus then advances to the other slot. This is always
  actionable: unlike an earlier arm-for-overwrite model this superseded (see
  [decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md](../decisions/2026-08-29-replace-card-slot-overwrite-arming-with-always-on-focus.md)),
  a fan tap or drag with both slots already full is never a dead end — it
  simply replaces whichever slot is focused.
- Tapping the *other* slot — the one that does not have focus — moves focus
  there, whether that slot is empty or filled; neither slot's own card
  changes.
- Tapping the *focused* slot clears its card if it holds one; focus stays on
  it rather than moving anywhere, so the next fan pick fills the slot just
  cleared. Tapping the focused slot while it is already empty does nothing.

The tab starts focused according to whichever pair of slots the picker
mounts against — on the sheet's first open and on every reopen alike, never
carrying forward whatever a previous session left focused: slot 0 when both
slots are empty, and the still-empty slot when exactly one already carries a
card, never the slot already filled. This keeps a completed first pick from
being silently overwritten by what the user means as their second.

**The `Hand Range` tab** is the 13×13 grid, its three shorthand chips, and
the card pair count, all described in [Hand Range](#hand-range) above.
**Deliberately untouched by issue #99's own exclusion rule above:** every
one of the grid's 169 rank pairs stays selectable and the card pair count is
unchanged, whatever the board or another player holds — a hand range is a
set of rank pairs, not two specific cards, so there is nothing on this tab
for the board or another player's exact holding to put out of reach.

**Known accessibility gap in the fan.** The arc's own drag-to-pick gesture
is a single `Gesture.Pan()` shared across all thirteen cards in a suit's
arc (`src/shared/ui/cards-pane/cards-pane.tsx`), so each fan card is
rendered `pointerEvents="none"` to let a touch reach that gesture instead
of the card — which also removes all fifty-two per-card accessible
elements from hit-testing. With VoiceOver or TalkBack on, explore-by-touch
over the fan therefore finds nothing; only linear swipe navigation reaches
a card's own label, with activation from there depending on the
platform's own double-tap fallback rather than anything this component
provides. This is a known residual risk, not a fix: whether an
accessibility-actions fix is worth building, or this gap is accepted, is
the maintainer's call and is not settled here — and, like everything else
in this document (see its own opening paragraph), unverified on a real
device.

**Dismissing the sheet.** The sheet has no separate confirm button: a tap
on the handle, a drag past the dismiss threshold, or a backdrop tap are the
only ways to close it, and closing always resolves to exactly one outcome —
submitting the active tab's holding, or dismissing with a reason, never
both and never neither. The drag surface is the handle and the tab row
together, not the handle alone, so a drag started anywhere across that top
chrome follows the finger; a tap only closes the sheet from the handle
itself — a tap on a tab still selects it, never closes the sheet. The
active tab at the moment of dismissal decides
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

Rule 1 takes precedence over rules 2 and 3 — an active `Cards` tab with
one card picked dismisses `IncompleteHoleCards` even when the inactive
`Hand Range` tab holds a rank pair, and an active `Hand Range` tab left
empty dismisses `EmptyHandRange` even when the inactive `Cards` tab holds
one abandoned card — and the maintainer has confirmed this precedence,
even though the design draws no dismissal states at all for it to be
read off directly. Rule 1 only fires when *neither* tab carries any
selection at all, so a single card or rank pair left on the inactive tab
is enough to keep it from firing, leaving the active tab's own rule to
decide instead.

**Rule 2, `IncompleteHoleCards`, now reports itself** (issue #99): the
Analyze screen raises a toast naming what was discarded — a different
sentence depending on whether the sheet was adding a fresh player or
editing an existing one — and the previously stored player, if any, is
left exactly as it was. Rules 1 and 3, `NothingSelected` and
`EmptyHandRange`, still close silently, raising nothing; see
[equity-analysis.md](./equity-analysis.md)'s The Toast section for the
full behaviour this applies to both sheets, and
[decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md](../decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md)
for why the line falls where it does.

**Still only design intent, not built:** the preset button, and the preset
list and editor that [Preset](#preset), [The Preset Editor](#the-preset-editor),
and [The Preset List](#the-preset-list) below describe. The board's own
five-slot variant of this picker is no longer among them — see
[equity-analysis.md](./equity-analysis.md)'s The Board Input Sheet.

**This exact two-tab, no-preset-button arrangement does not exist in the
design file.** Two other designs exist there — one with segmented tabs
`Hand Range` / `Hand`, one with segmented tabs `Preset` / `Hand range` /
`Hand` where `Preset` embeds the preset list in the tab row — and neither
matches the sheet described above. Both are superseded by it; this is
settled behaviour ahead of the design, see
[decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md](../decisions/2026-08-26-give-the-card-sheet-two-tabs-and-a-preset-button.md).
