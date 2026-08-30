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

## Declare Props Inline, Not as a Separate Type

A component's props MUST be declared as its function's own argument type,
never as a separately named `type XProps = {...}` declared above it and
referenced by name. The function signature is the one place a reader already
looks to learn what a component takes; a separate named type is a second
place the same shape can be read from, and the two drift the moment one is
edited without the other — a risk with nothing to gain here, since nothing
about a props type needs a name of its own to be reused elsewhere in the same
file. Per-prop doc comments stay exactly where they already are, written
inline on the type literal in the function signature; moving the props inline
does not move or shorten them.

Where a component's props type is part of this project's own public surface —
imported by name from a test or another module — declare that name as an
alias derived from the function itself, `ComponentProps<typeof Component>`,
rather than reintroducing a hand-maintained type the function signature was
just freed from duplicating:

```ts
export function Button({ label, onPress, testID }: ComponentProps<typeof Pressable> & {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  /* ... */
}

export type ButtonProps = ComponentProps<typeof Button>;
```

`ButtonProps` above is still importable exactly as it was before, with no
consumer-visible change — it is derived now, not declared, which is the
difference this rule asks for.

## A Props Type Shared Across Sibling Components in Different Files

The paragraph above answers the case where a props type has one component
above it. A type genuinely shared by more than one component *in different
files* is a different case, and this rule does not reach it: nothing about
declaring that type inline in one component's own file would let a sibling
component in another file reuse it, so there is no `ComponentProps<typeof
Component>` to derive it from. `IconProps`
([`src/core/icons/icon-props.ts`](../../src/core/icons/icon-props.ts)) is
this project's own case — the `color`/`size`/`testID` contract every icon
under `src/core/icons/` and `Button`'s own `Icon` prop
([`src/shared/ui/button/button.tsx`](../../src/shared/ui/button/button.tsx))
share — and it keeps its own name, declared once and imported by every file
that needs it, rather than being copied into each icon's own signature.
`flag-icons.tsx`'s `FlagProps` is the case this section does *not* cover: it
used to be shared too, but only by `UsFlagIcon` and `JpFlagIcon`, two
functions *in that one file* — the ordinary case the paragraph above already
governs, so it was inlined into each function's own signature like any other
single-file props type, rather than kept as a name.

