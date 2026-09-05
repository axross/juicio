---
status: accepted
---

# Submit an Empty Board Instead of Dismissing It

`resolveBoardOutcome`'s own close-time decision treats a board input sheet
closed with no cards picked as a submission — an empty `Board` — rather than
as a dismissal. This is the one rule in that function most likely to read
the other way round on first encounter, since every other under-filled
count (one or two cards) dismisses instead.

The board is not a player's holding. An equity calculation is well-defined
against a board of zero, three, four, or five cards — the flop, turn, and
river phases, plus the preflop case a zero-length board represents — so
backing out of the sheet having picked nothing closes on a value the engine
can already evaluate, exactly as closing it at three, four, or five cards
does. One or two cards is different: neither is a length a hold'em board can
legally stop at (a flop deals three cards at once), so there is no board
value to submit at those counts, and dismissal is the only outcome left.

Alternative considered: treating "no cards picked" as equivalent to
"nothing to submit," and dismissing the same way one or two cards does.
Rejected — an empty board is not an incomplete one; it is the preflop case,
a board every future equity calculation is defined against, and reading it
as a dismissal would discard a deliberate preflop submission and leave the
previously stored board in place instead, which is not what closing the
sheet with an empty board is asking for.

One consequence follows directly: submitting an empty board clears whatever
cards the board previously held back to five empty slots, the same as
submitting any other board length does. Backing out of the sheet is not a
no-op just because nothing was picked.
