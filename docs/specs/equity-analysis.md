# Equity Analysis

This document describes what the design specifies for the Analyze screen and
its Equity Breakdown sheet. The Analyze tab's empty state, the board's own
empty state, and the `Players` section heading above it, built by issue #64,
are built and shipped — and, as of issue #87, so is the players list itself,
both its row kinds and its swipe-to-delete gesture, as the sections below now
describe. **As of issue #99**, so are the board's own populated state, both
card pickers' exclusion of a card already spoken for elsewhere, and the
Analyze toast — see The Board, The Board Input Sheet, The Toast, and The
Players Section below. **As of issue #102**, so is a row's own result figure
and, for a hand-range player, its chevron and the Equity Breakdown sheet
those open — see Player Kinds and The Equity Breakdown Sheet below for what
is shipped there and what still is not. **As of issue #103**, so is the
equity engine itself, and with it the Calculating and Calculated screen
states, a real per-player result in place of the fixed `0%` every row used
to carry, and the chevron/detail-press logic that now follows a result's own
presence rather than a holding's kind alone — see Screen States, The Players
List, Player Kinds, and The Equity Breakdown Sheet below for exactly what
changed. **As of issue #143**, a row's own result figure updates live
throughout the calculation instead of staying hidden until it settles, and a
hand-range row's chevron and Equity Breakdown detail press become reachable
the moment its own row shows any number, live or settled alike — see The
Players List, Player Kinds, and The Equity Breakdown Sheet below, and
[decisions/2026-09-03-show-raw-in-progress-equity-and-unlock-breakdown-before-settle.md](../decisions/2026-09-03-show-raw-in-progress-equity-and-unlock-breakdown-before-settle.md)
for why. `src/features/evaluations/adapter/use-equity-evaluation.ts` is the
engine's own application-global store: a module-scope Zustand store — no
React Context, no provider — that subscribes directly to the board and
players stores and drives `modules/espada-engine`'s native `startEquity` job
whenever the table holds two or three players, the sizes the native
evaluator supports today; any other player count reads as "no result." An
evaluation still in flight no longer reads the same way — its own row already
shows a result the moment the engine has reported one, live and still
updating, rather than staying blank the entire time the way it did before
issue #143. **As of issue #138**, the Equity Breakdown histogram draws each
hand-range player's own real, per-player distribution in place of the fixed
placeholder every player's chart used to share — see The Equity Breakdown
Sheet below. What remains a record of design intent, not of shipped
behaviour, is narrower now: the highlighted-bin heading and its per-bin
card-pair list (see The Equity Breakdown Sheet's own "Not built" note
below). The code for this domain sits under `src/features/evaluations/` —
the one name this project gives it other than Analyze.

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

A third case raises the same toast with no sheet involved at all: the
equity engine can settle a running calculation as `no-valid-runout` — every
player's own holding and the board each individually valid, yet no
combination of runouts satisfies all of them together (three players each
pinned to `AA`, say, since only four aces exist) — and the Analyze screen
reports that combination as impossible the same way a discarded sheet pick
is reported.

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
players list once it holds one to three players (see Screen States below),
begins 16px beneath it. `+ New Player` — a persistent floating action
button, fixed to the screen's bottom-right corner regardless of whether the
empty state or the players list is showing beneath it (issue #155,
superseding two earlier, state-dependent entry points issue #87 first
built: the empty state's own pill button, and the players list's own
trailing row) — opens the card/range input sheet (see
[hand-ranges.md](./hand-ranges.md)), and the sheet's own dismissal contract
resolves to either a submitted holding or a dismissal reason. It is visible
whenever the players list holds fewer than three players, and hidden once
it reaches that cap — see The Players List below. **A submitted holding
now becomes a row:** it is appended to the players list, in submission
order, replacing the empty state if this was the first player. A dismissal
adds no row, and — for two of its four reasons — raises the toast above
instead; see The Toast above.

## Screen States

The Analyze screen has four states:

