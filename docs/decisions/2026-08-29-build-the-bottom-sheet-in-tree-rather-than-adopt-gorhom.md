---
status: superseded
superseded_by: 2026-09-04-extend-bottom-sheet-drag-to-move-close-into-content.md
---

# Build the Bottom Sheet In-Tree Rather Than Adopt @gorhom/bottom-sheet

The card/range input sheet needed a bottom sheet, and
`@gorhom/bottom-sheet` is the library a React Native project usually reaches
for. This project wrote its own instead: `src/shared/ui/bottom-sheet/`, a
single-detent sheet with a drag-to-dismiss handle, a handle tap, a scrim tap,
and a Reanimated shared value driving both the sheet's `translateY` and the
scrim's opacity from one timeline.

The library would have brought snap points, a backdrop, keyboard avoidance,
and a scroll-aware inner view for free. None of those is what this sheet
needs: it has one detent, no keyboard, and no scrollable content. What it
does need — dismissal by three gestures resolving to exactly one outcome
callback, per
[Component Contracts](../conventions/component-contracts.md) — is the part
the library leaves to its caller anyway.

Against that, adopting it costs `@gorhom/bottom-sheet` plus `@gorhom/portal`,
and a compatibility check against Expo SDK 57 and Reanimated 4 that this
project would then own on every SDK bump. This repository already draws its
own icons and illustrations rather than pulling an icon package, and keeps
its dependency list short deliberately; a dependency whose useful surface
here is a `translateY` spring is not where that budget goes.

The trade-off is real and is not being minimised. The in-tree sheet has no
snap points, no keyboard avoidance, and no scroll coordination, so the board's
five-slot variant and any future sheet that needs one of those inherits the
work rather than the library. If a second or third sheet turns out to need
them, revisiting this is cheaper than it looks — the sheet's callers depend on
its props and its two outcome callbacks, not on how it animates.

Not verified on a real device at the time this was recorded: the dismiss
distance and velocity thresholds (`0.5` of the sheet's height, `500`) are
taken from what interactive-transition heuristics generally treat as a
deliberate flick, not from this project's design file, which specifies no
dismissal physics at all.
