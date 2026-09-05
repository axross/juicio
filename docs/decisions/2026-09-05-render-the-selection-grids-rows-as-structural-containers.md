---
status: accepted
---

# Render the Selection Grid's Rows as Structural Containers, Not `flexWrap`

`SelectionGrid` (`src/shared/ui/selection-grid/selection-grid.tsx`) draws its
grid as `rows` explicit row `View`s stacked in a column, each holding exactly
`columns` cells, rather than as one `flexDirection: 'row', flexWrap: 'wrap'`
container that relies on wrapping to produce rows.

## What this project does

The column count is structural: nothing in this component ever decides to
wrap a row, so no rounding direction can produce one. `resolveCellIndex`'s
own hit-test math (`computeCellWidth`) relies on the same guarantee — it does
not floor a cell's computed width to the device pixel grid, since the
wrapping risk that flooring once guarded against is gone.

## Alternatives considered

- **A single `flexWrap: 'wrap'` container**, this component's original
  shape. `flexWrap` decides where a row breaks from the measured widths it's
  given, and React Native rounds each child's width to the device pixel grid
  independently per child. On a real 13×13 rank-pair grid, that rounding
  pushed thirteen cells' summed width past the container's measured width by
  a fraction, wrapping the thirteenth cell to a fourteenth row (observed as
  row 1 reading `AA` through `A3s`, twelve cells, with `A2s` starting row 2).
  Rejected once this reflow surfaced on a real device.
- **Flooring the hit-test cell width to the device pixel grid**, to keep the
  thirteenth cell from wrapping under the `flexWrap` shape above. Once the
  row count became structural, this floor was no longer needed to prevent a
  wrap, and it had become a live disagreement of its own: it made the
  hit-test's cell narrower than the cell flex actually draws, so a touch
  near a cell's trailing edge could resolve one column short of where it
  visibly landed. Removed.

## Consequences

`resolveCellIndex` and `computeCellWidth` must keep matching flex's own
arithmetic exactly — any future rounding or flooring reintroduced into
either one risks the same hit-test drift the removed floor caused.
