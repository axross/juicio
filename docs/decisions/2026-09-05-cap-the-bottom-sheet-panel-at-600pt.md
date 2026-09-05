---
status: accepted
---

# Cap the Bottom Sheet Panel at 600pt

`BottomSheet`'s panel (`src/shared/ui/bottom-sheet/bottom-sheet.tsx`) caps its
own rendered width at `PANEL_MAX_WIDTH` on a wide viewport — a tablet, an
unfolded foldable, or a landscape phone — rather than letting it grow with
the screen. The cap is not itself read off the design file: the source Figma
file draws no frame wider than this project's previous 430 design reference
(`docs/conventions/design-system.md`'s `430×932` sample), so there is no
design-file value to carry a wider cap forward from.

## What this project does

`PANEL_MAX_WIDTH` is `600`. The maintainer chose it directly, out of a set of
concrete candidates — 560, 600, 720, and a screen-proportional formula with
its own cap — to give the sheet's content more room on a wide device while a
single fixed cap still keeps the panel from growing unbounded on any of them,
the same motivation the original 430 cap had.

## Alternatives considered

- **560 and 720.** Both were concrete candidates alongside 600; the
  maintainer picked 600 among them with no further criterion recorded beyond
  the trade-off above.
- **A screen-proportional formula with its own cap**, rather than one fixed
  number. Rejected in favour of a single fixed cap, the same shape the
  original 430 reference already took.

## Consequences

A future change to this project's design reference width, or a new wide-device
form factor this project wants to support better, may call this exact figure
back into question; nothing here derives 600 from a formula a future change
could recompute, so revisiting it means choosing a new number the same way
this one was chosen.
