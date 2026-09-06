---
status: accepted
---

# Author the Presets Never-Saved Illustration in the Repository

The Presets tab's never-saved empty state (issue #253) needed its own
illustration, distinct from the shark-and-fish illustration Analyze uses and
that the Presets tab's other two non-list states keep. No
design-file frame exists for it: the one frame named for this state,
`Presets/Empty` (`600:31737`), actually renders a fully populated six-item
list rather than an empty one (docs/operations/design-source.md).

The illustration — a 6×6 rank-pair grid seen in perspective with a poker
chip standing where the AA cell would be — is authored directly in this
repository as raw SVG markup, in the same fixed, theme-independent style the
shark illustration already established, under these constraints:

- Fills only; no strokes or gradients.
- Every colour is fixed in both themes, drawn from the shark's own palette —
  `#212220` for the body colour, `#687066` for the highlight colour — plus
  the body colour at 40% opacity for the chip's own contact shadow.
- The grid is tilted about 44° in depth, so the surface reads as a plane
  rather than a flat frontal grid.
- The standing chip is drawn as a screen-facing circle, not a perspective
  disc.
- The canvas is 174×148.311, matching the shark illustration's own canvas
  exactly, so swapping the illustration leaves the empty state's layout —
  the fixed gap to the heading below it — unaffected.

## Alternatives considered

- **Wait for a design-file frame before shipping this state's own
  illustration.** Rejected: no such frame is planned, and the state would
  otherwise keep showing the shark indefinitely with nothing to distinguish
  it from Analyze's own empty state or the other two Presets states.
- **Draw the standing chip as a true perspective disc**, matching the
  grid's own 44° tilt. Rejected: a disc that shallow reads as visually
  indistinguishable from a chip lying flat on the grid, which is the
  opposite of what "standing in the missing AA cell" is meant to show; a
  screen-facing circle reads unambiguously as a chip on edge instead.
- **Give this illustration its own canvas size**, sized to whatever the
  artwork's own proportions suggested. Rejected: `EmptyState`'s layout — the
  fixed gap between the illustration and the heading below it — was tuned
  against the shark's own 174×148.311 canvas; matching that canvas exactly
  is what keeps every empty state's layout identical regardless of which
  illustration it shows.

## Consequences

A later sync against the design file must not expect to find this
illustration there — it has no design-file source and is not meant to
gain one. `docs/specs/hand-ranges.md`'s Preset List section records which
illustration each non-list state shows and links here for why. A future
change to this illustration's own colours or fills-only construction should
either stay inside the constraints above or record why they no longer hold.
