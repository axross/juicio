# Glossary

The vocabulary the design specifies, grouped by the domain that defines it.
Each heading pairs with the spec of the same name under
[specs/](./specs).

## Equity Analysis

**Board** — the five community-card slots a calculation is run against. A
board may hold zero, three, four, or five cards.

**Player** — one participant in a calculation, entered as either an exact
holding or a **hand range**.

**Hole Cards** — the two specific cards a **player** holds, when entered as
an exact holding rather than a **hand range**.

**Equity** — a player's chance of winning the hand, given the current
**board** and every other player's holding, expressed as a percentage. An
exact-holding player shows one equity figure; a hand-range player shows the
figure averaged across every **combo** the range contains, alongside the
per-combo breakdown in the Equity Breakdown sheet.

**Strength Band** — one of four labels — `Trash`, `Marginal`, `Value`,
`Nuts` — describing where a **combo**'s equity falls along a continuous
low-to-high gradient. The bands have no fixed boundaries; they name regions
of the gradient, not buckets a combo is sorted into.

## Hand Ranges

**Hand Range** — a set of starting-hand **combos**, selected on the 13×13
grid of every two-card starting hand.

**Combo** — one specific two-card starting hand, such as `AKs` or `72o`; the
unit a **hand range** is built from and a **strength band** is assigned to.

**Preset** — a named, reusable **hand range**, tagged along the four **tag
axes** so it can be found again by filter.

**Tag Axis** — one of four fixed categories a **preset** is tagged on:
`Position`, `# of Players`, `Depth`, and `Action`. A preset can carry more
than one value on the same axis.

## Calculation History

**History Entry** — a record of one past calculation, shown grouped under
the **board** it was run against.

## Settings

**Build Channel** — which pipeline produced the running build: `Development`,
`Preview`, or `Production`. Shown in Settings' Technical Information block.

## Navigation

**Tab** — one of the app's four top-level destinations — Analyze, History,
Presets, Settings — always reachable from the tab bar.
