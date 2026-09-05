---
status: accepted
---

# Subscribe `EquityProgressBar` Directly to the Equity Store

`EquityProgressBar` reads its own fill fraction directly off
`use-equity-evaluation.ts`'s own store, through `useEquityEvaluationStore
.subscribe`, rather than taking it as a `progress` prop from its caller.
This is a deliberate, narrow exception to
`docs/conventions/component-contracts.md`'s "Input by Prop, Output by
Callback" rule.

The evaluation's own progress store updates roughly ten times a second
while a calculation runs. Read as a plain prop, that value has to be read
somewhere above this component and handed down — and since `AnalyzeScreen`
was that reader, every one of those ticks re-rendered the entire screen:
`PlayerList`'s own JSX was recreated, cascading into every player row's own,
considerably more expensive render body (gesture handlers, animated styles,
accessibility labels), purely to update one thin bar.

Subscribing to the store directly inside this component, and writing the
result straight into a Reanimated shared value, means a progress tick
reaches this component's own fill with no React re-render anywhere — not of
`AnalyzeScreen`, not of this component itself. The trade accepted: this
component's contract is no longer fully legible from its own props type
alone (its props type carries no `progress`), which is exactly the cost
`component-contracts.md`'s own rule exists to avoid. It is accepted here,
narrowly, because the rule's normal mechanism — a prop — is what caused the
re-render cascade this change exists to fix; a component whose entire
purpose is reacting to a fast-changing external value on the UI thread,
without paying a React render for each change, cannot receive that value
through a prop and still avoid one.

Alternative considered: the prior implementation itself — `progress` as a
plain prop, read once at the top of the screen and handed down. Rejected,
which is why this decision exists: the re-render this caused was the defect
being fixed, and nothing short of removing the prop stops `AnalyzeScreen`
itself from re-rendering on every tick.
