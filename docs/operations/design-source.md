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

The equity-to-strength legend (`293:21367`–`293:21378`) and one further
annotation (`442:29621`, a text layer literally named for the CSS box-shadow
it represents) are parented directly to the page rather than to any frame,
so a frame-by-frame sweep of the page will not surface them; they must be
found separately.

## What This Document Does Not Cover

The colour, type, spacing, and icon values read from the file are catalogued
in [conventions/design-system.md](../conventions/design-system.md), not
repeated here. What each screen specifies is catalogued per domain under
[specs/](../specs).
