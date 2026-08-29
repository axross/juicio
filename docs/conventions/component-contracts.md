# Component Contracts

This project's own rule for how a component, a use case, or a hook exposes
what it does: its input arrives as arguments — props, for a component — and
its result leaves the same way, through a callback passed in as an
argument. It does not cover where a file lives (see
[directory-structure.md](./directory-structure.md)) or how a component is
composed, tested, or styled internally — the installed
[`react-component-development`](../../.claude/skills/react-component-development/SKILL.md)
and
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capabilities own that. What follows is narrower and applies beyond
components too: a use case that resolves its result through a passed-in
callback rather than a return value a caller has to branch on, and a hook
that does the same, both meet this document's rule exactly as a component
does.

## Input by Prop, Output by Callback

A component MUST take everything it needs as an argument and MUST hand its
result back only through a callback its caller passed in as an argument. A
component MUST NOT mutate shared state to report a result, and a caller
MUST NOT reach into a component's internals — a ref exposing imperative
methods, a store the component happens to write to — to learn what
happened. This is what keeps a component's contract legible from its own
signature: everything it needs and everything it can do is named in its
props type, with nothing to discover by reading the component's body.

## Name a Callback for the Outcome, Not the Mechanism

A callback prop MUST be named for the outcome it reports, not the mechanism
that triggers it — `onSubmit`, `onDismiss`, never `onClose`, `onChange`. A
caller reading the prop name alone MUST be able to tell what happened
without inspecting an argument first: `onDismiss` says a sheet was
dismissed; `onClose` says only that something is now closed, and forces the
caller back into the component's implementation to learn why. The same
rule holds for a use case's or a hook's result callback — `onOrderPlaced`
over `onComplete`, `onValidationFailed` over `onError` when the failure has
a more specific name available.

## Exactly One Outcome Callback, Exactly Once

A component MUST fire exactly one of its outcome callbacks per completed
interaction, and MUST fire it exactly once. A sheet that both submits and
dismisses on the same interaction, or a submit that fires twice because a
double-tap was not guarded against, breaks a caller's assumption that one
interaction produces one reported outcome — the same assumption that makes
`onSubmit` and `onDismiss` safe to treat as mutually exclusive rather than
requiring a caller to reconcile two calls into one result.

## A Reason Enum for the Unsuccessful Path

Where a component's unsuccessful path can happen for more than one reason,
its callback MUST carry a reason enum, not a boolean or a nullable result.
A caller that only learns *that* an interaction did not succeed, with no
way to learn *why*, cannot tell "the user cancelled without trying"
apart from "the user started and abandoned a partial entry" — the two
call for different follow-up (do nothing, versus offer to resume a draft),
and a `null` carries no way to choose between them after the fact.

**Worked example.** `HoldingInputSheetProps` below does not exist yet — a
later run builds it — but is recorded here as the shape this rule produces,
since a written example says more than the rule alone:

```ts
type HoldingInputSheetProps = {
  visible: boolean;
  initialHolding?: Holding;
  onSubmit: (holding: Holding) => void;
  onDismiss: (reason: HoldingDismissReason) => void;
};

enum HoldingDismissReason {
  NothingSelected = 'nothing-selected',
  IncompleteHoleCards = 'incomplete-hole-cards',
  EmptyHandRange = 'empty-hand-range',
}
```

`onSubmit` and `onDismiss` are named for their outcomes, per [Name a
Callback for the Outcome, Not the Mechanism](#name-a-callback-for-the-outcome-not-the-mechanism)
above; `HoldingDismissReason` is what lets a caller of this future sheet
tell `NothingSelected` (nothing to recover — the user backed out before
starting) apart from `IncompleteHoleCards` or `EmptyHandRange` (a partial
entry worth offering to resume), which a boolean `onDismiss()` or a
nullable `onSubmit(holding: Holding | null)` could not distinguish.

## Where This Sits Against Directory Structure

[directory-structure.md](./directory-structure.md) governs where a
component, a use case, or a hook lives and which tier may import which;
this document governs the shape of what crosses that boundary once the
placement is settled. The two questions are independent — a use case
placed correctly in `usecase/` still owes its caller a callback named for
the outcome, and a component placed correctly in `ui/` still owes its
caller exactly one fired outcome per interaction.
