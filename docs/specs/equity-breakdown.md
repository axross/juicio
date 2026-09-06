# Equity Breakdown

This document describes what the design specifies for the Equity Breakdown
sheet a hand-range player's own detail press opens from
[equity-analysis.md](./equity-analysis.md)'s players list, and for the
Blocker Score a settled result's per-card-pair accounting can derive.
Most of the sheet — its header, legend, histogram, Rank Pair list, and, as
of issue #293, its Blocker Score section — is built and shipped, issue by
issue as the sections below note; the highlighted-bin heading and its
per-bin card-pair list remain design intent, not shipped behaviour.

## The Equity Breakdown Sheet

**Built and shipped, as of issue #102**, with a fixed placeholder histogram
rather than a computed one. **As of issue #103**, the equity engine itself
exists (see [equity-analysis.md](./equity-analysis.md)'s own introduction)
and the header above the histogram carries that engine's real, per-player
result — but the engine
computed one aggregate win/tie/equity result per player, not a distribution
across equity bins, so the histogram itself was still a fixed placeholder,
identical for every player. **As of issue #138**, the engine also retains and
exposes a per-card-pair breakdown of that same win/tie/equity computation,
and the histogram draws from it: each hand-range player's own card pairs,
folded into equity bins by the computation described below — how that
player's own card pairs actually performed against the current board and
opponents — in place of the placeholder. A hand-range row's own detail
press (see [equity-analysis.md](./equity-analysis.md)'s The Players List)
opens it; a hole-cards row has no distribution to break down, so nothing
opens for one.

**As of issue #261, the per-card-pair data behind the histogram and the
legend crosses the native boundary as two fixed-slot buffers.** A
hand-range player's engine result (`EspadaEquityPlayerResult`) carries
`equities` and `strengths` — each `CARD_PAIR_COUNT` (1,326) 32-bit floats,
one slot per **card pair number**. **As of issue #294, both buffers are
filled only at settlement**, the same settlement-only cadence the
identity-bearing card-pair list and the 20-bin `distribution` array below
already carry: a progress tick now carries every slot of both at the
sentinel `NaN`, indistinguishable by content alone from a settled result
with no live card pairs at all. A settled buffer's live card pair holds its
final equity in `equities` and its final current strength in `strengths`,
every other slot `NaN`, and preflop every `strengths` slot is `NaN`
regardless of liveness (current strength has no board to be ahead on
there). The histogram's bar heights and colours and the legend's band
counts are classified from the `equities`/`strengths` buffers by Rule R1
below only once the calculation has settled; for as long as it has not, see
"The Loading State" below for what the sheet shows instead. See
[decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md](../decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md)
for why, and for why issue #261's own choice to send both on every tick —
recorded in `decisions/2026-09-05-carry-per-card-pair-equity-and-strength-as-fixed-slot-buffers-on-every-tick.md`,
now superseded by the record above — no longer holds.

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
  above. **As of issue #294, the count reads an en dash for every band
  instead, for as long as the calculation is still running** — see "The
  Loading State" below.
- a histogram: the y-axis is labelled `combos` (settled to lowercase by this
  change — see
  [conventions/copy-conventions.md](../conventions/copy-conventions.md)),
  running from `0` to an upper bound derived from the bins
  actually drawn and rounded up to a round tick, never a bound fixed at one
  number — `src/features/evaluations/model/equity-breakdown.ts`'s
  `combosAxisUpperBound`; the x-axis is labelled `Equity`, fixed from `0`
  to `100`. **The combos axis's own upper bound is computed from the bins
  actually drawn**, not fixed at one number shared across every player: as
  of issue #138 each hand-range player's own per-card-pair breakdown drives
  its own chart independently, so two players — differing in holdings, range
  size, or board/opponent context — can and do resolve to two different
  upper bounds in the same session; nothing keys the bound to a value
  shared across players, it is simply the same computation applied to each
  player's own real counts. Each bar is one equity bin, drawn from **that
  player's own equities and strengths, classified by Rule R1 below** — a
  breakdown of that player's own card pairs across equity, computed by the
  same per-card-pair walk the header's aggregate win/tie/equity result
  already comes from (issue #138) — and no highlighted-bin state selects one
  bar over another (see below). Those per-bin counts fold
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
  supported phone actually leaves. Folding a player's own per-bin counts into
  fewer, wider bins concentrates more of its total into each one, which is
  exactly why the combos axis's own upper bound above cannot be fixed
  either — it has to grow with the fold. **Each bar is one flat colour, the
  colour of whichever strength band holds the most of that bar's own card
  pairs — option B, majority colour, and the design of record as of issue
  #237** (see
  [decisions/2026-09-05-confirm-majority-colour-presentation-took-effect-with-issue-255.md](../decisions/2026-09-05-confirm-majority-colour-presentation-took-effect-with-issue-255.md)):
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

**As of issue #197, every bar grows in from zero up to its resting height
instead of appearing already drawn, with a slight overshoot before
settling**, the first time the sheet draws real bars after opening. This
reads this project's own movement spring (`motionSpringConfig`,
[conventions/motion.md](../conventions/motion.md)), which is what supplies
the overshoot — a deliberate departure from that document's own rule that a
spring is reserved for movement, not a size, since a bar growing in has
nothing below zero to rebound through. Reduced motion collapses this to an
immediate, correct height, with no growth at all, the same as every other
animated surface in this app.

Issue #197 also described a second case — the bars easing from their
previous heights to new ones whenever the acting player's live result
updated while a calculation was still running — that **no longer happens,
as of issue #294**: a running calculation now shows no bars at all (see
"The Loading State" below), so a settle always draws bars from a bar count
of zero, which this chart's own `./bar-chart.tsx` primitive treats as a
fresh entrance rather than an update to ease between. `bar-chart.tsx` keeps
its own update-easing mechanism regardless — a generic capability of that
primitive, not special-cased to this one caller — but this histogram no
longer reaches it in practice. See
[decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md](../decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md)
for why.

