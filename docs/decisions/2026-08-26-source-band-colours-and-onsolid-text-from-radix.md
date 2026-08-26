---
status: accepted
---

# Source the Equity Band Colours and onSolid Text From Radix, Not Sampled Hexes or Assumed White

The four equity strength-band colours were sampled hexes read off the
rendered Equity Breakdown legend, not bound to any Radix Colors scale or any
other colour definition in the design file. Matched against every Radix
step in CIELAB, two of the four survived contact and two did not: `Nuts`
`#E54E2F` is `tomato/9` at ΔE 0.53 and `Trash` `#06A5C4` is `cyan/9` at ΔE
3.89, close enough to read as the same colour sampled imprecisely. But
`Marginal` `#C0E360`'s nearest step 9 is `lime/9` — this project's own
brand accent — and `Value` `#D59145` has no near step 9 at all (`brown/9`
at ΔE 23.8, `amber/9` at ΔE 29.7). Keeping the four sampled hexes as
literals was the alternative: it would have kept the closest possible match
to the rendered swatch, at the cost of no step-11 text counterpart to pair
with them (a sampled hex has no "step 11 of the same scale" to derive) and
no path to reasoning about their AA contrast the way a named Radix step
gives.

All four bands were sourced from Radix scales instead, accepting the
colour drift that decision costs on two of the four. `Marginal` moved to
`grass/9` to clear the collision with the brand accent; `Value` moved to
`orange/9` to keep the four-band heat progression (cyan → green → orange →
red) legible, since no scale near the sampled hex existed to source it
from. Each of the four now also carries a step-11 text counterpart from
the same scale, which the sampled hexes could not have provided at any
cost.

Separately, `text.onSolid` — the foreground colour for text drawn on a
scheme's own step-9/10 solid fill, a pairing no Radix step itself
specifies — was set by Radix's own documented rule (`Sky`, `Mint`, `Lime`,
`Yellow`, `Amber` take dark text on their solid steps; every other scale
takes white) rather than by assuming white for every scheme, which is the
mistake the rule exists to prevent: this project's accent scale is `lime`,
in the dark-text group, so assuming white there would have shipped
unreadable button labels. The rule was applied mechanically to all three
schemes this project declares, including `neutral` (`olive`) and
`destructive` (`ruby`), neither of which is in the dark-text group, so both
take white.

Two of the resulting `text.onSolid` pairings, and the `Value` band's own
text counterpart, clear only the WCAG 2 AA large-text floor rather than the
normal-text floor Radix's guarantee for steps 11 and 12 does not extend to
step 9 or 10 foregrounds at all — Radix guarantees step 9 under APCA, not
WCAG 2. That is accepted as a type-size constraint on wherever those three
pairings are used, not as a reason to override the rule or the band
sourcing above.