- **Empty** — no players yet, built and shipped: the board's five empty
  slots, the `Players` heading, and — beneath that heading — a
  shark-and-fish illustration, the heading `Nothing in the water yet`, and
  the description `Add 2 players to start calculation.` — the copy is
  settled in [conventions/design-system.md](../conventions/design-system.md).
  The lime `+ New Player` floating action button that opens the card/range
  input sheet floats above this state the same way it floats above every
  other one (see [The Players Section](#the-players-section) above and
  [hand-ranges.md](./hand-ranges.md)); it is no longer part of the empty
  state's own composition. It ships without the design's share icon: the
  nav bar is title-only on every tab; see [navigation.md](./navigation.md).
- **Populated** — the table holds a player count the equity engine does not
  evaluate (zero or one player, or more than three — see below), built and
  shipped (issue #87): the players list (see below) replaces the empty
  state, with the same floating `+ New Player` button (gone at three)
  still floating above it, offering the same sheet. **Every row now carries
  a result figure** (issue #102), rendered
  only once one exists (issue #103) — see The Players List and Player Kinds
  below for exactly when that is, and when a row renders no figure at all
  instead. Not a name the design file itself uses — that file's own
  `Calculation` axis (`Done` / `Ready`) names a property of one *row*, not a
  state of the whole screen, and this document picks a distinct name for the
  screen state precisely so the two are never read as the same thing.
- **Calculating** — built and shipped (issue #103): a thin lime progress
  bar (`src/features/evaluations/ui/equity-progress-bar/
  equity-progress-bar.tsx`) sits directly beneath the board, filled
  left-to-right by the running job's own completion fraction, while exactly
  two or three players are present and their evaluation has not yet
  settled. The bar's own height is 2pt (issue #142), thinned down at plan
  approval from the original 4pt first-cut choice — the design states only
  that the bar is "thin," not a pixel height. **As of issue #143, each
  player row is no longer blank through this whole state**: a row's own
  result figure appears the moment the engine has reported any number for
  that player and keeps updating, live, as the calculation continues — see
  The Players List and Player Kinds below. This state's own name and the
  progress bar it draws are otherwise unchanged.
- **Calculated** — built and shipped (issue #103): the progress bar is
  gone; each player row carries its own real, computed result in place of
  the "no result" presentation above, keyed to that player by id rather than
  by seat order or list position.

**The bar's own space is reserved beneath the board at all times, in every
state** (issue #186), so the `Players` heading and the players list beneath
it never shift position as a calculation starts or ends. Before this change,
the bar was a plain conditional sibling — mounted only while "Calculating"
and unmounted the instant that state was entered or left — which moved the
`Players` heading and every row below it up or down by the bar's own height
each time. The Analyze screen (`src/features/evaluations/ui/analyze-screen/
analyze-screen.tsx`) now reserves a fixed-height slot equal to the bar's own
height at that same position in every state; only the bar's own track and
fill — drawn inside that slot — stay conditional on "Calculating", so
outside that state the slot holds no visible track or line, just plain
background. The players section's own top padding (see The Players Section
above) is reduced by that same reserved height, so the total space between
the board and the `Players` heading is unchanged from what it already was
in "Empty", "Populated", and "Calculated" — this reservation adds no net new
space anywhere; it only stops the "Calculating" state's own bar from moving
what is below it.

## The Players List

Built and shipped (issue #87), replacing the empty state once it holds at
least one player. Holds **up to three players** — a product rule issue #87
introduced at six and issue #140 later lowered to three; no earlier document
stated a maximum, and the design file itself draws no cap. A submitted
holding is appended to the end. **The list's own order is no longer fixed at
submission order** (issue #153): a row can be long-pressed and dragged to a
new position — see the reordering paragraph below, alongside swipe-to-delete,
for both row gestures. **An exact holding can
no longer collide with another player's own exact holding or with the
board** (issue #99): the card/range input sheet's
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
left edge, a two-line meta block starting at x 96). **Every row now also
renders a result figure** (issue #102) **once one exists for that player**
(issue #103): `src/features/evaluations/adapter/use-equity-evaluation.ts`'s
own per-player selector is `null` whenever no result is currently available
— fewer than two players, more than three, or an evaluation not yet far
enough along to have reported one for that player — and the row renders no
result figure at all for that case, the same "nothing to show" presentation
the chevron column below already followed for a hole-cards row. **As of
issue #143, "a result exists" no longer means only a settled one**: the
selector already returns a live, still-updating number the moment the
running evaluation's first progress tick reports one for that player, well
before the calculation as a whole settles, and the row shows and keeps
updating that number for as long as the calculation keeps running — see
Screen States above and
[decisions/2026-09-03-show-raw-in-progress-equity-and-unlock-breakdown-before-settle.md](../decisions/2026-09-03-show-raw-in-progress-equity-and-unlock-breakdown-before-settle.md)
for why. **The result's own presence, not the holding's kind alone, now
decides the chevron column too**, superseding issue #102's `isHandRange`-only
rule: no result at all renders no chevron column, regardless of kind — the
row has nothing to open either way. Once a result exists — live or settled
alike — a hand-range row reserves a 24px chevron column past the result
figure and gains a second press target covering the row except its own
preview: pressing it opens the Equity Breakdown sheet below (see The Equity
Breakdown Sheet), fires the same `primaryAction` haptic the preview's own
edit press already does
([conventions/haptics.md](../conventions/haptics.md)'s Consistency Rule),
and the row announces itself as a button naming that outcome. **A
hole-cards row's chevron column stays reserved but empty once a result
exists** — an exact holding has no distribution to break down, so its
result figure sits at the same x position a hand-range row's does, but
pressing anywhere past its preview does nothing.

Once available, that result figure renders as a percentage to two decimal
places. Each row's own accessibility announcement composes the same facts as
words rather than repeating what is already on screen: an exact holding
speaks its two cards by their spoken form (`ace of hearts`, not `A♡T♡`), and
a hand-range holding speaks the same card-pair count its own visible
subtitle already shows. The announcement appends that same result figure, or
a placeholder naming that none is available yet, and — for a hand-range row
once a result exists — names that pressing it opens the Equity Breakdown
sheet, matching the button role the row itself takes on.

**Tapping a row's preview edits that player** (the maintainer's own
on-device pass over PR #93): the two card faces, or the rank-pair grid,
reopen the card/range input sheet seeded with that player's own current
holding — the rest of the row stays inert, and the swipe gesture still
covers the row's full width. Confirming the edit replaces that one player's
holding in place, keeping its own identifier, its own number (see Player
Kinds below), and its own position in the list unchanged; dismissing
without confirming leaves that player untouched. The same sheet the
persistent `+ New Player` floating action button already opens now serves
both adding a new player and editing an existing one.

## Player Kinds

A player is one of two kinds:

- An **exact holding** — two specific hole cards — rendered as the two
  cards, overlapping, next to a `Hole cards` subtitle.
- A **hand range** — rendered as a 13×13 dot-matrix preview next to a card
  pair count subtitle (`{{count}} combos`; that on-screen word is design
  copy, not this project's own domain term — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions). Every range player this change can build is ad hoc rather
  than from a saved preset — there is no preset store yet. Its result
  figure is a real, computed one — the design's own *averaged* result across
  the range — once the table holds two or three players and the running
  evaluation has reported one for that player (issue #103); before that, it
  renders no result figure at all (see The Players List above). **As of
  issue #143, that figure appears well before the calculation settles**: it
  is live and still updating throughout "Calculating" (see Screen States
  above), settling into its final value only once the calculation itself
  does. Once a result exists — live or settled alike — its own detail press
  opens the Equity Breakdown sheet below, unlike a hole-cards
  player's; see The Equity Breakdown Sheet below.

**Both kinds' own label is the player's number** (`Player 1`, `Player 2`,
…, the maintainer's own on-device pass over PR #93), not the holding's own
rank-and-suit notation (`A♡T♡`) or a `Custom` label — the design's own
notation for an exact holding no longer renders as text at all, since the
two card faces already carry it. The number is `max(existing player
numbers) + 1`, which is `1` for an empty list: assigned once, at the
moment a player is added, and never recomputed from the player's own
position in the list, so deleting a player never renumbers the players
around it and emptying the list restarts numbering at `1`. **Reordering the
list changes nothing here either** (issue #153): a player's own number stays
tied to that player's own identity, not to where the list currently seats
them, exactly as it already survives a deletion of another player. The
subtitle
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

**Every row is also long-press-to-drag reorderable, built and shipped as of
issue #153.** Held past a brief pause, a row lifts off the stack — scaled up
slightly and cast with a drop shadow, both released on drop — and tracks the
finger vertically; a horizontal swipe that never holds still that long still
reaches the delete gesture above unchanged. Dragging the first row above the
list, or the last row below it, clamps at the list's own bounds rather than
travelling further with nowhere left to reorder into. The other rows reorder
live, the instant the drag carries the held row's own position past another
row's midpoint, not only once the drag releases — so the list's own order is
never out of sync with what the hand is currently doing. No accessibility
alternative ships for this gesture — issue #153's own plan scoped that out
deliberately, unlike deletion and editing above, each of which keeps its own
`accessibilityActions` path alongside its gesture: reordering the list is
reachable by touch alone, for now.

**A new drag does not start in two cases, as of issue #226.** With one
player or fewer, there is nothing to reorder against, so a long press never
lifts the row, never casts its shadow, and never fires the pickup haptic.
With two or three players and the calculation for the current players
actively running (the "Calculating" state above), a long press is refused
the same way, since reordering restarts that same calculation on every row
crossing — so a fresh drag started while it is already running would
discard its own progress repeatedly for as long as the drag lasted. Neither
case adds any visual, textual, or accessibility signal of its own; the
gesture simply does not activate. A drag already under way when its own
reordering restarts the calculation is not affected by either condition —
it keeps tracking the finger and committing further reorders until
released, exactly as before this change — and only the *next* attempt,
after release, is blocked while the calculation keeps running. Deletion,
editing, and (for a hand-range row) opening the Equity Breakdown sheet are
all unaffected by either condition.

## The Equity Breakdown Sheet

**Built and shipped, as of issue #102**, with a fixed placeholder histogram
rather than a computed one. **As of issue #103**, the equity engine itself
exists (see this document's own introduction above) and the header above the
histogram carries that engine's real, per-player result — but the engine
computed one aggregate win/tie/equity result per player, not a distribution
across equity bins, so the histogram itself was still a fixed placeholder,
identical for every player. **As of issue #138**, the engine also retains and
exposes a per-card-pair breakdown of that same win/tie/equity computation,
and the histogram draws it directly: each hand-range player's own real
distribution across equity bins — how that player's own card pairs actually
performed against the current board and opponents — in place of the
placeholder. A hand-range row's own detail press (see The Players List
above) opens it; a hole-cards row has no distribution to break down, so
nothing opens for one.

**The header repeats that row unchanged** — option B of the exhibit issue
#102 weighed, and the design of record: the same `PlayerRowContent` the
players list itself renders
(`src/features/evaluations/ui/player-row-content/player-row-content.tsx`),
at the same 96pt height with the same 64×64 preview and the same result
figure — unlike the row that opened it, this header opens nothing and
cannot be pressed. **The header's own result figure is the real one now**
(issue #103), the same per-player result the row itself reads — this sheet
is only ever reachable from a hand-range row's own detail press, which
itself only exists once that row already has any result, live or settled
(issue #143), so the practical case is always a real figure, possibly still
updating: opening this sheet while the calculation is still running shows
the same live-updating number the row itself is showing at that moment, and
the header keeps updating right alongside the row for as long as the sheet
stays open during "Calculating." The header still degrades to no result
figure at all in the same practically-unreachable case the row itself would
(a player deleted, or an evaluation restarted, while this sheet somehow
stays open), rather than assuming that case cannot happen.

**The one thing the header does not repeat is the row's chevron column.**
The list reserves that 24pt column on every row, chevron shown or not, so a
hole-cards row's result figure lands on the same vertical line as a
hand-range row's; the header renders one player and has no second row to
align with, so it omits the column outright and its result figure sits
against the row's own 16pt trailing padding rather than a column's width
further in. `PlayerRowContent` carries those three states as one `chevron`
prop — `shown` for a hand-range row, `reserved` for a hole-cards row,
`omitted` for this header — rather than a boolean, so "draw the icon" and
"reserve its column" cannot be set to a combination that has no meaning.

Below the header:

- a heading, `Equity Breakdown`;
- a four-item legend naming the four **strength bands** — `Trash`,
  `Marginal`, `Value`, `Nuts` — each with a colour swatch and, as of issue
  #237, that band's own live card-pair count beside its label: every one of
  the acting player's own card pairs, classified by Rule R1 below, sorted
  into exactly one band, so the four counts always sum to that player's own
  live card-pair total. The count reads `0` for every band, rather than
  omitting the legend or the count itself, in the same practically
  unreachable no-result case the header's own result figure degrades to
  above.
- a histogram: the y-axis is labelled `combos` (settled to lowercase by this
  change — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions), running from `0` to an upper bound derived from the bins
  actually drawn and rounded up to a round tick, never a bound fixed at one
  number — `src/features/evaluations/model/equity-breakdown.ts`'s
  `combosAxisUpperBound`; the x-axis is labelled `Equity`, fixed from `0`
  to `100`. **The combos axis's own upper bound is computed from the bins
  actually drawn**, not fixed at one number shared across every player: as
  of issue #138 each hand-range player's own real distribution drives its
  own chart independently, so two players — differing in holdings, range
  size, or board/opponent context — can and do resolve to two different
  upper bounds in the same session; nothing keys the bound to a value
  shared across players, it is simply the same computation applied to each
  player's own real counts. Each bar is one equity bin, drawn from **that
  player's own real distribution** — a breakdown of that player's own card
  pairs across equity, computed by the same per-card-pair walk the header's
  aggregate win/tie/equity result already comes from (issue #138) — and no
  highlighted-bin state selects one bar over another (see below). The
  distribution folds
  from 20 bins down to whichever of 20, 16, 12, or 8 bars the sheet
  actually leaves room to show legibly at runtime —
  `src/features/evaluations/model/equity-breakdown.ts`'s `chooseBarCount`,
  against a 20pt-per-bar legible-pitch floor — rather than a fixed count
  derived from device width alone, since the sheet's own 600pt panel width
  ceiling ([conventions/design-system.md](../conventions/design-system.md)'s
  Bottom Sheet Panel Width) and its own side padding mean drawing width is
  not a pure function of device width. The count is chosen from the chart's
  own layout measurement, which reports the whole canvas — including the
  bounding rule below and the gutter the combos axis's own labels and name
  reserve outside the plot, tens of points of it — so the strip the bars are
  drawn in is meaningfully narrower than what the count is chosen from. That
  is deliberate: subtracting the gutter would drop the widest supported
  phone from 20 bars to 16, and subtracting the rule would leave that tier
  sitting exactly on its boundary rather than a point clear of it. The
  consequence is that at the widest supported phone the realised per-bar
  pitch lands about four percent under the 20pt legible-pitch floor, which
  is a heuristic, where the tier a phone reaches is a stated requirement.
  This project's own supported phone widths keep the resolved count
  at 20, 16, or 12 bars, with 8 reachable only below any drawing width a
  supported phone actually leaves. Folding a player's own distribution into
  fewer, wider bins concentrates more of its total into each one, which is
  exactly why the combos axis's own upper bound above cannot be fixed
  either — it has to grow with the fold. **Each bar is one flat colour, the
  colour of whichever strength band holds the most of that bar's own card
  pairs — option B, majority colour, and the design of record as of issue
  #237** (see
  [decisions/2026-09-04-colour-each-histogram-bar-by-its-majority-strength-band.md](../decisions/2026-09-04-colour-each-histogram-bar-by-its-majority-strength-band.md)):
  this chart's own `bar-chart.tsx` primitive
  (`src/features/evaluations/ui/equity-breakdown-chart/bar-chart.tsx`) draws
  each bar as a single Skia `Rect` taking exactly one colour prop, sampled
  once per bar rather than varying within one — the same primitive as
  before, now fed a band colour per bar instead of a position along a
  continuous ramp. Each bar's own card pairs are folded into the same
  position-based partition the bar's own height already folds from, so a
  bar's colour and its height agree on which of the acting player's live
  card pairs the bar actually represents; a bin the fold leaves with no
  live card pairs draws no bar, exactly as an empty bin already did. A tie
  between two bands within one bin resolves to the stronger of the two,
  `Nuts` over `Value` over `Marginal` over `Trash`. **A bar's own colour can
  disagree with its neighbourhood's read of the ramp it replaces**: a bin
  that is a third `Marginal` draws and two-thirds `Value` made hands reads
  as flatly `Value`, with the `Marginal` minority visible only in the
  legend's own count, not in the bar itself — the majority-colour option's
  own accepted cost (see that decision record's "What was compared"
  section). See
  [decisions/2026-09-04-load-the-equity-breakdown-chart-axis-font-with-usefont-not-matchfont.md](../decisions/2026-09-04-load-the-equity-breakdown-chart-axis-font-with-usefont-not-matchfont.md),
  which points on to the still-valid reasoning for why this chart draws
  directly on Skia rather than `react-native-svg`, already a dependency this
  project otherwise draws every card face and icon with.

  **Each card pair's own band comes from Rule R1** (see
  [decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md](../decisions/2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md)),
  from that card pair's own equity and current strength against
  `fair = 1 / playerCount`. Postflop: `Nuts` if current strength is at
  least `0.85`; else `Value` if current strength is at least `0.50` and
  equity is at least `fair`; else `Trash` if equity is under `0.6 × fair`
  and current strength is under `0.50`; else `Marginal`. Preflop, current
  strength has no board to be ahead on and the band comes from equity alone:
  `Trash` under `0.6 × fair`, `Marginal` under `fair`, `Value` under
  `fair + 0.6 × (1 − fair)`, `Nuts` otherwise —
  `src/features/evaluations/model/strength-band.ts` carries both variants
  and the dispatch between them.

**As of issue #197, every bar eases toward its own new height instead of
snapping to it, with a slight overshoot before settling.** The first time
the sheet draws a real distribution after opening, every bar grows in from
zero up to its resting height rather than appearing already drawn; and
every time the acting player's live result updates while a calculation is
still running, the bars ease from their previous heights to the new ones
the same way, rather than jumping instantly. Both read this project's own
movement spring (`motionSpringConfig`,
[conventions/design-system.md](../conventions/design-system.md)'s Motion
section), which is what supplies the overshoot — a deliberate departure
from that section's own rule that a spring is reserved for movement, not a
size, since a bar growing in has nothing below zero to rebound through.
Reduced motion collapses both cases to an immediate, correct height, with
no growth or easing, the same as every other animated surface in this app.

**The plotted area is bounded on two edges.** A rule runs along the
histogram's bottom edge and its left edge, so the bars read as sitting in a
chart rather than floating on the sheet; the top and right edges stay open,
since a full box would read as a frame rather than as two axes. Both rules
are drawn by this chart's own `bar-chart.tsx` primitive as its bounding
frame, at `theme.borderWidth.base` in `border.neutral.unselectedControl` —
not in any of the three steps of the
neutral border ramp (`subtle`, `interactive`, `hovered`), every one of which
falls under the WCAG 2 AA 3:1 non-text floor against the sheet panel's own
`background.neutral.app` ground. `unselectedControl` is the role this
project already added for that failure, and it clears the floor in both
themes on that ground; see
[conventions/design-system.md](../conventions/design-system.md)'s "Brand
Accent and Unselected-Control-Border Roles" section for the measurements and
`src/core/theme/tokens.test.ts` for the assertions on them. All four of the
frame's side widths are set, the top and right at zero, matching this
chart's own `BarChartFrame` type; the primitive draws a rule only for a side
whose width is greater than zero, so the top and right stay undrawn rather
than defaulting to a visible stroke.

**Nothing else is ruled.** No gridline crosses the plot at any bar count, in
either theme — this chart's own `bar-chart.tsx` primitive has no
gridline-drawing step to invoke or omit in the first place. It draws the two
bounding rules above, the bars, and the axis labels below, and nothing else
across the plot.

**The chart draws its own axis furniture.** The rules above, the start and
end labels at each axis's two ends, and both axis names are this chart's own
primitive's, not platform text and borders laid out around the canvas. What
a reader sees is what the design asks for either way — the equity axis
ending at `0` and `100` and named `Equity`, the combos axis ending at its
computed upper bound and named `combos` — and the plot has nothing between
those two ends, because the primitive draws exactly the six labels it is
handed, a start label, an end label, and a title per axis, with no
tick-generation step that could produce more. Drawn labels need a loaded
font, and the chart now loads one from this
app's own bundled asset rather than asking the platform to resolve a family
name: Skia's `useFont` reads `assets/fonts/InnovatorGrotesk-Regular.otf` by
its actual bytes, the same face
([decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md](../decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md))
every other text role in the app already renders in. So there **is** a font
file bundled for this chart, and there **is** a brief asynchronous load
before the first frame that carries any axis labels — the chart draws
nothing at all until that asset finishes loading, rather than a frame with
axes and no text.

This is a reversal of a deliberate prior choice, not an oversight corrected.
The chart used to build its font with `matchFont`, asking the platform to
resolve the literal family name `"System"` — a synchronous path with no
asset to load and no first frame without labels. On 2026-09-03 the
maintainer was asked and chose to keep that system face here, specifically
to avoid the asynchronous-load cost above. On 2026-09-04, a real on-device
Android test of that build found both axes' text completely invisible:
Android has no equivalent of iOS's own alias from `"System"` to a real font
family, so the platform failed to match it against anything and silently
produced a font that drew no visible glyphs at all — an outcome no mocked
test or source-level read could have caught, only a real device. Asked
again, the maintainer chose to accept the asynchronous-load cost in exchange
for a fix that depends on no platform resolving any family name at all. A
later change MUST NOT revert to `matchFont` or any other system-font path
without going back to the maintainer once more — the failure above is
Android-only and device-specific, so it will not resurface in this
project's mocked tests either. The maintainer still has not seen the
bundled face's own axis labels render on a real device, so the manual
on-device pass over this sheet should confirm they actually draw visible
glyphs — the exact thing the system face silently failed to do.

**The legend and the axis labels are set below the sheet's body copy**, so
the chart's names and numbers read as annotation rather than as content
competing with the heading. The legend's four band names take
`chartLegendLabel` (12, Regular, at a 16px line height) as ordinary themed
text;
the axis labels are drawn rather than laid out, so what reaches them is
`chartAxisLabel`'s 10px size, as the size the loaded font is built at.
Both are one step and two steps down this project's type scale from the
`caption` both shipped at, and both are recorded as deliberate departures in
[conventions/design-system.md](../conventions/design-system.md)'s
Typography section.

**Nothing inside the chart reaches assistive technology.** Everything it
says is painted into a drawing surface with no accessibility tree of its
own, so the canvas carries one label covering all of it: what the chart
shows, how many bars it drew, which axis runs where, the equity range, and
the combination-count upper bound this render actually drew.

**The chart is not flush with the sheet's own edge.** The sheet leaves one
16pt spacing step of clearance below the histogram, on top of whatever
bottom safe-area inset the device reports — the shared bottom-sheet panel
pads for that inset and nothing more, so on a device reporting none the
chart would otherwise sit against the panel's edge.

**As of issue #234, a Rank Pair list follows the histogram** — every Rank
Pair in a hand-range player's own range (the sheet's only case), grouped
under three fixed headings in order: `Pocket pairs`, `Suited`, `Offsuit`.
Within a group, Rank Pairs keep the same canonical grid order the hand-range
grid itself uses (`src/features/evaluations/ui/equity-breakdown-rank-pairs/
equity-breakdown-rank-pairs.tsx`); a group with nothing in it draws no
heading at all. Each Rank Pair is a small, non-interactive chip: two rank
glyphs at zero gap and, for a suited or offsuit pair only, a trailing bar
glyph — `=` for suited, `≠` for offsuit — also at zero gap; a pocket pair's
chip draws no third glyph, since a pocket pair's own two cards carry no
suitedness to indicate. The list enumerates the range the histogram above it
already sums — **it selects nothing and filters nothing**: no bin
highlighted here, no Rank Pair here narrows what the chart draws, and no
Rank Pair here expands into the Card Pairs it stands for.

**Not built**: the heading naming a currently highlighted bin (the design's
own example, `Equity 75 -70%`, is internally inconsistent — a descending
range with no explicit sign on the second number — and no corrected format
has been settled), and the two-column list of card pairs in that bin below
it. Both need a bin a reader can actually select, which needs a selection
interaction the histogram does not have yet — a later, separate effort
(issue #138's own plan scoped it out deliberately). The real per-card-pair
result to list in that bin does now exist, as of issue #138, folded into
the bar counts this histogram already draws; the selection interaction is
what remains, not the underlying data. This change's own histogram
highlights no bar and lists no card pairs.

The four strength-band colours are catalogued in
[conventions/design-system.md](../conventions/design-system.md).

## The Blocker Score

**Nothing below is built, and no issue yet tracks building it.** This section
states what the design specifies for a **blocker score**, derived from the
equity engine's existing per-card-pair accounting, ahead of any change that
computes or carries it.

For one **card pair** held by one player, against one opponent, the blocker
score is the signed shift the pair causes in that opponent's mean **equity**
by removing the opponent's own **live card pairs** that share a card with it
— a fraction in `[−1, 1]`: positive means holding the pair leaves the
opponent weaker, negative means stronger. A score is scoped to one opponent
and is never averaged across opponents — at a table of more than two
players, each of a player's live card pairs carries one score per opponent,
not one score for the table.

A card pair receives a score against an opponent, and its own equity,
exactly when it is live — its accumulated weight across the walk is
positive, the same test the Equity Breakdown histogram above already
applies. Both exist at settlement only; a progress tick carries neither.

A settled result carries, per player, two fixed-layout buffers of 64-bit
floats: `cardPairEquities`, 1,326 values, one per **card pair number**; and
`blockerScores`, 1,326 × (players − 1) values, row-major by card pair number
and then by a skip-self opponent ordinal — the opponent's own seat index,
minus one when the opponent sits past the scoring player, so at a
three-seat table the player in seat 1 reads seats 0 and 2 as ordinals 0 and
1. A card pair that is not live carries `NaN` in its equity slot and in
every one of its score slots; a live pair carries a finite value in all of
them. Both buffers are empty on a progress tick, so a non-empty buffer is
itself the sign that a result is settled.

The **card pair number** both sides derive the same way, from the deck
order: a card is numbered `rank × 4 + suit`, rank running 0 for a deuce to
12 for an ace, suit running 0 for spades, 1 for hearts, 2 for diamonds, 3
for clubs — the app's own `DECK` enumeration order. A card pair `{a, b}`
with `a < b` is numbered `a × 51 − a × (a − 1) / 2 + (b − a − 1)`, mapping
the 1,326 pairs onto `0` through `1325` one to one: 2♠2♥ is 0, 2♦2♣ is 101,
A♠A♥ is 1320, and A♦A♣ is 1325.

If the settlement cost this adds is ever watched in the field, the number to
record is the wall time in the app from starting a job to receiving its
settled result — the app-side start-to-settle measurement point the design
leaves a place for. Nothing measures or sends it yet.

The score's definition and the fixed-slot buffer contract are recorded in
[decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md](../decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md)
and
[decisions/2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md](../decisions/2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md).
