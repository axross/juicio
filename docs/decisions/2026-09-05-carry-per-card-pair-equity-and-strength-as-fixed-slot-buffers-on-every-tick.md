---
status: accepted
---

# Carry Per-Card-Pair Equity and Strength as Fixed-Slot Buffers on Every Tick

`2026-09-05-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers-under-a-stated-card-pair-numbering.md`
confined a hand-range player's per-card-pair equity and current strength to
the settled result, fixed-slot and settlement-only, because the maintainer
intended to raise the app's progress callback rate from 10 Hz toward 20–30
Hz and a per-tick payload of that size would work against it. Stage 2 of
issue #212 (#244) then shipped a different shape on every progress tick
without citing or superseding that record: one JavaScript object per live
card pair, rebuilt one property at a time on the JavaScript thread on each
tick — about eight thousand conversion calls per hand-range player at ten
ticks a second — because nothing coalesces ticks and the sheet reclassifies
every pair on each one while it is open. Neither the settlement record nor
#244 measured that per-tick conversion's wall-clock cost; a 2026-09-05
inspection found the conflict between the two and folded its resolution
into issue #261 rather than opening a separate one.

The session read the pinned `nitrogen` 0.37.1 and `react-native-nitro-modules`
0.37.0 sources: an `ArrayBuffer` is accepted as a struct field, including
inside an array carried by a callback, and crosses in one constant-time,
zero-copy call, with its native buffer owned by the JavaScript wrapper that
receives it and freed when that wrapper is collected — carrying forward the
settlement record's own finding, from the same sources, that a plain
`number[]` or string-keyed array field converts on the JavaScript thread one
JSI call per element with no typed-array fast path, and that a string
element additionally allocates. The per-tick shape #244 shipped keeps
exactly that per-element cost on the JavaScript thread that also renders the
sheet, on every tick, for as long as the sheet stays open.

The maintainer chose to send `equities` and `strengths` — each a fixed-slot
buffer of `CARD_PAIR_COUNT` (1,326) 32-bit floats, one slot per **card pair
number** — on every progress tick as well as at settlement, replacing the
per-tick per-element list rather than measuring its cost first. The
identity-bearing card-pair list and the 20-bin `distribution` histogram stay
in the result, still fixed-slot, but move to settlement only: no consumer
reads a card pair's own identity on a progress tick, and the histogram's bar
heights are already a fold of the same per-pair equities the new buffers
carry, so nothing is lost by classifying live bars from the buffers instead.
This carries forward the settlement record's rejection of string-keyed codes
and plain `number[]` arrays, and its rule that a blocker score crosses at
settlement only — unaffected by this change, since the blocker score itself
remains unbuilt.

Alternatives considered:

- **16-bit fixed-point buffers.** Half the bytes, but `NaN` is unavailable
  so a sentinel value has to be reserved, and the app has to convert every
  slot before classifying; rejected by the maintainer in favour of 32-bit
  floats.
- **64-bit float buffers.** Matches the Blocker Score section's original
  wording, but doubles the payload past the documented per-tick budget for
  no precision the display or the rule needs; rejected by the maintainer.
- **Dropping the card-pair list and the distribution.** Nothing reads the
  identities and the distribution is derivable, but the maintainer chose to
  keep both at settlement.
- **Sending current strength once, on the first tick only.** Saves 5 KB per
  player per tick but makes the first tick special and adds state to the
  app; not taken.
- **Reusing one native buffer across ticks.** Avoids per-tick allocation,
  but the sheet reads the buffer during render, after the callback
  returned, so a reused buffer could change under a render; not taken.
- **Measuring the current shape on a device first.** Chosen against by the
  maintainer: the per-element conversion is removed regardless of its
  measured cost.

A fresh buffer pair per player per tick is invisible to the JavaScript
engine's own memory accounting, so native memory may be freed later than it
is allocated at high tick rates; this is bounded by the 10 Hz rate this
change keeps; a rate raised toward 20–30 Hz should revisit this decision
with a measurement rather than reusing this reasoning unmeasured.
