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
is shipped there and what still is not. Everything else in this document —
the Calculating and Calculated states, a real per-player result, and the
equity engine that would produce one — remains a record of design intent,
not of shipped behaviour. The code for this domain sits under
`src/features/evaluations/` — the one name this project gives it other than
Analyze.

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
  sheet. **Every row now carries a result figure** (issue #102), fixed at
  `0%` for every player — the equity engine that would compute a real one
  does not exist yet (see The Players List and Player Kinds below). Not a
  name the design file itself uses — that file's own `Calculation` axis
  (`Done` / `Ready`) names a property of one *row*, not a state of the whole
  screen, and this document picks a distinct name for the screen state
  precisely so the two are never read as the same thing.
- **Calculating** — not built. A thin lime progress bar sits directly
  beneath the board.
- **Calculated** — not built. The progress bar is gone; each player row
  carries its own real, computed result in place of the fixed `0%` above.

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
left edge, a two-line meta block starting at x 96). **Every row now also
renders a result figure** (issue #102), a fixed, non-interactive `0%` for
every player, in the design's own result column — the equity engine that
would compute a real one does not exist yet. A hand-range row additionally
reserves a 24px chevron column past the result figure and gains a second
press target covering the row except its own preview: pressing it opens the
Equity Breakdown sheet below (see The Equity Breakdown Sheet), fires the
same `primaryAction` haptic the preview's own edit press already does
([conventions/haptics.md](../conventions/haptics.md)'s Consistency Rule),
and the row announces itself as a button naming that outcome. **A
hole-cards row's chevron column stays empty** — an exact holding has no
distribution to break down, so its result figure sits at the same x
position a hand-range row's does, but pressing anywhere past its preview
does nothing.

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
  than from a saved preset — there is no preset store yet. Its result
  figure is the same fixed `0%` every row carries — the design's own
  *averaged* result has no equity engine behind it yet — and its own
  detail press opens the Equity Breakdown sheet below, unlike a
  hole-cards player's; see The Players List above and The Equity
  Breakdown Sheet below.

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

**Built and shipped, as of issue #102**, with a fixed placeholder histogram
rather than a computed one — the equity engine that would produce a real
distribution does not exist yet. A hand-range row's own detail press (see
The Players List above) opens it; a hole-cards row has no distribution to
break down, so nothing opens for one.

**The header repeats that row unchanged** — option B of the exhibit issue
#102 weighed, and the design of record: the same `PlayerRowContent` the
players list itself renders
(`src/features/evaluations/ui/player-row-content/player-row-content.tsx`),
at the same 96pt height with the same 64×64 preview and the same bare result
figure — unlike the row that opened it, this header opens nothing and
cannot be pressed. The design's own `Avg. 17%` averaged result is design
intent only: the header's own result figure is the same fixed `0%` the row
itself carries.

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
  `Marginal`, `Value`, `Nuts` — each with a colour swatch;
- a histogram: the y-axis is labelled `combos` (settled to lowercase by this
  change — see
  [conventions/design-system.md](../conventions/design-system.md)'s copy
  conventions), running from `0` to an upper bound derived from the bins
  actually drawn and rounded up to a round tick, never a bound fixed at one
  number — `src/features/evaluations/model/equity-breakdown.ts`'s
  `combosAxisUpperBound`; the x-axis is labelled `Equity`, fixed from `0`
  to `100`. **The combos axis's own upper bound is a placeholder, standing
  in for a decision this project has not yet made**: what it should be
  once the equity engine gives each player a distinct distribution is
  still open (see [#102](https://github.com/axross/juicio/issues/102)'s
  own Open Questions) — the recorded direction is that players share one
  bound rather than each scaling to its own, and deriving today's
  placeholder bound from the bins every player's chart already shares
  keeps that direction true without yet settling the mechanism. Each bar
  is one equity bin, drawn over a **fixed placeholder distribution,
  identical for every player** — the real, per-player distribution the
  equity engine would compute does not exist yet, and no highlighted-bin
  state selects one bar over another (see below). The distribution folds
  from 20 bins down to whichever of 20, 16, 12, or 8 bars the sheet
  actually leaves room to show legibly at runtime —
  `src/features/evaluations/model/equity-breakdown.ts`'s `chooseBarCount`,
  against a 20pt-per-bar legible-pitch floor — rather than a fixed count
  derived from device width alone, since the sheet's own 430pt panel width
  ceiling ([conventions/design-system.md](../conventions/design-system.md)'s
  Bottom Sheet Panel Width) and its own side padding mean drawing width is
  not a pure function of device width. The count is chosen from the chart's
  own layout measurement, which reports the box from **outside** the axis
  rules below: the strip the bars are drawn in is one rule narrower than
  what the count is chosen from, deliberately, so the widest supported
  phone stays a point clear of the 20-bar boundary rather than landing on
  it. This project's own supported phone widths keep the resolved count at
  20, 16, or 12 bars, with 8 reachable only below any drawing width a
  supported phone actually leaves. Folding the same fixed distribution into
  fewer, wider bins concentrates more of its total into each one, which is
  exactly why the combos axis's own upper bound above cannot be fixed
  either — it has to grow with the fold. **Each bar is one flat colour, not
  a gradient fill within one** — Victory Native's own `Bar` mark takes
  exactly one colour per mark — but the colours across the bars still run
  the same continuous ramp with no boundary between bands the design
  specifies (see
  [decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md](../decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md)),
  sampled once per bar rather than varying within one; see
  [decisions/2026-09-02-adopt-victory-native-and-skia-for-the-equity-breakdown-chart.md](../decisions/2026-09-02-adopt-victory-native-and-skia-for-the-equity-breakdown-chart.md)
  for why a charting library on Skia draws it rather than
  `react-native-svg`, already a dependency this project otherwise draws
  every card face and icon with.

**The plotted area is bounded on two edges.** A rule runs along the
histogram's bottom edge and its left edge, so the bars read as sitting in a
chart rather than floating on the sheet; the top and right edges stay open,
since a full box would read as a frame rather than as two axes. Both rules
are drawn as borders on the canvas container at `theme.borderWidth.base`, in
`border.neutral.unselectedControl` — not in any of the three steps of the
neutral border ramp (`subtle`, `interactive`, `hovered`), every one of which
falls under the WCAG 2 AA 3:1 non-text floor against the sheet panel's own
`background.neutral.app` ground. `unselectedControl` is the role this
project already added for that failure, and it clears the floor in both
themes on that ground; see
[conventions/design-system.md](../conventions/design-system.md)'s "Brand
Accent and Unselected-Control-Border Roles" section for the measurements and
`src/core/theme/tokens.test.ts` for the assertions on them. They are not the
charting library's own axis chrome, and not because a font file is missing:
Victory Native draws an axis line from a line colour and width, with no font
involved. The reason is that the library is mocked wholesale under this
project's Jest setup, so nothing it would draw is assertable, while a border
on a React Native view is a style a component test can read back.

**The legend and the axis labels are set below the sheet's body copy**, so
the chart's names and numbers read as annotation rather than as content
competing with the heading. The axis labels are plain themed text rather
than the charting library's own tick labels, because those need a font file
loaded into Skia and this project bundles none; the chart shows each axis's
two endpoints and its name, never a tick per bar, so there is nothing a
bundled font would buy. The legend's four band names take
`chartLegendLabel` (12/400 at a 16px line height) and both axes' labels
take `chartAxisLabel` (10/400 at a 14px line height) — one step and two
steps down this project's type scale from the `caption` both shipped at.
Both are recorded as deliberate departures in
[conventions/design-system.md](../conventions/design-system.md)'s
Typography section, which is also where the reasoning behind the axis
label's 14px line height lives.

**The chart is not flush with the sheet's own edge.** The sheet leaves one
16pt spacing step of clearance below the histogram, on top of whatever
bottom safe-area inset the device reports — the shared bottom-sheet panel
pads for that inset and nothing more, so on a device reporting none the
chart would otherwise sit against the panel's edge.

**Not built**: the heading naming a currently highlighted bin (the design's
own example, `Equity 75 -70%`, is internally inconsistent — a descending
range with no explicit sign on the second number — and no corrected format
has been settled), and the two-column list of card pairs in that bin below
it. Both need a bin a reader can actually select and a real per-combo result
to list, neither of which exists without the equity engine; this change's
own histogram highlights no bar and lists no card pairs.

The four strength-band colours are catalogued in
[conventions/design-system.md](../conventions/design-system.md).
