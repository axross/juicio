# Equity Analysis

This document describes what the design specifies for the Analyze screen and
its Equity Breakdown sheet. The Analyze tab's empty state, the board's own
empty state, and the `Players` section heading above it, built by issue #64,
are built and shipped — and, as of issue #87, so is the players list itself,
both its row kinds and its swipe-to-delete gesture, as the sections below now
describe. **As of issue #99**, so are the board's own populated state, both
card pickers' exclusion of a card already spoken for elsewhere, and the
Analyze toast — see The Board, The Board Input Sheet, The Toast, and The
Players Section below. Everything else in this document — the Calculating
and Calculated states, a row's result percentage or chevron, the Equity
Breakdown sheet, and the equity engine behind all of it — remains a record
of design intent, not of shipped behaviour. The code for this domain sits
under `src/features/evaluations/` — the one name this project gives it other
than Analyze.

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
is down on it and returns to its resting appearance on release. Each slot
carries a button role and its own label — naming its position and that it
holds no card while empty, or its position and the card it holds once
filled. The row above them keeps a summary of its own — `Board, no cards
yet` while every slot is empty, or every filled slot's own spoken card name,
joined, once at least one holds a card — announced through a `summary` role
rather than by collapsing into a single accessible element, since collapsing
would make the five controls beneath it unreachable. The board input sheet's
own slots row solves the same problem the same way.

