---
status: accepted
---

# Narrow the Edit Sheet Panel's Width Rather Than Teach Height Awareness

Neither the 13×13 rank-pair grid (`src/shared/ui/selection-grid/selection-grid.tsx`)
nor the card fan (`src/shared/ui/cards-pane/cards-pane.tsx`,
`src/shared/ui/card-fan-geometry.ts`) looks at the viewport's height at all —
each derives its own rendered height purely from the width the sheet's panel
hands it. Once that width is pinned at `PANEL_MAX_WIDTH` (600), nothing stops
either from rendering taller than the panel's own `maxHeight` cap on a
short-and-wide viewport — a tablet in landscape is the clearest case.

## What this project does

`src/shared/ui/edit-sheet-max-width.ts`'s `editSheetMaxWidth` narrows the
panel's own **width** instead of teaching the grid or the fan an independent
height cap: below `PANEL_MAX_WIDTH` it returns `undefined` (both edit sheets
render exactly as they already do), and at or above it, it returns
`screenHeight - insetTop - insetBottom - EDIT_SHEET_VERTICAL_RESERVE`, fed
into `BottomSheet`'s own `maxWidth` prop. A narrower panel gives the grid and
the fan less width to scale from, which brings their derived height back
under the panel's own height cap.

`EDIT_SHEET_VERTICAL_RESERVE` is fixed at 240 — the vertical room reserved for
the sheet's own chrome above whatever height is left for the grid or the fan:
the handle row, a header (the player sheet's tab row), the `CONTENT_GAP`s
between them, plus a margin of comfort. It is a maintainer-chosen figure, not
one read off the design file or measured against either sheet's own real
chrome height. The maintainer confirmed 240 directly as the number to ship,
over measuring each sheet's chrome exactly.

No minimum floor is added beneath a small or negative `editSheetMaxWidth`
result either: the narrowest realistic viewport this project currently has
reason to support does not appear to produce a degenerate width, and no floor
value has any precedent elsewhere in this codebase to draw from. An unusually
short, wide viewport is a residual risk this function does not defend
against.

## Alternatives considered

- **Teach the rank-pair grid and the card fan an independent height cap.**
  Rejected: both derive their layout purely from width today, and giving
  either one a second, height-driven code path would duplicate the geometry
  logic they already have for width, for a case (an edit sheet on a
  short-and-wide viewport) narrowing the panel's width already resolves more
  simply.
- **Measure each sheet's real chrome height and compute the reserve
  precisely**, rather than fixing it at 240. Rejected by the maintainer in
  favour of shipping a single chosen figure now.

## Consequences

A future change to either edit sheet's own chrome (a taller header, an extra
row) can silently push `EDIT_SHEET_VERTICAL_RESERVE`'s 240 out of date, since
nothing recomputes it from the sheet's actual layout. A short, wide viewport
narrower than this function's assumptions is not defended against and stays a
residual risk.
