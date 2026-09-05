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

`HoldingInputSheet` verifiably builds each pane lazily, then keeps it
mounted for the rest of the sheet's open: `builtTabs` tracks which tabs
have been selected at least once, and a built-but-inactive pane is
`display: 'none'`'d rather than removed. Once built, neither pane is ever
unmounted and rebuilt while the sheet stays open — a tab switch only
toggles which pane is visible.

This approach was originally adopted on the belief that unmounting
`CardsPane` (`src/shared/ui/cards-pane/cards-pane.tsx`) on a switch away
from its tab reset its measured `fanWidth` to `null`, and that remounting
it on switching back therefore measured a collapsed fan for one frame
before the next layout pass corrected it — visibly collapsing and
springing back the sheet's own height, which follows its content, on every
switch back to that tab.

An independent review of this record raised that this mechanism does not
hold up against `cards-pane.tsx` as it stands: `fanWidth` there resolves as
`measuredFanWidth ?? computedFanWidth`, and `computedFanWidth` is computed
synchronously, on every render, from geometry `useUnistyles()`'s `rt`
already carries — no layout pass required. On a fresh mount or a remount
alike, `measuredFanWidth` starts `null` and `fanWidth` falls back to
`computedFanWidth` immediately, which that same file's own comment on
`handleFanLayout` states already matches what the later layout
measurement reports. That fallback should already keep a remounted
`CardsPane` from resolving to a collapsed fan width in the first place —
so whether the collapse-and-spring-back defect this decision was written
to avoid still exists against the current code, or ever manifested exactly
as described, has not been confirmed.

## Decision

Once a pane is built, keep it mounted for the rest of the sheet's open, and
toggle only its visibility (`display: 'none'` on the inactive-but-built
pane) on a tab switch, rather than mounting and unmounting it each time.

## Alternatives considered

- **Unmount and remount each pane on every tab switch, as the sheet did
  before this change.** Rejected on the belief that it caused the
  height-collapse-and-spring-back defect described above — a belief the
  Context section above no longer treats as confirmed against the current
  `cards-pane.tsx`.
- **Always mount both panes on open, regardless of which tab the sheet
  opens on.** Rejected: this pays the cost of rendering the hand-range
  grid's own 13-by-13 selection grid on every open, even for a user who
  never visits that tab. This reason is independent of the disputed
  fan-width claim above and stands regardless of its outcome.

## Consequences

Keeping an already-built pane mounted for the rest of the sheet's own open
stays this project's default until someone re-confirms, on a real device
or by re-tracing `cards-pane.tsx`'s fallback logic at the time of the
change, whether remounting `CardsPane` or the hand-range pane actually
reproduces a visible height collapse. Once that is confirmed one way or
the other, this record should be updated (or superseded) accordingly. Until
then, a future change should treat reverting to unmount-based tab
switching as needing that confirmation first, not as flatly forbidden.
