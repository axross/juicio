# Component Memoization

Where a shared component's re-render protection is applied, once it is
worth applying at all. [component-contracts.md](./component-contracts.md)
says so itself — it explicitly does not cover "how a component is
composed, tested, or styled internally," which is where a `React.memo`
wrap would otherwise sit; this document is that carved-out gap, filled.
The general practice of when memoizing a component is worth doing at all —
weighing the comparison cost against the render it might skip — belongs to
the installed
[`react-component-development`](../../.claude/skills/react-component-development/SKILL.md)
capability; what follows is only where this project puts that decision
once it has been made.

## Wrap at the Call Site, Not the Definition

A shared component's re-render protection — `React.memo`, and any custom
comparator that goes with it — MUST be applied at the place the component
is rendered, not inside the component's own file. The component's own
definition MUST NOT import `React.memo` or wrap its own export in it.

A call site is the one place that knows whether the props it is about to
hand that component are actually stable enough for the protection to pay
off — a component's own definition cannot know that, and a single,
definition-level choice cannot express that a different future caller of
the same component might need a different answer
(docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md
records the fuller reasoning and the trade-off its first application
accepted).

**Worked example.** `PlayerRow`
([`src/features/evaluations/ui/player-row/player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx))
carries no `React.memo` of its own. `PlayerList`
([`src/features/evaluations/ui/player-list/player-list.tsx`](../../src/features/evaluations/ui/player-list/player-list.tsx)),
the one place `PlayerRow` is rendered today, defines
`MemoizedPlayerRow`, a `React.memo(PlayerRow, ...)` constant whose second
argument is an inline comparator, and renders that instead of `PlayerRow`
directly:

```ts
const MemoizedPlayerRow = memo(PlayerRow, (previous, next) => {
  return previous.player === next.player && /* … */;
});
```

`PlayerList` is also what stabilized the props it hands each row first —
handing every row's own callback the same function reference across
renders, rather than a fresh closure built inside a `.map()` — since a
memo wrap compares props that never carry a fresh reference to begin with
gains nothing over an unmemoized component; the wrap only starts paying
for itself once its caller has done that work.

## A Custom Comparator Belongs Beside the Wrap It Serves

Where `React.memo`'s own default shallow comparison of every prop is not
what a call site actually wants — because one prop is expected to change
for a reason unrelated to what the wrapped component needs to reflect,
say — the custom comparator MUST be defined next to the `memo()` call it
is passed to, in the same file, with a doc comment stating which prop it
treats differently and why. It SHOULD be written as an inline function
literal passed directly as `memo()`'s second argument, rather than as a
separately declared, named function referenced from a distance — a
comparator used in exactly one place has nothing a separate declaration
would add, and an inline literal satisfies "beside the wrap it serves"
more directly than a named one ever can. `PlayerList`'s own comparator on
`MemoizedPlayerRow` is this project's first case: it deliberately
excludes `rowCount` from the props it compares, and states why, and what
that acceptance costs, in the doc comment above that constant — read it
in place rather than reproduced here, since a comparator's own reasoning
is specific to the props of the one component it protects and does not
generalize into a project-wide rule the way the section above does.

## Where This Sits Against Component Contracts and Directory Structure

[component-contracts.md](./component-contracts.md) governs a component's
props contract; this document governs a different, and independent,
question — how a component's *own render* is skipped, which is not part
of that contract at all, since a caller passing the same props either way
cannot tell from the outside whether a render was skipped. Both `memo()`
and its comparator, when one exists, are ordinary values a call-site
module defines and exports nothing further about — no new directory or
file is owed to
[directory-structure.md](./directory-structure.md)'s own colocation rule
merely because a wrap exists, since the wrap is coupled to exactly the one
call-site file it lives in already.
