---
status: accepted
---

# Toast a Discarded Partial Input, Not a Clean Cancel

Closing the board input sheet or the card/range input sheet without
submitting resolves to one of four dismissal reasons:
`BoardDismissReason.IncompleteBoard`, and `HoldingDismissReason.
NothingSelected` / `.IncompleteHoleCards` / `.EmptyHandRange`. The Analyze
toast (issue #99) raises for exactly two of the four —
`IncompleteBoard` and `IncompleteHoleCards` — and stays silent for the other
two, `NothingSelected` and `EmptyHandRange`.

The maintainer drew the line at whether the user had actually entered
something the sheet then discarded, not at whether the sheet closed without
submitting. `IncompleteBoard` and `IncompleteHoleCards` both fire only once
at least one card was picked and the sheet still closed short of a count
the app accepts — the user did something, and it was thrown away with
nothing said about it before this change. `NothingSelected` fires when
neither of the card/range sheet's two tabs holds anything at all: the user
opened the sheet and backed straight out, with nothing entered to lose.
`EmptyHandRange` fires when the active `Hand Range` tab's grid is empty at
close — again nothing on that tab, the same "opened and backed out" shape,
even on the reading where a stray pick was left sitting on the inactive
`Cards` tab at the same moment. A toast for either of the two silent
reasons would report a loss to a user who never entered anything to lose;
a toast for the two that fire tells a user something they did was
discarded.

Alternatives considered:

- **Toast on all four dismissal reasons.** Rejected: `NothingSelected` and
  an empty `Hand Range` tab are the ordinary shape of a user opening a
  sheet, looking, and backing out — not a mistake, and reporting one as if
  it were treats "I changed my mind" the same as "the app dropped what I
  picked."
- **Toast on none of the four.** Rejected: a board or holding left at an
  invalid count is genuinely discarded, not merely unsubmitted — the
  previously stored board or holding is what the screen shows afterward,
  never the partial pick — and nothing else in either sheet said so before
  this change.
- **One combined message for every dismissal, rather than naming which
  sheet and which case.** Rejected along with the decision to toast at
  all, not separately: the plan's own approved copy already commits to a
  distinct sentence per reason, including a separate one for adding versus
  editing a player, precisely so the message names what was actually lost.
