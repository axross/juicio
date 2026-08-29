---
status: accepted
---

# Correct the Suited-Ace Shorthand Label to A2s+

The design file draws the hand-range grid's first shorthand chip with the
label `A*s`. `A*s` is not standard hand-range notation — no other range tool
a poker player already uses writes "every suited ace" that way.

The shipped label is `A2s+` instead. It selects exactly the same rank pairs
the design's `A*s` did — every suited ace, `AKs` down to `A2s` — expressed in
the notation everyone else already reads: the deuce is the weakest kicker, and
`+` means "and up", the same convention the grid's own `55+` chip already
uses for pocket pairs.

No alternative was considered beyond keeping `A*s` as drawn: the maintainer
judged it a design mistake outright, not one reading among several.

`A2s+` was already this shorthand's own espada range-notation token —
`HAND_RANGE_SHORTHANDS`' `token` field, which every other shorthand's label
and token already disagree on (`55+`'s label and token match too, but
`98s-54s`'s token is the five-item comma list `98s,87s,76s,65s,54s`, not its
own label). Correcting the label to `A2s+` makes this one entry's label and
token the same string; that is a side effect of picking the standard
notation, not a goal chosen for its own sake, but a reader who notices the
two fields now match should not read it as a mistake.

The design file still draws `A*s`. A later session that opens Figma will
still find it there and must not read it as current.
