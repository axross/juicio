---
status: accepted
---

# Memoize Shared Components at the Call Site

Issue #162's render audit found that nothing under `src/features/evaluations/ui/`
used `React.memo` at all, which meant a player row's own full render body —
its gesture handlers, its animated styles, its accessibility-label
formatting — paid the cost of every re-render anywhere above it, whatever
caused that re-render. Fixing it raised a question with no existing answer
in this project: once a shared component is worth protecting from an
unrelated re-render, does that protection belong inside the component's own
file, wrapping its own export, or at the place each caller renders it?

The maintainer decided it belongs at the call site, alongside approving
issue #162's own plan on 2026-09-03 — the same plan that moved the Analyze
screen's equity-progress subscription down into the progress bar itself,
shipped in the same change. A component wrapped in `React.memo` inside its
own file makes one choice for every consumer that ever renders it, forever;
a component left unwrapped, protected instead at each call site that
actually needs it, lets a different consumer make a different choice,
because only a call site — not the component's own definition — knows
whether the props it is about to hand down are actually stable enough for
the protection to pay off. `PlayerRow` itself has exactly one caller today
(`player-list.tsx`), so this distinction has no second caller yet to prove
it against; the maintainer's own reasoning is what this record exists to
capture regardless, since a second caller with a different stability
profile — one that, unlike `PlayerList`, cannot cheaply hand every row a
stable callback reference — is exactly the case a definition-level
`memo()` would get wrong for both callers at once.

## Alternatives considered

- **Wrap `PlayerRow` in `React.memo` inside its own file
  (`player-row.tsx`), the default place a component's author reaches for
  this.** Rejected: every future caller of `PlayerRow` would inherit the
  same protection whether or not it can actually supply stable props, and
  a caller that cannot — one that, for whatever reason, must hand down a
  freshly built callback or object on every render — would pay
  `React.memo`'s own comparison cost on every render for a bail-out that
  can never fire, with no way to opt out short of unwrapping the component
  for everyone.
- **Decide per-component, case by case, with no standing rule.** Rejected:
  this project keeps its own conventions written down precisely so a later
  change does not re-litigate a question already settled once. Recording
  the rule now, at its first application, costs one document; leaving it
  unrecorded costs the same question being asked again the next time a
  shared component grows more than one caller.

## Consequences

`player-list.tsx` is the first place this project applies the rule:
`MemoizedPlayerRow`, a `React.memo(PlayerRow, (previous, next) => ...)`
constant defined in that file, not in `player-row.tsx`. `PlayerRow`'s own
file carries no memo wrapping, no comparator, and no reference to this
decision — it stays exactly as free of this concern as it was before, per
[conventions/component-memoization.md](../conventions/component-memoization.md),
the rule this decision is recorded alongside.

That file's own custom comparator also deliberately excludes one of
`PlayerRow`'s props, `rowCount`, from the equality check that decides
whether a row re-renders — not because the rule this record states asks
for that, but because of an interaction the rule's first application
surfaced: `PlayerList` hands every row the same `players.length`, so
comparing it would mean an unrelated player being added or removed
re-renders every existing row again, defeating the point of wrapping this
component at all. The residual cost that acceptance carries — a row's own
in-progress drag gesture can read a stale row count if another player is
added or removed while that exact row is mid-drag, reachable only through
a second, simultaneous touch on an otherwise single-pointer interaction —
is recorded where it is paid, in `player-list.tsx`'s own comparator's doc
comment, not repeated here: this record is about the general
call-site-over-definition-site choice, not about `PlayerRow`'s own specific
props.
