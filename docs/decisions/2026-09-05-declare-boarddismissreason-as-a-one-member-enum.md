---
status: accepted
---

# Declare `BoardDismissReason` as a One-Member Enum

The board input sheet's `resolveBoardOutcome` has exactly one way to close
without submitting: one or two picked cards, neither of which is a legal
board length. `BoardDismissReason` names that single case
(`IncompleteBoard`) as an enum with one member, rather than a bare
`onDismiss()` with no reason argument at all.

`docs/conventions/component-contracts.md`'s own rule for a reason enum
("A Reason Enum for the Unsuccessful Path") is stated for a component whose
unsuccessful path can happen for more than one reason — this sheet's cannot,
today. The enum shape was kept anyway, ahead of that rule's own stated bar,
for two reasons. First, consistency: the sibling card/range input sheet's own
`HoldingDismissReason` already reads as an enum with several members, and a
caller handling one sheet's dismissal already switches on a reason value —
asking it to handle this sheet's dismissal differently, as a bare callback
with no argument, buys nothing and costs a caller a second calling
convention to remember. Second, and more durable: adding a second dismissal
reason to this sheet later — a validation failure on a specific card, say —
must not become a breaking change to every caller's `onDismiss` signature.
An enum absorbs a new member without changing its own shape; a bare
`onDismiss()` becoming `onDismiss(reason)` changes every call site that
previously called it with no argument.

Alternative considered: a bare `onDismiss()` with no reason, added only if
and when a second reason is ever needed. Rejected — the cost of adding the
enum now, while there is only one member to name, is a single line; the cost
of retrofitting it onto an established no-argument callback across every
caller later is larger and falls on whichever change first needs a second
reason, not on this one.
