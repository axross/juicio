---
status: accepted
---

# Keep The Hand-Range And Cards Panes Mounted Once Built

`HoldingInputSheet`
(`src/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet.tsx`)
builds each of its two tab panes — `HandRangePane` and `CardsPane` — only
once its own tab has been selected at least once during the current open
(`builtTabs`, tracked by `useHoldingInput`). Once built, a pane stays
mounted, `display: 'none'`'d rather than unmounted, for the rest of that
open, even while its own tab is inactive.

## Context

`CardsPane` (`src/shared/ui/cards-pane/cards-pane.tsx`) measures its own
fan on layout and stores the result in `fanWidth`. Unmounting `CardsPane`
on every switch away from its tab reset that measured value to `null`;
remounting it on switching back meant its fan measured `0` tall for one
frame before the next layout pass re-measured it, and the sheet's own
height — which follows its content — visibly collapsed and sprang back on
every switch back to that tab.

## Decision

Once a pane is built, keep it mounted for the rest of the sheet's open, and
toggle only its visibility (`display: 'none'` on the inactive-but-built
pane) on a tab switch, rather than mounting and unmounting it each time.

## Alternatives considered

- **Unmount and remount each pane on every tab switch, as the sheet did
  before this change.** Rejected: this is exactly the
  height-collapse-and-spring-back defect above.
- **Always mount both panes on open, regardless of which tab the sheet
  opens on.** Rejected: this pays the cost of rendering the hand-range
  grid's own 13-by-13 selection grid on every open, even for a user who
  never visits that tab.

## Consequences

A future change to `HoldingInputSheet`'s tab-mounting strategy must keep an
already-built pane mounted for the rest of the sheet's own open —
reintroducing an unmount on tab switch reintroduces the height glitch this
decision avoids.
