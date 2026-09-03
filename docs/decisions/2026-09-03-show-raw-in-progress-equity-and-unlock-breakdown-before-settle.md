---
status: accepted
---

# Show Raw In-Progress Equity, and Unlock the Breakdown Before Settle

Issue #143 made a player row's own equity figure appear and keep updating
throughout a running calculation, rather than staying hidden until the whole
calculation settles. Making that change required the maintainer to settle
two questions the issue's own spec left open, both decided when the issue's
plan was approved on 2026-09-03: whether a hand-range row's Equity Breakdown
detail should stay locked until the calculation finishes, and whether the
numbers shown while still running should be exactly what the engine has
currently accumulated, or held back until some threshold of sample size or
completion made them less noisy.

The maintainer chose to unlock a hand-range row's Equity Breakdown detail
the moment its own row shows any number at all — including one still
updating mid-calculation — rather than gating it on the calculation's own
completion, and to show the equity engine's own raw, currently-accumulated
numbers exactly as they arrive, with no minimum-sample-size or confidence
threshold suppressing an early, statistically noisy Monte Carlo estimate.
Per the maintainer's own answers on issue #143: the feature's entire point
is to show the calculation happening, not to wait for it to finish before
saying anything.

Alternatives considered:

- **Lock the Equity Breakdown detail until the calculation settles.**
  Rejected: a hand-range row's own headline figure already updates live once
  this change ships, and gating only the detail sheet behind settlement
  would leave the row and its own detail press disagreeing about whether
  there is currently anything to show — a reader can already see a number
  changing on the row but would be told there is nothing to look into yet.
- **Withhold a number until a minimum sample size or completion percentage
  is reached, to avoid showing an early, statistically noisy figure.**
  Rejected: a fixed threshold has no principled value to pick, adds a second
  piece of state and a second failure mode (a table narrow enough, or a
  situation unusual enough, that the threshold is never reached before the
  calculation itself finishes) for a feature whose entire point is showing
  the calculation as it actually runs, not a filtered view of it.

Both alternatives would have added complexity in exchange for hiding
information the engine already has, rather than in exchange for anything a
reader actually needs — the simplest behavior, showing whatever the engine
currently has, was chosen over either.
