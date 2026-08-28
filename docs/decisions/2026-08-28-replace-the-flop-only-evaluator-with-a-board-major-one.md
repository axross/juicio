---
status: accepted
---

# Replace the Flop-Only Evaluator With a Board-Major One

`modules/espada-engine/lib/espada-internal/` shipped one evaluator,
`FlopExhaustiveEvaluator`, and it could only walk board completions from a
three-card flop. The limit was its shape rather than its parameters: it was
*matchup-major*, fixing one holding per player and then walking the board, so
the same board was re-walked once per matchup. This decision replaces it with
`EquityEvaluator`, which enumerates each board completion once and scores the
union of every player's range against it.

The driving requirement is this project's own Analyze screen.
[`specs/equity-analysis.md`](../specs/equity-analysis.md) describes an Equity
Breakdown sheet plotting, per player, each combo's equity alongside a range
average — per-combo equity **and** the aggregate, from one calculation. Nothing
in this repository supplied either. `EquityEvaluator` emits one `Runout` per
board carrying, for every player and every live holding, that holding's made
hand and its win, tie, share, and total weights, which a consumer accumulates
into both quantities in a single streaming pass.

**Extending the flop-only evaluator to cover the turn, the river, and preflop
was rejected on cost.** A turn and a river are nearly free under the
matchup-major shape, but a flop is not, and preflop is unreachable: the same
board is walked once per matchup, so the cost is the product of the range widths
rather than their sum. The three-player flop against medium ranges — the cell
the Equity Breakdown sheet exists to draw — costs multiple minutes that way,
against a measured 123 ms board-major. Extending the shape would have shipped a
type that misses its budget on the situation it was built for.

**Keeping both evaluators and deprecating the old one was rejected.** A
deprecation period protects existing callers, and there are none: nothing in
this repository calls the evaluator today, and nothing does after this change.
What the fork would carry instead is two evaluators with costs three orders of
magnitude apart and no reader able to tell which to reach for. Removing the old
one in the same change costs nothing and leaves one answer to the question.

**Sampling preflop rather than enumerating it was rejected.** Monte Carlo trades
exactness for a saving that is not there at this precision: reaching ±0.1% at
95% confidence needs a sample count within a small factor of the exhaustive board
count, and ±0.05% needs more samples than the exact answer needs boards. The
suit-isomorphism reduction below is larger than the sampling saving and loses
nothing.

**A batch API returning only the finished aggregate was rejected**, though the
inversion is naturally an aggregation algorithm and returning the finished table
would be simpler. `specs/equity-analysis.md` describes a running "Calculating"
state on the Analyze screen, so the surface has to yield incrementally. The cost
of streaming is one `Vec` allocation of a few tens of kilobytes per board against
roughly 89 µs of evaluation for that same board.

**Suit isomorphism is spent on evaluation, never on emission, and that is the
subtle part.** Where a permutation of the suits leaves both the known board and
every input range unchanged, boards fall into orbits and only one member of each
needs its seven-card hands evaluated. It is tempting to emit that one
representative weighted by its orbit size, which is a great deal cheaper. It is
also wrong: relabelling the suits relabels the *holdings* along with the board,
so a representative's result carries to the rest of its orbit only with every
holding relabelled too. Orbit-weighting is exact for any quantity invariant under
the group — a player's aggregate equity is one — and wrong per holding, which is
precisely the output the Equity Breakdown sheet is drawn from. So one board per
orbit is scored, and the orbit's other boards are emitted from it with the
holdings relabelled. The seven-card evaluations stay at one per orbit; the walk
still yields one `Runout` per board, 2,598,960 of them preflop, and no orbit size
appears anywhere on the public surface. A defect here is invisible to an
aggregate-only test suite, so this repository's suite asserts it directly: two
holdings in the same orbit must report identical equity, checked by name on a
two-tone and on a monotone flop.

**The preflop cost is accepted, not solved.** Measured on this fork, in a release
build on a 4-core container: the three-player flop against medium ranges takes
**123 ms**, and three-player preflop with the same ranges takes **45.9 s**. Both
clear this project's cost budget, but 45.9 s is a long time to hold a phone in
front of a "Calculating" spinner, and no part of this change makes it shorter.
`specs/equity-analysis.md` names no time bound on that state, so nothing in the
spec is contradicted; whether the state is acceptable at that length is a product
question deferred until something actually calls the evaluator.

**Ranges with per-suit weights are worse still, and that is stated rather than
hidden.** Suit isomorphism engages only where every input range is invariant
under the permutation. Ranges written in standard notation are, so the figure
above holds for anything the parser can produce; a range built programmatically
with different weights on different suits collapses the group to the identity and
costs roughly nineteen times as much preflop, which is beyond the budget. No
mitigation ships here.

**Two and three players are implemented; four and five are not.** The opponents'
joint weight has a closed form per player count, and the two shipped are
`T = W_1` heads-up and `T = W_1 W_2 − Σ_z V_1[z] V_2[z] + P_12` at three players.
Four players needs an eight-term form and five a twenty-three-term one; each
becomes its own issue rather than being guessed at here. `EquityEvaluator`
returns an error for a player count it cannot serve, which is a change in kind
from the constructor it replaces — that one panicked through an `unwrap` on any
board that was not exactly three cards.

**The replacement was checked against the code it replaced before that code was
deleted.** This repository's `Showdown::new` rejected a hole card an
earlier-accepted player already held, and its flop walk blocked each accepted
player's cards against the players dealt after them, so the outgoing evaluator
enumerated matchups correctly and was usable as an oracle. The two evaluators'
per-player aggregates were asserted equal, to within `1e-9`, at two and at three
players and on both a rainbow and a two-tone flop, in a commit where both still
compiled; the removal is the commit after it. That check cannot be re-run at the
head of the branch, which is what the commit ordering exists to record.
