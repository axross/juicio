---
status: accepted
---

# Set the Focus Ring's Clearance to 6

`CardsPane`'s focus ring (`src/shared/ui/cards-pane/cards-pane.tsx`) sits
`FOCUS_RING_OFFSET` outside each preview slot's own edge. Neither
`docs/specs/hand-ranges.md` nor `docs/conventions/design-system.md` gives a
measured value for this clearance, so — like that same file's
`CANDIDATE_LIFT` — this is a maintainer choice, not a design-file
measurement.

## What this project does

`FOCUS_RING_OFFSET` is `6`. Combined with the ring's `theme.borderWidth.thick`
(2-wide) border, that leaves a 4px gap between the slot's edge and the ring's
inner edge.

## Alternatives considered

- **A 4 offset** (a 2px gap) and **a 3 offset** (a 1px gap). Both were tried
  before 6; the maintainer found both too small on a real device and settled
  on 6 once neither read clearly enough.

## Consequences

A future change to `PREVIEW_SLOT`'s own dimensions, or to
`theme.borderWidth.thick`, may call this exact figure back into question;
nothing here derives 6 from a formula a future change could recompute, so
revisiting it means judging clearance on a real device again, the same way
this one was chosen.