**As of issue #294, the histogram and the legend show a loading state for as
long as the acting player's evaluation is still running — The Loading
State.** Before this change, a running calculation's bars and legend counts
kept reclassifying and redrawing from `equities`/`strengths` on every
progress tick, live, the same as a settled result; as of the decision above,
those buffers carry nothing to classify mid-run, so the sheet shows a
loading treatment instead. What this sheet gates the loading treatment on is
`../../adapter/use-equity-evaluation.ts`'s own `useEquityEvaluationStatus()`
reading `'calculating'` —
`src/features/evaluations/ui/equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s
own `isCalculating`, passed down to
`src/features/evaluations/ui/equity-breakdown-chart/equity-breakdown-chart.tsx` —
never buffer content, since a progress tick's `NaN`-filled buffers are
indistinguishable, by content alone, from a settled result with no live
card pairs at all. This sheet holds no per-player status of its own: the
one evaluation store drives exactly one job across every current player at
once, never one job per player, so the run-level status is exactly as
specific as a per-player one would be.

The histogram draws its own empty axis frame — the two bounding rules, the
equity axis's fixed `0`/`100` ends and title, and the combos axis's `0`
start and title — through the same `bar-chart.tsx` primitive handed zero
bars, exactly the shape the practically-unreachable "no result" case above
already draws. The one difference from that case: the combos axis's own
upper-bound end label is omitted entirely rather than drawn as `0`, since
this sheet has no settled count yet to round up to a tick, not a settled
count that happens to be zero. A breathing `Calculating` caption — this
project's own standing descriptive term for this state, exposed as visible
copy for the first time by this change — sits centred in the plot area in
place of any bars, over a static second line, `The breakdown appears once
this finishes.`; both are new, drafted copy, not yet reviewed by the
maintainer. The status word loops between a dimmed and a full opacity on
this project's own bespoke perpetual-loop pattern — mirroring
`src/features/evaluations/ui/new-player-fab/new-player-fab.tsx`'s own
resting glow, this app's only other continuous, non-reduced-motion loop,
since [conventions/motion.md](../conventions/motion.md)'s named motion
character has no perpetual-loop primitive of its own — reduced motion
freezes it at full opacity, still and legible, rather than collapsing to a
single target the way a one-shot transition would. The legend's own four
counts each read an en dash in place of a formatted `N combos` figure, since
`0` would read as a settled fact ("no card pair falls in this band") this
sheet has no basis for yet.

**Nothing else on this screen changes.** The header's own result percentage
(`../player-row-content/player-row-content.tsx`'s `resultLabel`) and the
board's own `Calculating` progress bar
(`src/features/evaluations/ui/analyze-screen/analyze-screen.tsx`) both read
`EspadaEquityPlayerResult.equity` and the evaluation store's own aggregate
progress respectively — fields this change leaves untouched — and keep
updating live exactly as before, throughout the run, on the same sheet that
shows the histogram's own loading state beneath them. See
[decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md](../decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md)
for why.

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
shows, how many bars it drew, which axis runs where, the equity range, the
combination-count upper bound this render actually drew, and — as of issue
#262 — each of the four strength bands' own live card-pair count, in the
legend's own order, worded the same "band name: N combos" pairing the
legend's own accessibility label already carries.

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

**As of issue #287, the blocker score is computed and carried to the
JavaScript main thread; as of issue #293, the sheet displays it**, in its
own section below the Rank Pair list (see
[The Blocker Score Section](#the-blocker-score-section) below). What
follows first states the score's own model — what a settled equity job's
result carries, derived from the equity engine's existing per-card-pair
accounting — before turning to how the sheet presents it.

For one **card pair** held by one player, against one opponent, the blocker
score is the signed shift the pair causes in that opponent's mean **equity**
by removing the opponent's own **live card pairs** that share a card with it
— a fraction in `[−1, 1]`: positive means holding the pair leaves the
opponent weaker, negative means stronger. A score is scoped to one opponent
and is never averaged across opponents — at a table of more than two
players, each of a player's live card pairs carries one score per opponent,
not one score for the table. An opponent's mean equity — both the baseline
the shift is measured from and the restricted mean it is measured against —
is the same weight-weighted mean the opponent's own aggregate `equity`
figure already is: the ratio of accumulated share weight to accumulated
total weight, summed over the pairs in scope, not a flat mean taken over a
count of live pairs. See
[decisions/2026-09-06-weight-the-blocker-scores-mean-by-accumulated-card-pair-weight.md](../decisions/2026-09-06-weight-the-blocker-scores-mean-by-accumulated-card-pair-weight.md)
for why.

A card pair receives a score against an opponent exactly when it is live —
its accumulated weight across the walk is positive, the same test the
Equity Breakdown histogram above already applies to classify a settled
buffer's own live slots. The score exists at settlement only; a progress
tick carries none. As of issue #294, a card pair's own equity is
settlement-only for this same JavaScript-visible liveness test too: the
engine still tracks accumulated weight internally throughout the walk (this
is what settlement's own liveness test above reads), but the fixed-slot
buffers described next expose it to the JavaScript side only once settled,
not on every tick — see
[decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md](../decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md)
for why.

As of issue #261, a hand-range player's engine result
(`EspadaEquityPlayerResult`) carries two fixed-slot buffers of
`CARD_PAIR_COUNT` (1,326) 32-bit floats — `equities` and `strengths`, one
slot per **card pair number**. As of issue #294, both are filled only at
settlement, the same cadence `blockerScores` below already keeps: a progress
tick carries every slot of both at the sentinel `NaN`. A settled buffer's
card pair that was not live carries `NaN` in both slots; a live pair carries
its final equity in `equities` and its final current strength in
`strengths`, except preflop, where every `strengths` slot is `NaN`
regardless of liveness. The Equity Breakdown Sheet section above describes
how the histogram classifies each live slot from these same two buffers
once settled, and what it shows in their place while the calculation is
still running.

`blockerScores` — the second, opponent-scoped buffer — is a third fixed-slot
buffer on that same result, settlement only: `CARD_PAIR_COUNT × (players −
1)` 64-bit floats, row-major by card pair number and then by a skip-self
opponent ordinal — the opponent's own seat index, minus one when the
opponent sits past the scoring player, so at a three-seat table the player
in seat 1 reads seats 0 and 2 as ordinals 0 and 1. A card pair that is not
live carries `NaN` in every one of its score slots; a live pair carries a
finite value in all of them. A progress tick carries this buffer empty,
exactly as it already carries `distribution` and `pairs` empty.

The **card pair number** is the number both sides agree on, derived from
the deck order: a card is numbered `rank × 4 + suit`, rank running 0 for a
deuce to 12 for an ace, suit running 0 for spades, 1 for hearts, 2 for
diamonds, 3 for clubs — the app's own `DECK` enumeration order. The
engine's own rank ordinal runs the other way — ace first, deuce last, the
reverse of this numbering — so the engine maps its ordinal onto the
deuce-first one before applying the formula. A card pair `{a, b}` with
`a < b` is numbered `a × 51 − a × (a − 1) / 2 + (b − a − 1)`, mapping the
1,326 pairs onto `0` through `1325` one to one: 2♠2♥ is 0, 2♦2♣ is 101,
A♠A♥ is 1320, and A♦A♣ is 1325.

If the settlement cost this adds is ever watched in the field, the number to
record is the wall time in the app from starting a job to receiving its
settled result — the app-side start-to-settle measurement point the design
leaves a place for. Nothing measures or sends it yet.

The score's definition is recorded in
[decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md](../decisions/2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md);
the `equities`/`strengths` fixed-slot buffer contract's settlement-only
cadence is recorded in
[decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md](../decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md)
(superseding `decisions/2026-09-05-carry-per-card-pair-equity-and-strength-as-fixed-slot-buffers-on-every-tick.md`);
the mean-weighting decision above is recorded in
[decisions/2026-09-06-weight-the-blocker-scores-mean-by-accumulated-card-pair-weight.md](../decisions/2026-09-06-weight-the-blocker-scores-mean-by-accumulated-card-pair-weight.md).

### The Blocker Score Section

**As of issue #293, a Blocker Score section follows the Rank Pair list** —
`src/features/evaluations/ui/equity-breakdown-blocker-score/
equity-breakdown-blocker-score.tsx` — shown only for a hand-range player,
below the histogram and the Rank Pair list this document already describes.
It carries, for every hand in the acting player's own range, that hand's
blocker score against each opponent, once the calculation has settled. The
design file has no frame for this section; its presentation was chosen from
a two-round exhibit process rather than reproduced from Figma (see
[design-source.md](../operations/design-source.md) for how this project
normally reads the design file, and this section's own token choices in
[conventions/design-system.md](../conventions/design-system.md)'s "The
Blocker Score Section" entry for where that process's substitutions are
recorded).

**Which entries a rank pair produces.** Grouping happens strictly inside
one rank pair; two rank pairs are never merged, however close their
figures. For one rank pair, take its live card pairs and group them by the
tuple of figures they display — one figure per opponent, at signed
percentage points rounded to one decimal, **round-half-away-from-zero**
(`-1.25` reads `-1.3`, not the `-1.2` a bare `Math.round` on the signed
value would give — `src/features/evaluations/model/blocker-score.ts`'s
`roundBlockerScoreToOneDecimal` rounds the magnitude and reattaches the
sign). Then:

- The **largest** group is left implicit and takes the rank pair's own
  label — the sheet's existing chip notation (`AK=`/`AK≠`, no third glyph
  for a pocket pair) — carrying a small `×N` count of how many combos it
  stands for, so it is never read as covering combos that appear on their
  own rows.
- Every card pair outside that group gets its own row, labelled with its
  two exact cards.
- If the largest group holds only one card pair, no rank-pair-labelled row
  appears at all and every row is an individual card pair.
- A tie for largest resolves toward the group containing the earliest card
  pair in **canonical order** — ascending **card pair number**, this
  module's own reading of "canonical" for card pairs within one rank pair,
  there being no prior project concept of an order narrower than the whole
  13×13 grid's own row-major one.

The **group key is the formatted figure, not the raw float**
(`blockerScoreRowsForRankPair`'s own grouping key, built from
`formatBlockerScore`'s output): two card pairs whose raw scores differ only
past the displayed precision group together, and two rows never display the
same figure while sitting apart. A card pair that is not live is never
listed and never counts toward the grouping; a rank pair with no live card
pairs contributes no entry.

Entries follow the same three group headings and the same canonical grid
order the sheet's existing Rank Pair list uses
(`src/features/evaluations/model/rank-pair-groups.ts`'s
`groupRankPairsByGridOrder`, extracted from the Rank Pair list's own module
once this section needed the identical enumeration); a heading with nothing
under it is not drawn.

**Before settlement**, the section shows one placeholder row per rank pair
— never a split-out card pair, since the grouping itself depends on
settled figures — with no digit, no sign, and no bar direction. It resolves
into its final set of rows once the calculation settles. In the same
practically-unreachable no-result case the sheet's header already degrades
for, the section shows this same pre-settlement state rather than stale
figures.

Each figure also draws as a bar diverging from a shared centre zero line —
left for negative, right for positive. The bar's scale is derived, not
fixed: the largest absolute figure among every entry currently listed,
across every opponent, reaches the end of its track, and every other bar
is proportional to it — a blocker score is bounded at ±100 percentage
points but sits within a few of zero in practice, so a fixed scale would
draw nearly every bar as invisible; the accepted cost is that bar lengths
compare within one calculation, not between two.

**Virtualized, not eagerly rendered.** A settled postflop range can
approach one entry per live card pair — up to 1,326 — so this section
renders through a bounded-height, virtualized `FlatList` nested inside the
sheet's own outer scrolling container, a deliberate departure from
`src/features/evaluations/ui/player-list/player-list.tsx`'s own "nesting a
virtualized list inside another scrolling container is a pattern React
Native warns against": that list's own fixed three-row cap makes
virtualization unnecessary there, where this section's own up-to-1,326-row
ceiling makes it necessary. Gesture arbitration between this nested list's
own scroll and the sheet's own drag-to-dismiss gesture has not been
confirmed on a real device as of issue #293 — see that issue's own
Verification Strategy for the manual pass this still needs.

Every figure reaches assistive technology paired with the hand it belongs
to and the opponent it is scored against; a rank-pair-labelled row is
announced as standing for the rest of that rank pair, not the whole of it.

Copy: the section heading is title case. A card-pair-level entry is a
*combo* on screen, per this project's existing correction
([conventions/copy-conventions.md](../conventions/copy-conventions.md));
**card pair** and **rank pair** remain the terms this document and this
project's code use.