**The board now holds state of its own, and a filled slot renders the card
it holds** (issue #99). The board input sheet's submitted `Board` reaches a
Zustand store scoped to this feature
(`src/features/evaluations/adapter/use-board.ts`) rather than being
dropped, for the app's own lifetime — in memory only, exactly like the
players list below, so the board is empty again after a cold start. A
filled slot renders the same 48×75, 8px-radius card face the input sheet's
own preview slots already draw; an empty slot keeps the dashed outline it
always has. Submitting an empty board — a valid submission in its own right,
not the absence of one, see The Board Input Sheet below — clears any cards
the row was showing back to five empty slots.

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
  picked a second time. **A card already dealt to a player as an exact
  holding is skipped too** (issue #99) — rendered dimmed with a hairline
  slash across its face, its accessibility label saying it is unavailable
  and carrying a disabled accessibility state, distinct from the accent
  treatment a card in this sheet's own preview slots renders in: the two
  mean different things, one a card the user picked here, the other a card
  spoken for elsewhere and out of reach no matter what this sheet does. A
  hand-range player contributes no such exclusion — a range is a set of
  rank pairs, not two specific cards, so there is nothing of its own to keep
  out of reach.

**Closing the sheet reports exactly one outcome.** Closing with 0, 3, 4, or
5 cards submits a board carrying exactly those cards in order, replacing
whatever the board previously held; reopening the sheet afterward seeds its
five preview slots from that same board. Closing with 1 or 2 dismisses,
naming the incomplete board as the reason — the previously stored board is
left exactly as it was, and the Analyze screen's own toast (see The Toast
below) reports that the input was reverted. An empty board is a valid
board — a preflop calculation runs against one — so backing out having
picked nothing submits rather than dismisses, and raises no toast. One or
two cards is never a street, so there is nothing to submit.

## The Toast

A board input sheet closed at one or two cards, or a card/range input sheet
closed on the `Cards` tab with exactly one hole card, discards the sheet's
own pick and reports it: the Analyze screen
(`src/features/evaluations/ui/analyze-screen/analyze-screen.tsx`) raises a
toast (`src/features/evaluations/ui/toast/toast.tsx`, issue #99) naming what
happened. The board's own message is the same regardless of which of the
two invalid counts the sheet stopped at; the player sheet's own message
differs by whether the sheet was adding a fresh player or editing an
existing one — see [conventions/design-system.md](../conventions/design-system.md)'s
Japanese Copy table for the four strings this covers. A dismissal with
nothing worth reporting the loss of — the card/range input sheet closed
with nothing selected on either tab, or closed on an empty `Hand Range` tab
— raises no toast at all; see
[decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md](../decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md)
for why. Submitting a board or a holding never raises it either, an empty
board included — see The Board Input Sheet above and
[hand-ranges.md](./hand-ranges.md)'s own Dismissing the Sheet section.

The toast shows one message at a time: a later dismissal replaces whatever
it is already showing rather than stacking a second one, and restarts its
own roughly-five-second clock. It clears itself with no interaction after
that delay, and a tap on it clears it immediately. It announces itself to
VoiceOver and TalkBack the moment it appears
([conventions/accessibility.md](../conventions/accessibility.md)), and its
own dismiss affordance carries an accessibility label distinct from the
message it reports. It fires no haptic of its own: the sheet's own
`sheetClose` haptic already fired on the same interaction that raised it —
see [conventions/haptics.md](../conventions/haptics.md).

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
was the first player. A dismissal adds no row, and — for two of its four
reasons — raises the toast above instead; see The Toast above.

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
order. **An exact holding can no longer collide with another player's own
exact holding or with the board** (issue #99): the card/range input sheet's
own `Cards` tab excludes every card already on the board or already held by
another player as an exact holding — see The Board Input Sheet above and
[hand-ranges.md](./hand-ranges.md) for how each picker renders that
exclusion — so two players can no longer submit the same two cards, and
neither can collide with the board. A hand-range player is unconstrained by
any of this: a range is a set of rank pairs, not two specific cards, and the
`Hand Range` tab's own 13×13 grid excludes nothing, whatever the board or
any other player holds. The list is **in memory only, for the app's own
lifetime** — nothing is written to SQLite or `AsyncStorage`, so it is empty
again after a cold start; the data model that would carry persistence
belongs with the equity engine, not this change.

Every row renders its holding's own preview, a label, and a subtitle, at the
row's own 393×96 size (16px padding, a 64×64 preview column at its own
left edge, a two-line meta block starting at x 96) — **no result
percentage, no chevron, and no `See Details` link render on any row**: the
design's own result column has nothing to show until the equity engine
exists, and that engine's own Equity Breakdown sheet has no destination to
open into yet either.

**Tapping a row's preview edits that player** (the maintainer's own
on-device pass over PR #93): the two card faces, or the rank-pair grid,
reopen the card/range input sheet seeded with that player's own current
holding — the rest of the row stays inert, and the swipe gesture still
covers the row's full width. Confirming the edit replaces that one player's
holding in place, keeping its own identifier, its own number (see Player
Kinds below), and its own position in the list unchanged; dismissing
without confirming leaves that player untouched. The same sheet the empty
state's button and the list's own trailing `New Player` row already open
now serves both adding a new player and editing an existing one.

## Player Kinds

A player is one of two kinds:

- An **exact holding** — two specific hole cards — rendered as the two
  cards, overlapping, next to a `Hole cards` subtitle.
- A **hand range** — rendered as a 13×13 dot-matrix preview next to a card
  pair count subtitle (`{{count}} combos`; that on-screen word is design
  copy, not this project's own domain term — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions). Every range player this change can build is ad hoc rather
  than from a saved preset — there is no preset store yet. The design's own
  averaged result percentage and `See Details` link are design intent
  only — see The Players List above.

**Both kinds' own label is the player's number** (`Player 1`, `Player 2`,
…, the maintainer's own on-device pass over PR #93), not the holding's own
rank-and-suit notation (`A♡T♡`) or a `Custom` label — the design's own
notation for an exact holding no longer renders as text at all, since the
two card faces already carry it. The number is `max(existing player
numbers) + 1`, which is `1` for an empty list: assigned once, at the
moment a player is added, and never recomputed from the player's own
position in the list, so deleting a player never renumbers the players
around it and emptying the list restarts numbering at `1`. The subtitle
above renders at 12px/16px line height — a deliberate departure from the
design's own measured 14px/18px value; see
[conventions/design-system.md](../conventions/design-system.md)'s own
entry for the reason.

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
