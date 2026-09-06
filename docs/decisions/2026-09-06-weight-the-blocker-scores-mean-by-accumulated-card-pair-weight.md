---
status: accepted
---

# Weight the Blocker Score's Mean by Accumulated Card-Pair Weight

Implementing #287 needed one number the specification's own definition left
open: an opponent's **mean equity** — both the baseline the blocker score is
a shift from, and the restricted mean it is measured against once a scoring
pair's blocked holdings are removed — can be taken two ways. A flat mean
divides by a count of the opponent's own live card pairs, each pair
contributing equally regardless of how much of the runout walk actually
supported it. A weight-weighted mean instead divides the summed
`share_weight` by the summed `total_weight` across the pairs in scope — the
same ratio the engine already accumulates per pair
(`modules/espada-engine/lib/espada-engine/src/equity_job.rs`) and already
sums, over a player's *whole* live set, into that player's own aggregate
`equity` figure.

The maintainer chose the weight-weighted mean. Taken over an opponent's
whole live set, it reproduces that opponent's own aggregate `equity` exactly
— the same number already crossing the native boundary on every progress
tick and at settlement — rather than introducing a second, differently
derived figure that happens to describe the same opponent. A flat mean has
no such correspondence: two accumulators can each carry the same
`total_weight` sum while differing in how many distinct pairs contributed
it, so a flat mean and the weighted aggregate `equity` would disagree
whenever a hand-range player's own live pairs were not walked to equal
weight — which the runout walk gives no guarantee of.

This is also what makes the algorithm settlement can afford: an opponent's
mean over any subset of its live pairs is the ratio of the subset's own
summed `share_weight` to its summed `total_weight`, recoverable from three
per-opponent sums computed once per opponent rather than by re-deriving a
count-based average per scoring pair.

Alternatives considered:

- **A flat mean over the opponent's own live card pair count.** Rejected:
  it would not agree with the opponent's own settled `equity` field over the
  whole live set, handing a reader two numbers that describe the same thing
  but can disagree — exactly the outcome the maintainer weighed against when
  this was put to them.
