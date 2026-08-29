---
status: accepted
---

# Replace Card-Slot Overwrite Arming With Always-On Focus

Issue #66's own acceptance criteria specified the `Cards` tab's two preview
slots as an arm-for-overwrite model: with both slots empty, a picked card
filled the first empty slot; tapping a filled slot armed it, ringed in the
accent colour, and the next card picked from the fan replaced that slot's
card and disarmed it; tapping the already-armed slot again cleared it
instead. `armedSlot` was a single value on `CardsPaneState` — `0`, `1`, or
`null` for neither slot armed.

That model had a dead state: with both slots full and neither armed, a fan
tap or drag did nothing. Nothing indicated which slot, if either, a pick
would affect, and the only way out was a separate tap to arm one first.

The maintainer replaced it with a focus model, superseding that part of
issue #66's acceptance criteria. One of the two slots always has focus —
`CardsPaneState.focusedSlot` is `0 | 1`, never `null`. Tapping the other slot
moves focus there. Tapping the focused slot clears its card if it holds one.
Choosing a card from the fan always replaces the focused slot's card, filling
it if empty, and focus then advances to the other slot — the maintainer's own
explicit call, confirmed rather than inferred from the rest of the model.
Clearing a slot does not advance focus, so the user can immediately pick a
replacement for the slot they just emptied; that asymmetry (a pick advances
focus, a clear does not) is deliberate.

This closes the dead state entirely: every touch on the pane now does
something. A fan pick always lands somewhere, because a slot is always
focused; a slot tap always either moves focus or clears a card.

No alternative was considered beyond keeping the arm model as issue #66
specified it — the maintainer judged the dead state a design mistake outright,
not one reading among several.

**What focus starts as on a fresh mount is this implementation's own
reading, not something the maintainer specified.** The maintainer settled
what focus does once the pane is mounted, not what it starts as.
Hard-coding it to slot 0 regardless of `slots` would silently overwrite an
already-picked card the moment the pane remounts with one slot pre-filled —
switching the sheet's tabs away from `Cards` and back remounts `CardsPane`,
so a user who had picked one card, switched tabs, and switched back would
have their next pick land on the slot they already filled rather than the
empty one, with nothing signalling that the "second pick" just overwrote the
first rather than completing it. `initialFocusedSlot`
(`src/features/hand-ranges/ui/cards-pane-selection.ts`) instead derives the
starting focus from `slots`: the first empty slot, or slot 0 when neither is
empty — the same rule `selectCard` used before this pane had a focus model
at all. This is a bug-avoidance reading of the maintainer's own "always
actionable" intent, not a maintainer-confirmed rule the way auto-advance is.
