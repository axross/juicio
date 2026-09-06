# Design Source

Where this project's design file lives, how to read it without being misled
by its own naming, and which frames a session should trust for what.

## The File

The design file is at
`https://www.figma.com/design/vkZzv1l45PBcVi5Wp92Eqg`. It carries one page
only, `UI Components`, holding roughly forty top-level frames plus a set of
component and icon symbols — there is no second page to check.

## Reading It From a Session

A session with access to the Figma MCP server MUST open frames by node id
rather than trusting a frame's name — see
[Frame Naming Misleads](#frame-naming-misleads) below — and MUST record any
new reading in [specs/](../specs) and, where a decision follows from it, in
[decisions/](../decisions), in the same change that reads it. A reading that
stays only in a session's own transcript is lost the moment the session ends;
this document and [specs/](../specs) exist precisely because a prior reading
was not recorded and had to be redone.

## Frame Naming Misleads

Frame names in the file follow two unrelated conventions, and neither
reliably describes what a frame actually renders:

- **Japanese, content-describing**: `<subject>：シングル` / `<subject>：コレクション`,
  sometimes several comma-separated (e.g.
  `ハンドレンジ：コレクション、ボード：シングル`). `シングル` means one instance
  shown in detail; `コレクション` means a list.
- **English, screen-and-state**: `Analyze/Empty`, `History/Example`,
  `Settings`.

Two frames are named in ways that actively mislead:

- `293:21379` and `246:43909` are both named `Hole Card：シングル`, but both
  render the **Equity Breakdown** bottom sheet, not a card picker.
- `600:31737` is named `Presets/Empty`, but renders a **fully populated
  six-item** preset list, not an empty state.

## Which Frames Are Authoritative for What

| Subject | Authoritative frame(s) | Node id(s) |
| --- | --- | --- |
| Analyze — empty, calculating, calculated | `Analyze/Empty`, `Analyze/Calculating`, `Analyze/Calculated` | `518:29363`, `518:30001`, `518:27279` |
| Analyze — mixed player kinds, populated board | `Home` | `142:13177` |
| History — empty, populated | `History/Empty`, `History/Example` | `600:29952`, `600:30085` |
| Presets list (despite its name) | `Presets/Empty` | `600:31737` |
| Presets list, titled and filterable | `ハンドレンジ：コレクション` | `145:16124`, `145:22333` |
| Preset editor (`Edit Preset`) | `Hand Range：シングル` | `281:61845` |
| Equity Breakdown sheet (despite its name) | `Hole Card：シングル` | `293:21379` (high-saturation, authoritative palette), `246:43909` (muted, superseded) |
| Settings | `Settings` | `600:31803` |
| Settings, including the hidden, still-draft `Calculation Accuracy` section | `iPhone 14 & 15 Pro - 3` | `429:27777` |
| Menu overlay (dropped — see [the decision record](../decisions/2026-08-26-drop-the-menu-overlay-for-the-tab-bar.md)) | `Menu` | `145:22280` |
| Colour, effect, type, and component definitions | `Components` | `11:2338` |
| Equity-to-strength legend annotation | loose text layers, parented to the page | `293:21367`–`293:21378` |
| Splash screen | `Splash Screen` (empty, zero child layers — nothing to read) | `388:21681` |
| Card/range input sheet — three-tab (`Preset`/`Hand range`/`Hand`), two-slot: a **player's holding**, not the board | `Cards` frame's `Hand` tab, and the frame's `Hand range` tab | `98:7317`, `127:16000` |
| That sheet's fanned card picker, at its four progressive states | — | `186:34960`, `103:4982`, `103:5666`, `103:5358` |
| That picker's one-suit arc, and the card group inside it | arc, card group | `103:4759`, `103:4760` |
| That sheet's 13×13 rank-pair grid instance | — | `127:16307` |
| That sheet's shorthand chip row | — | `127:16815` |
| That sheet's tab row | — | `128:33644` |
| Board input sheet — two-tab (`Hand Range`/`Hand`), **five**-slot: the board's five community cards, not a player's holding | — | `103:10947`, `145:21922`, `145:21298` |

The equity-to-strength legend (`293:21367`–`293:21378`) and one further
annotation (`442:29621`, a text layer literally named for the CSS box-shadow
it represents) are parented directly to the page rather than to any frame,
so a frame-by-frame sweep of the page will not surface them; they must be
found separately.

**The History empty state's own hourglass-and-chips illustration
(`src/shared/ui/empty-state/hourglass-illustration.tsx`, issue #263) is not
in this file at all.** `History/Empty` (`600:29952`) above still renders the
shark-and-fish illustration Analyze uses, and that the Preset list's error
and filtered-empty states also use; the hourglass was authored directly in
code, so a session looking for it in Figma will not find it there. The
Preset list's never-saved state's own illustration
(`src/features/presets/ui/preset-list-screen/aa-corner-illustration.tsx`) is
likewise code-authored and absent from this file — see
[decisions/2026-09-05-author-the-presets-never-saved-illustration-in-the-repository.md](../decisions/2026-09-05-author-the-presets-never-saved-illustration-in-the-repository.md).

## The Two Card/Range Sheet Arrangements Share No Slot Count

The design file draws two different arrangements for entering cards or a
range, and neither one's own name says which one it is. The **three-tab**
arrangement (`98:7317`, `127:16000` above) has **two** card slots — it is a
player's holding, `docs/specs/hand-ranges.md`'s subject. The **two-tab**
`Hand Range` / `Hand` arrangement (`103:10947`, `145:21922`, `145:21298`) has
**five** card slots — it is the board's own five-community-card input, not an
alternate reading of the player sheet.

Before this reading was recorded, the spec described both arrangements
without saying which slot count went with which, and that ambiguity cost
real time working out which frame actually specified the player sheet this
change built. A session reading either arrangement going forward MUST check
its slot count before treating it as authoritative for a player's holding.

## What the Three Board Input Frames Say

The board's own input sheet was built from `103:10947`, `145:21922`, and
`145:21298` for issue #85, and this is that reading. Recorded here rather
than left in a session transcript, per [Reading It From a
Session](#reading-it-from-a-session) above; what shipped from it is in
`docs/specs/equity-analysis.md`.

- **The slot geometry matches the board's own and the player sheet's
  exactly**: five 48×75 slots, 16 apart, in a row 304 wide. There is no
  third size in this file for a card slot.
- **`145:21298`** draws the empty state, with the first slot's dashed
  outline in the accent colour. **`145:21922`** draws the same focus
  treatment on a filled first slot. So the board sheet takes the player
  sheet's focus model unchanged — one accent ring, always on exactly one
  slot, on an empty and a filled slot alike.
- **All three draw a `Hand Range` / `Hand` tab row above the slots, and it
  is deliberately not built** — see
  [decisions/2026-08-30-drop-the-hand-range-tab-from-the-board-input-sheet.md](../decisions/2026-08-30-drop-the-hand-range-tab-from-the-board-input-sheet.md).
  Nothing replaced it: the preview slots sit directly under the drag handle.
- **None of the three draws a pressed state for a board slot, or any
  dismissal state for the sheet.** Both are settled ahead of the design —
  the pressed state by the maintainer's own pick from an options exhibit at
  issue #85, the dismissal rules by that issue's plan — not read from the
  file.

The card-geometry warning below applies to these frames too: their fan is
the same fanned arc, so their per-card bounding boxes are wrong the same
way.

## `get_metadata`'s Card Bounding Boxes Are Wrong

**Do not trust `get_metadata`'s per-card bounding boxes inside the fanned
arc (`103:4759`).** They place the ace roughly 13 units further right than
the card actually renders — following them produced a phantom overflow past
the arc's own edge and misplaced card glyphs, both caught only by checking
against a rendered export.

The card centres actually used were recovered a different way: measuring the
suit pip in the design's own 399×88 PNG export of the arc. Each card face
carries a 12×12 suit-pip icon at a known offset from that card's own centre,
so the pip's measured position fixes the card's centre regardless of the
card's rotation within the fan. The span recovered this way, 389.47, matches
the width Figma itself declares for the arc group — 389.0975 — closely
enough to corroborate the method; the per-node bounding boxes `get_metadata`
returns for the same arc do not. A future session reading this or any other
fanned-card frame MUST NOT trust `get_metadata`'s per-card boxes and should
recover card geometry from a rendered export instead.

## A Card's Rank and Suit Are Icon Components, Not Text

A playing card's rank and suit glyphs are SVG icon components, not text
layers — reading them as text (or generating a text-node label for them)
produces nothing, since there is no text node to read. The ten's rank icon
draws the glyph `T`, not `10`.

## What This Document Does Not Cover

The colour, type, spacing, and icon values read from the file are catalogued
in [conventions/design-system.md](../conventions/design-system.md), not
repeated here. What each screen specifies is catalogued per domain under
[specs/](../specs).
