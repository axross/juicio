# Glossary

The vocabulary the design specifies, grouped by the domain that defines it.
Each heading pairs with the spec of the same name under
[specs/](./specs).

## Equity Analysis

**Board** — the five community-card slots a calculation is run against.

**Player** — one participant in a calculation, entered as either an exact
holding or a **hand range**.

**Hole Cards** — the two specific cards a **player** holds, when entered as
an exact holding rather than a **hand range**.

**Equity** — a player's chance of winning the hand, given the current
**board** and every other player's holding, expressed as a percentage.

**Strength Band** — one of four labels — `Trash`, `Marginal`, `Value`,
`Nuts` — describing where a **card pair**'s equity falls along a continuous
low-to-high gradient.

**Equity Bin** — one bar's own slice of the Equity Breakdown histogram's
x-axis: a fixed range of **equity** values, holding a count of the **card
pairs** whose equity falls inside it. The histogram's own bin count varies
with how many bars its own drawing width can legibly show — a bin is a
slice of the axis, not a fixed-width unit of it.

## Hand Ranges

**Hand Range** — a set of **rank pairs**, selected on the **rank-pair
grid**, the 13×13 grid of every two-card starting hand.

**Rank Pair** — one cell of the rank-pair grid, one unit a **hand range**
is built from: an unordered pair of ranks plus whether the two cards share
a suit, such as `AKs` or `72o`. A pocket pair, `AA`, is offsuit by that same
test (its two cards never share a suit) — pocket-ness is a separate fact
about a rank pair, not a third value alongside suited/offsuit. Stands for
several **card pairs** — 6 for a pocket pair, 4 for suited, 12 for offsuit. The grid itself is named for this unit — **rank-pair
grid**, not "hand-range grid" — since the grid is where a **rank pair** is
selected, and the code (`src/shared/ui/selection-grid/`,
`src/shared/ui/hand-range-pane/hand-range-pane.tsx`) already uses that name.

**Card Pair** — two specific cards with their suits fixed, such as `A♠K♠`: a
data type, not a game concept of its own — it says nothing about who holds
the two cards. A player's **hole cards**, once resolved to two exact
cards, are represented by one; so is one specific holding a **rank pair**
stands for. The unit an **equity** calculation deals in, and the unit a
**rank pair**'s own count counts.

**Preset** — a named, reusable **hand range**, tagged along the four **tag
axes** so it can be found again by filter.

**Tag Axis** — one of four fixed categories a **preset** is tagged on:
`Position`, `# of Players`, `Depth`, and `Action`.

## Calculation History

**History Entry** — a record of one past calculation.

## Settings

**Build Channel** — which pipeline produced the running build: `Development`,
`Preview`, or `Production`. Shown in Settings' Technical Information block.

## Navigation

**Tab** — one of the app's four top-level destinations — Analyze, History,
Presets, Settings.
