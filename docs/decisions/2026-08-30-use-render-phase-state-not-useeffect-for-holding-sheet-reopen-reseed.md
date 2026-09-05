---
status: accepted
---

# Use Render-Phase State, Not `useEffect`, For The Holding Sheet's Reopen Reseed

`useHoldingInput` (`src/features/hand-ranges/adapter/use-holding-input.ts`)
reseeds `activeTab`, `holeCards`, `rankPairs`, and `builtTabs` whenever the
card/range input sheet's `visible` prop flips from `false` to `true`. That
reseed runs as a render-phase state adjustment — comparing the incoming
`visible` against a `wasVisible` state during render, and calling every
setter directly — rather than inside a `useEffect`.

## Context

`@/shared/ui/bottom-sheet/bottom-sheet.tsx` stays mounted across `visible`
toggling, but the portalled subtree it renders through
(`@/shared/ui/portal/portal.tsx`'s `usePortal`, called from a
`useLayoutEffect`) genuinely unmounts and remounts on each open. React
flushes a child's layout effect before its parent's passive effect, so
`usePortal`'s remount — nested inside `BottomSheet`, a descendant of
whatever renders `useHoldingInput` — would already be committed by the time
a `useEffect` in this hook got to run. `@/shared/ui/cards-pane/cards-pane.tsx`
derives its own `focusedSlot` once, in a lazy `useState` initializer, on
that exact mount, so an effect-based reseed would land one commit too late:
the freshly mounted pane would already have read its initial focus off the
closed sheet's leftover `holeCards`, before the reset it never saw emptied
them.

## Decision

Adjust `activeTab`, `holeCards`, `rankPairs`, and `builtTabs` during render
instead. Doing so re-runs the hook's whole function body with the seeded
values before React renders any child or commits anything, so
`HoldingInputSheet` builds its `<CardsPane slots={holeCards} …>` element
from the seeded pair, and the pane's lazy initializer never reads anything
but that pair.

## Alternatives considered

- **A `useEffect` keyed on `visible`.** Rejected: the commit-ordering
  problem above — `CardsPane`'s lazy focus initializer would already have
  run against the stale, pre-reset `holeCards` by the time the effect
  fired.

## Consequences

A future change to `useHoldingInput`'s reopen behavior must keep calling
every reseed setter during render (inside the `visible !== wasVisible`
check), never inside a `useEffect` — moving it back into an effect
reintroduces the one-commit-late race this decision avoids.

`@/features/evaluations/adapter/use-board-input.ts` reseeds its own sibling
state the same render-phase way, but its `LeftPacked` fill policy has no
equivalent tolerance for getting this wrong: under `HoldingInputSheet`'s
own `Independent` fill policy, a stale focus ring for one frame is
corrected by the very next pick and costs nothing but a cosmetic flash,
while `useBoardInput`'s `LeftPacked` policy computes each slot's fill state
from position, so a one-commit-late reseed there does not just misplace a
focus ring — it can render an actual, incorrect fill.
