# Equity Analysis

This document describes what the design specifies for the Analyze screen and
its Equity Breakdown sheet. The Analyze tab's empty state, the board's own
empty state, the `Players` heading above it (issue #64), and — as of issue
#87 — the players list itself, both its row kinds and its swipe-to-delete
gesture, are built and shipped, as the sections below now describe.
Everything else in this document — a card actually filling a board slot, the
Calculating and Calculated states, a row's result percentage or chevron, the
Equity Breakdown sheet, and the equity engine behind all of it — remains a
record of design intent, not of shipped behaviour.

## The Board

The top of the Analyze screen carries the **board**: five community-card
slots. Its **empty** state is built and shipped: each slot is 48×75 with an
8px radius and a 1px dashed border, in a centred row with 16px of padding
above and below and 16px between slots. The board shares the nav bar's own
`background.neutral.subtle` background and draws the `Sheet` shadow at its
own bottom edge instead of the nav bar drawing it at its own — the nav bar
and the board read as one unbroken top band, the design's own presentation —
and stays pinned above the players list rather than scrolling away with it.
See [conventions/design-system.md](../conventions/design-system.md) for the
board's colour tokens, including why its slot border departs from the
design's own literal value. A slot fills with a card as one is added — not
built yet, since no card input sheet exists to fill it from.

## The Players Section

Below the board, a `Players` heading is built and shipped, 32px beneath the
board, in the low-contrast text colour; the shipped empty state, or the
players list once it holds one to six players (see Screen States below),
begins 16px beneath it. `+ New Player` — the empty state's own button, or the
list's own trailing row once it holds at least one player — opens the
card/range input sheet (see [hand-ranges.md](./hand-ranges.md)), and the
sheet's own dismissal contract resolves to either a submitted holding or a
dismissal reason. **A submitted holding now becomes a row:** it is appended
to the players list, in submission order, replacing the empty state if this
was the first player. A dismissal adds no row, the same as before.

## Screen States

The Analyze screen has four states:

- **Empty** — no players yet, built and shipped: the board's five empty
  slots, the `Players` heading, and — beneath that heading — a
  shark-and-fish illustration, the heading `Nothing in the water yet`, the
  description `Add 2 players to start calculation.`, and a lime
  `+ New Player` pill button that opens the card/range input sheet (see
  [The Players Section](#the-players-section) above and
  [hand-ranges.md](./hand-ranges.md)) — the copy is settled in
  [conventions/design-system.md](../conventions/design-system.md). It ships
  without the design's share icon: the nav bar is title-only on every tab;
  see [navigation.md](./navigation.md).
- **Populated** — one to six players and no calculation started, built and
  shipped (issue #87): the players list (see below) replaces the empty
  state, its own trailing `New Player` row (gone at six) offering the same
  sheet. No result of any kind renders for any row in this state — the
  equity engine that would produce one does not exist. Not a name the
  design file itself uses — that file's own `Calculation` axis (`Done` /
  `Ready`) names a property of one *row*, not a state of the whole screen,
  and this document picks a distinct name for the screen state precisely so
  the two are never read as the same thing.
- **Calculating** — not built. A thin lime progress bar sits directly
  beneath the board.
- **Calculated** — not built. The progress bar is gone; each player row
  carries a result and a chevron.

## The Players List

Built and shipped (issue #87), replacing the empty state once it holds at
least one player. Holds **up to six players** — a product rule this change
introduces; no earlier document stated a maximum, and the design file itself
draws no cap. A submitted holding is appended to the end, in submission
order; nothing validates it against another player already in the list or
against the board, and two players may hold identical cards. The list is
**in memory only, for the app's own lifetime** — nothing is written to
SQLite or `AsyncStorage`, so it is empty again after a cold start; the data
model that would carry persistence belongs with the equity engine, not this
change.

Every row renders its holding's own preview, a label, and a subtitle, at the
row's own 393×96 size (16px padding, a 64×64 preview column at its own
left edge, a two-line meta block starting at x 96) — **no result
percentage, no chevron, and no `See Details` link render on any row**: the
design's own result column has nothing to show until the equity engine
exists, and that engine's own Equity Breakdown sheet has no destination to
open into yet either.

## Player Kinds

A player is one of two kinds:

- An **exact holding** — two specific hole cards — rendered as the two
  cards, overlapping, next to a label in the design's own rank-and-suit
  notation (`A♡T♡`) and a `Hole cards` subtitle.
- A **hand range** — rendered as a 13×13 dot-matrix preview next to a
  `Custom` label (every range player this change can build is ad hoc rather
  than from a saved preset — there is no preset store yet) and a card pair
  count subtitle (`{{count}} combos`; that on-screen word is design copy,
  not this project's own domain term — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions). The design's own averaged result percentage and
  `See Details` link are design intent only — see The Players List above.

Both kinds share one row layout and are swipe-to-delete: a swipe progresses
through `No` / `Started` / `Almost` / `Ongoing` dismissal states to a
full-bleed red (`solid.destructive.rest`) panel holding a 20×20 trash icon,
right-aligned with 16px of padding, vertically centred. The row itself sits
at x **−109** at `Started` and x **−247** at `Almost` — the design's own
measured offsets, read from Figma node `423:24648` — with **−247** as this
change's own commit threshold: carrying a swipe that far, or further,
deletes the player without a further tap, exactly as tapping the revealed
panel does. A release short of that threshold either springs back to `0` or
settles at the `Started` offset, whichever the release itself travelled
further past; either way the row stays in the list. At `Ongoing` the row
itself is gone and the remaining band collapses from 96 tall to 48 before
disappearing — implemented as one continuous collapse from 96 to 0, since
the design's own 48-tall snapshot reads as a point along that same
collapse, not a distinct rest state. Deletion is immediate: no confirmation
and no undo, and removing the last player returns the section to the empty
state.

## The Equity Breakdown Sheet

`See Details` on a hand-range player opens a bottom sheet with a drag handle.
Its header repeats that player's icon, name, subtitle, and averaged result
(`Avg. 17%`). Below the header:

- a heading, `Equity Breakdown`;
- a four-item legend naming the four **strength bands** — `Trash`,
  `Marginal`, `Value`, `Nuts` — each with a colour swatch;
- a histogram: the y-axis is labelled `Combos` (design copy — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions), from `0` to `20`; the x-axis is labelled `Equity`, from `0`
  to `100`. Each bar is one equity bin; a bar's height is the number of
  card pairs that fall in it. Bar colour is not
  four flat colours — it varies continuously along the x-axis, from cyan
  through yellow-green and orange to red, so a bar's colour and its band
  label agree only approximately. There are no equity values at which a bar's
  colour actually changes band; see
  [decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md](../decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md).
- a heading for the currently highlighted bin, in the shape `Equity <hi>
  -<lo>%` (the design's own example, `Equity 75 -70%`, is internally
  inconsistent — a descending range with no explicit sign on the second
  number — and no corrected format has been settled);
- a two-column list of the card pairs in the highlighted bin, each row
  showing two cards and a result percentage (every row in the observed
  example reads `74.8%`, which is a placeholder value, not a rule).

The four strength-band colours are catalogued in
[conventions/design-system.md](../conventions/design-system.md). The
histogram's own continuous gradient between them carries no further
catalogued values; see above for why it draws no boundary between bands.
