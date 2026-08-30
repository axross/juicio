# Equity Analysis

This document describes what the design specifies for the Analyze screen and
its Equity Breakdown sheet. The Analyze tab's empty state is built and
shipped, as the Screen States section below now describes — together with the
board's own empty state and the `Players` section heading above it, both
built by issue #64. Everything else in this document — a card actually
filling a slot, the players list itself, the Calculating and Calculated
states, the Equity Breakdown sheet, and the equity engine behind all of it —
remains a record of design intent, not of shipped behaviour. The code for
this domain sits under `src/features/evaluations/` — the one name this
project gives it other than Analyze.

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
design's own literal value.

Each of the five slots is its own press target, built and shipped: pressing
one fires the `primaryAction` haptic (see
[conventions/haptics.md](../conventions/haptics.md)) and opens the board
input sheet below, focused on the slot pressed. A slot fades while a finger
is down on it and returns to its resting appearance on release. The row
carries no accessibility label of its own — five separate controls cannot be
reached through one collapsed element — so each slot instead carries a
button role and its own label naming its position and that it holds no card.

**A slot still never fills with a card.** The board renders its empty state
and nothing else: what the input sheet submits is dropped, exactly as a
submitted player holding is (see [The Players
Section](#the-players-section) below), because there is no board state and
no equity engine to hand it to yet.

## The Board Input Sheet

Pressing a board slot opens a bottom sheet holding the same fanned card
picker the card/range input sheet uses (see
[hand-ranges.md](./hand-ranges.md)), widened from two slots to five. It is
built and shipped, and it is drawn in the design at `103:10947`,
`145:21922`, and `145:21298` — see
[operations/design-source.md](../operations/design-source.md).

**The drag handle, then five preview slots, then the fan.** Nothing sits
between: no tab row, no heading, no preset control, and no confirm button.
The design draws a `Hand Range` / `Hand` tab row above the slots; entering a
hand range as the board is meaningless, so it is dropped — see
[decisions/2026-08-30-drop-the-hand-range-tab-from-the-board-input-sheet.md](../decisions/2026-08-30-drop-the-hand-range-tab-from-the-board-input-sheet.md).
The sheet is therefore about 47pt shorter than the player sheet and the two
do not line up vertically. The five preview slots are 48×75, 16 apart, in a
row 304 wide — the board's own geometry and the player sheet's, unchanged.

**The board's cards pack from the left, and no gap is reachable.** Position
carries meaning here, unlike a player's two hole cards: the first three
cards are the flop, the fourth the turn, the fifth the river. So the picker
runs under a different rule set from the player sheet's:

- Exactly one slot carries the accent focus ring at all times, and the next
  card picked from the fan lands in it.
- The sheet opens focused on the slot the user pressed, clamped to the first
  empty slot when the pressed slot is further right than that — so on an
  empty board every slot opens the sheet focused on the first.
- Picking a card fills the focused slot and moves focus one place right,
  stopping at the last slot: picking again there replaces that slot's card
  rather than wrapping back to the first.
- Tapping an unfocused slot moves focus there, clamped the same way.
- Tapping the focused slot while it holds a card clears it and shifts every
  card to its right one place left, closing the hole; focus then moves to
  the first empty slot, where the shortened run now ends. It does not stay
  on the slot it just cleared, the way the player sheet's does: the shift
  has refilled that slot with the card that was to its right, so focus
  staying there would aim the next pick at a card the user never asked to
  replace. Tapping the focused slot while it is empty does nothing.
- A card already on the board is skipped in its own suit's arc and cannot be
  picked a second time. Cards already dealt to a player are *not* excluded —
  there is no players list yet for such a card to come from.

**Closing the sheet reports exactly one outcome.** Closing with 0, 3, 4, or
5 cards submits a board carrying exactly those cards in order; closing with
1 or 2 dismisses, naming the incomplete board as the reason. An empty board
is a valid board — a preflop calculation runs against one — so backing out
having picked nothing submits rather than dismisses. One or two cards is
never a street, so there is nothing to submit.

Nothing reads what the sheet submits: both outcomes simply close it, and the
board behind stays five empty slots.

## The Players Section

Below the board, a `Players` heading is built and shipped, 32px beneath the
board, in the low-contrast text colour; the shipped empty state (see Screen
States below) begins 16px beneath it. `+ New Player` now opens the
card/range input sheet (see [hand-ranges.md](./hand-ranges.md)), and the
sheet's own dismissal contract resolves to either a submitted holding or a
dismissal reason. **The players list itself is still not built:** nothing
reads the sheet's submitted holding yet, so submitting it is indistinguishable
from dismissing it — the sheet opens, and whatever a player enters and
confirms is dropped on close, same as a cancelled entry. There is no existing
player row yet either, since there is no list to hold one.

## Screen States

The Analyze screen has three states:

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
- **Calculating** — not built. A thin lime progress bar sits directly
  beneath the board. Player rows are present, with no result shown yet.
- **Calculated** — not built. The progress bar is gone; each player row
  carries a result and a chevron.

## Player Kinds

A player is one of two kinds:

- An **exact holding** — two specific hole cards (for example `A♡T♡`) —
  rendered as the two cards next to a single result percentage.
- A **hand range** — rendered as a 13×13 dot-matrix icon, a name (which
  truncates when long, e.g. `BTN Call against UT…`), a subtitle, an averaged
  result percentage (`Avg. 17%`), and a `See Details` link that opens the
  Equity Breakdown sheet below. A range player built ad hoc rather than from
  a saved preset — named `Custom` in the design — shows a card pair count
  (e.g. `147 Combos`; that on-screen word is design copy, not this
  project's own domain term — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions) in place of the subtitle.

Both kinds share one row layout and are swipe-to-delete: a swipe progresses
through `No` / `Started` / `Almost` / `Ongoing` dismissal states to a red
background with a trash icon, independent of whether the row's calculation is
`Done` or still `Ready`. A row is 393×96 at rest, collapsing to 393×48 while
mid-swipe.

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
