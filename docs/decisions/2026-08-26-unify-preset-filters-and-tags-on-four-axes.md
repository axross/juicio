---
status: accepted
---

# Unify Preset Filters and Tags on Four Axes

The design file disagrees with itself about how a preset is tagged and
filtered. The preset editor's `Tags` section groups `Positions`, `Players`,
`Stacks`, and (truncated) `Acti[ons]`; the preset list's filter row instead
shows `Depth`, `# of Players`, `Position`, and a fourth chip cut off entirely
before it can be read.

Both are replaced by one set of four axes, with internal names
`position` / `players` / `stack` / `action` and display labels
`Position` / `# of Players` / `Depth` / `Action`, used identically for
tagging a preset and for filtering the preset list.

Two alternatives were rejected. Keeping the 430-wide screen's own labels
(`Positions` / `Players` / `Stacks` / `Actions`) was rejected because
`Players` is ambiguous on its own — on one screen it means table size, on
another (the Analyze screen's own `Players` section) it means a calculation
participant — and reusing the word for both meanings in one app was judged
worse than renaming it. A three-axis set dropping `Action` entirely was also
rejected: `Action` is what distinguishes preset names the app's own examples
are built on, such as `BTN Open` versus `BTN Call against HJ 3bet` — without
it, filtering could not tell those two presets apart.

Every preset's tags and every filter chip are now understood against this one
set of four axes, rather than against whichever of the design's two
disagreeing sets a given screen happened to draw.