A shared type staying named changes nothing about how each component that
uses it meets [Props Inherit the Root Child Element's Own
Props](#props-inherit-the-root-child-elements-own-props) and [Propagate Rest
Props to the Root Child Element](#propagate-rest-props-to-the-root-child-element)
below — both rules are stated per component, about that component's own
relationship to its own root element, and a props type's name is not part of
either rule's own test. Every icon under `src/core/icons/` still extends
`ComponentProps<typeof Svg> & IconProps` in its own signature, still
destructures only what it consumes, and still spreads its own rest props
onto its own `<Svg>` root — `IconProps` supplies the shared half of that
intersection, exactly the way an inlined type would, without changing what
either rule asks of the component using it.

## Props Inherit the Root Child Element's Own Props

A component's props type MUST extend `ComponentProps<typeof X>`, where `X` is
the element the component actually returns as its own root — `View`,
`Pressable`, `Animated.View`, whatever the component's own JSX returns at its
top level. This is what lets a caller reach past a component's own named
props for anything the underlying element already supports — `hitSlop`, an
extra `accessibilityHint`, a platform-specific prop this document does not
yet know to name — without this project inventing a matching named prop for
every one of them by hand.

A component with no single native root element to inherit from — one that
returns `null` and renders elsewhere (a portal), one whose root is a pure
context wrapper with no native view of its own, or one whose literal JSX root
is a non-rendering wrapper such as `GestureDetector` — MUST NOT invent a root
to satisfy this rule mechanically. Decide what the rule can honestly mean for
that specific component instead, and say so in a comment at the type:

- **A `GestureDetector`-wrapped component** (this project's `SelectionGrid`,
  for one) extends the props of the real element rendered *inside* the
  wrapper, since `GestureDetector` itself renders no native view and accepts
  no rest props of its own to receive them.
- **A component that returns `null` and renders through a portal** (this
  project's `BottomSheet`) still constructs a real root element — it just
  hands that element to the portalling hook as an argument instead of
  returning it directly. Extending that constructed element's own props,
  rather than declining to extend anything because of where the construction
  happens to sit, is the more honest reading: it is what every caller and
  every test already treats as the component's own root.
- **A component with no native root element at all** (this project's
  `PortalHost`, whose own root is a context provider) does not extend
  anything. Its props stay exactly what it actually needs from its caller,
  and its own type says why inheritance does not apply, rather than leaving
  a reader to wonder whether the omission was noticed.

## Propagate Rest Props to the Root Child Element

After a component destructures the props it actually consumes, every
remaining prop MUST be spread onto the root child element the props type
above extends — never silently dropped. A prop this project's own named
props do not yet cover (an `accessibilityHint`, a `hitSlop`, a platform prop)
still has to reach the native element for a caller to use it at all, and a
component that consumes only its own named props and returns them verbatim
drops every other one a caller might have passed.

`style` is pulled out of the rest props and merged separately, with array
syntax, rather than left in the spread: `style={[styles.root, style]}`, this
component's own style first and the caller's last, so a caller extending the
style does not silently replace it — spreading `style` back in with the rest
of `props` would do exactly that, since a spread `style` prop replaces
whatever an earlier explicit `style` prop set rather than merging with it.

Every other rest prop's ordering is a choice this project makes once per
component and then states, since a prop spread before the component's own
explicit props lets the component's own value win, and a prop spread after
lets the caller's own value win:

- **The default ordering — rest props spread last** — lets a caller override
  an explicit default this component set (`accessibilityRole`, say). This is
  the ordering to reach for whenever nothing about a component's own explicit
  prop is load-bearing wiring the component's own behaviour depends on.
- **Reverse the ordering — rest props spread first — only where an explicit
  prop is load-bearing wiring**, not a mere default: `SelectionGrid`'s own
  `onLayout` is what its gesture-to-touch resolution depends on internally,
  so a caller-supplied `onLayout` in the rest spread must not be able to
  silently replace it and break the component from the outside.

State which ordering a component uses in a comment at the call site, so a
later reader does not have to infer it from the spread's own position.

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

**Worked example.** `HoldingInputSheetProps`, from
[`src/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet.tsx`](../../src/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet.tsx)
(with `HoldingDismissReason` from
[`src/features/hand-ranges/model/holding.ts`](../../src/features/hand-ranges/model/holding.ts)),
is this rule's shape as this project actually ships it, reproduced here
because a written example says more than the rule alone. It is trimmed to
the props this rule governs — the real type also carries a `testID` and
extends `ComponentProps<typeof View>`, per [Declare Props
Inline](#declare-props-inline-not-as-a-separate-type) and [Props Inherit
the Root Child Element's Own Props](#props-inherit-the-root-child-elements-own-props)
above, neither of which belongs to this section's own outcome-callback
rule, so both are left out here — this block reproduces the props shape
as a standalone type purely for this document's own readability, not as
the declaration style the real source now uses:

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
above; `HoldingDismissReason` is what lets a caller of this sheet tell
`NothingSelected` (nothing to recover — the user backed out before
starting) apart from `IncompleteHoleCards` or `EmptyHandRange` (a partial
entry worth offering to resume), which a boolean `onDismiss()` or a
nullable `onSubmit(holding: Holding | null)` could not distinguish.

## A Non-Root Child Gets Its Own Local testID

The root element of a component takes the `testID` its caller passed in,
unchanged — that is what [Propagate Rest Props to the Root Child
Element](#propagate-rest-props-to-the-root-child-element) already does for
it. A **non-root** child — an element the component itself renders further
down its own tree — MUST NOT be given a `testID` built by concatenating that
same received `testID` onto a suffix (`` `${testID}-row-${index}` ``,
`` `${testID}-panel` ``). Give it a local, self-describing `testID` instead —
a fixed literal for a child that renders once (`'panel'`, `'backdrop'`), or
one built from the child's own natural key for a child a `.map()` renders
more than once (`` `tab-${item.key}` ``, `` `cell-${key}` ``) — never from the
parent's own testID prop:

```tsx
// wrong: every Tab's own testID is only ever reachable by first knowing
// the parent SegmentedTabs' own testID.
testID={`${testID}-${item.key}`}

// right: a caller — or a test — that already has a handle on the parent
// element finds this child within it, the same way `within()` scopes an
// RNTL query or `childOf` scopes a Maestro selector; the child's own id
// no longer needs the parent's baked into it to stay legible.
testID={`tab-${item.key}`}
```

This applies through composition, not only within one component's own
render body: a parent handing a **child component** a `testID` prop built
by concatenating its own received `testID` onto a suffix
(`` testID={`${testID}-tabs`} `` passed into a child `<SegmentedTabs />`) is
the identical pattern one level up, and the same fix applies — pass that
child component a local, self-describing `testID` instead.

A gesture's own `.withTestId()` (`react-native-gesture-handler`) is a
different mechanism from a React `testID` prop — it registers with that
library's own gesture registry for
`react-native-gesture-handler/jest-utils`' `getByGestureTestId` and
`fireGestureHandler` to find in a **unit** test, and sets no attribute a
Maestro **end-to-end** test can see on the rendered native element at all.
This rule's naming half still applies to it (a local id, not one derived
from a parent's own `testID`), but its motivating half — a test locating an
element by scoping through its ancestor — does not reach a gesture id,
since nothing about a gesture id being local or derived changes what a
Maestro flow can select in the first place.

## Where This Sits Against Directory Structure

[directory-structure.md](./directory-structure.md) governs where a
component, a use case, or a hook lives and which tier may import which;
this document governs the shape of what crosses that boundary once the
placement is settled. The two questions are independent — a use case
placed correctly in `usecase/` still owes its caller a callback named for
the outcome, and a component placed correctly in `ui/` still owes its
caller exactly one fired outcome per interaction.
