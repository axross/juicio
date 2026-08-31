# Component Styling

Which styles a React Native component may set on its own root, and which
belong to its caller instead — this project's own answer within the ownership
split the installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability already states in general: a component owns what it looks like,
its caller owns where it sits and how big it is. General practice — the
Unistyles stylesheet signature, tokens, variants, dynamic functions, safe
areas — is not restated here; that capability owns it and loads whenever a
task touches a component's stylesheet. What follows is this project's own
three exemptions from the general prohibition on a root setting its own
placement, and the composition order every caller's `style` prop merges
through once it reaches this project's own root elements.

## Placement Is the Caller's

A component's own root style MUST NOT set `margin*`, `position`,
`top`/`left`/`right`/`bottom`/`start`/`end`, `alignSelf`, or `zIndex`. These
say only where a component sits among its siblings; a component that sets
them cannot be placed a second time without the caller out-specifying it.

This rule reaches only a component's own root — the element its own function
returns at the top level, but it reaches **every** style on that root, not
only what a `StyleSheet.create` key holds. An inline object literal merged
into the root's own style array at render time carries the identical hazard
and is not exempt for being unnamed: `FanArc`'s and `FanCard`'s own
`top`/`left`/`width`/`height` (`src/shared/ui/cards-pane/cards-pane.tsx`)
were exactly this — computed inline and merged into each root's own style
array rather than declared as a stylesheet key — which is what let both
slip past a review that walked only `StyleSheet.create` keys looking for
this rule's violations. Both are restructured now, their placement moved to
each one's own caller, matching every other case this rule already governs.

Two things it does not reach:

- **A non-root child's own style.** `SegmentedTabs`'s `pill`
  ([`segmented-tabs.tsx`](../../src/shared/ui/segmented-tabs/segmented-tabs.tsx)),
  `TabBarItem`'s `marker`
  ([`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx)),
  `PlayerRow`'s `bin`
  ([`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)),
  `SettingsSection`'s `card`
  ([`settings-section.tsx`](../../src/features/settings/ui/settings-section.tsx)),
  and `BottomSheet`'s `header`/`content`
  ([`bottom-sheet.tsx`](../../src/shared/ui/bottom-sheet/bottom-sheet.tsx))
  all legitimately position or margin themselves inside their own
  component — the rule governs the root a caller receives, not everything a
  component draws beneath it.
- **A style a parent passes *into* a child component's own `style` prop.**
  `SubmitBar`'s `button` style — `{ alignSelf: 'stretch' }`, handed to
  `Button` through `Button`'s own caller-`style` prop
  ([`submit-bar.tsx`](../../src/features/feedback/ui/submit-bar.tsx)) — is a
  parent supplying placement to a child it renders, the endorsed pattern this
  rule exists to keep available: the caller is placing `Button`, `Button` is
  not placing itself.
- **A z-order derived from a component's own internal animation state, not
  from where its caller puts it.** `FanCard`'s `zIndex`
  ([`cards-pane.tsx`](../../src/shared/ui/cards-pane/cards-pane.tsx)) stays
  on this card's own root: it is derived from `isCandidate` (a prop) *and*
  `elevated`, this card's own record of "still elevated because it was just
  replaced as the candidate," driven by its own `useAnimatedReaction` on its
  own `lift` shared value. `FanCard`'s caller has no access to `elevated`
  and cannot compute this value itself — unlike this same card's `left`/`top`,
  which genuinely are its caller's placement now, merged in through
  `FanCard`'s own `style` prop.

The one exception to the rule itself is a component rendered through a
portal, whose caller is not in a position to place it at all: `BottomSheet`
sets `position: 'absolute'` and all four insets on its own root, and a
comment there MUST say so, since a reader who does not already know the sheet
paints outside its caller's own layout would otherwise read that as a plain
violation.

## Claiming the Space You Were Given Is Not Choosing an Amount

`flex: 1` and `width: '100%'` are permitted on a root: they take whatever the
caller allotted rather than naming a size, so they carry none of the
placement rule's hazard. `EmptyState`
([`empty-state.tsx`](../../src/shared/ui/empty-state/empty-state.tsx)),
`PlayerList` and `PlayerRow` (`width: '100%'`;
[`player-list.tsx`](../../src/features/evaluations/ui/player-list/player-list.tsx),
[`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)),
`TabBarItem` (`flex: 1`;
[`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx)),
`FeedbackForm` and `AnalyzeScreen` (`flex: 1`;
[`feedback-form.tsx`](../../src/features/feedback/ui/feedback-form.tsx),
[`analyze-screen.tsx`](../../src/features/evaluations/ui/analyze-screen/analyze-screen.tsx)),
and the route screens under `src/app/` are all this case. No per-site comment
is required for this rule.

## A Design-Fixed Intrinsic Dimension Stays With the Component

A dimension the design fixes for the component itself, independent of where
it is placed, stays on the component's own root: `Button`'s 44
([`button.tsx`](../../src/shared/ui/button/button.tsx)), `SettingsRow`'s
52-tall row, `ROW_HEIGHT`
([`settings-row.tsx`](../../src/features/settings/ui/settings-row.tsx)),
`NavBar`'s 52-tall content band, `NAV_BAR_CONTENT_HEIGHT`
([`nav-bar.tsx`](../../src/core/navigation/nav-bar.tsx)), `SegmentedTabs`'s
44-tall track, `TRACK_HEIGHT`
([`segmented-tabs.tsx`](../../src/shared/ui/segmented-tabs/segmented-tabs.tsx)),
and `PlayingCard`'s and `HoleCardsPreview`'s `size × scale`
([`playing-card.tsx`](../../src/shared/ui/playing-card/playing-card.tsx),
[`hole-cards-preview.tsx`](../../src/shared/ui/hole-cards-preview/hole-cards-preview.tsx))
are all part of what the component *is*, not a placement choice a caller is
making. The condition is a MUST: a comment at the value naming where in the
design it comes from — a node id, a measured figure, or the issue that
settled it — not a bare number a later reader has to trust or re-derive
unverified.

This is safe despite the general prohibition on a fixed dimension because
[The Caller's Style Lands on the JSX
Root](#the-callers-style-lands-on-the-jsx-root-and-inherits-that-roots-own-style-type)
below still merges the caller's `style` last: a caller that genuinely needs a
different size still wins, the same as it would over any other default this
project ships. The alternative — exporting the constant and making every call
site pass it in — was rejected: it scatters a single design fact across every
caller that happens to need it, and turns a design change into a
repository-wide edit instead of a one-line one at the component that owns the
fact.

## A Positioning Context for a Component's Own Children Is Not Placement

`SegmentedTabs`'s `track`, `PlayerRow`'s `rowBox`, and `HoleCardsPreview`'s
`root` set `position: 'relative'` to anchor their own absolutely-positioned
children — `track` anchors the sliding `pill`, `rowBox` anchors the
full-bleed `bin`, and `root` anchors the two rotated `PlayingCard`s
`HoleCardsPreview` positions from each card's own centre. Rule 1 does not
reach this: the property is establishing a coordinate space for what the
component draws inside itself, not saying where the component sits among its
own siblings. The comment at the style MUST say so — `position: 'relative'`
is indistinguishable from a component quietly placing itself without one,
and only the surrounding prose tells a reader which case they are looking
at.

## The Caller's Style Lands on the JSX Root, and Inherits That Root's Own Style Type

A component that renders a styled root MUST accept `style`, MUST apply it,
and MUST merge it **last** with array syntax — `style={[styles.root,
style]}` — never by spreading it back in with the rest props (a spread
`style` replaces an earlier explicit one rather than merging with it) and
never through `StyleSheet.flatten` (both destroy the binding Unistyles
updates through). The full composition order is own → variant → transient
state → animated → caller, with nothing after the caller's.

Because a props type extends `ComponentProps<typeof X>` per
[component-contracts.md](./component-contracts.md#props-inherit-the-root-child-elements-own-props),
`style` is already typed as `X`'s own `style` prop — this is what keeps the
rule from bending on a special root rather than an accident of TypeScript.

| Root kind | What the rule means there |
| --- | --- |
| `View` | The plain case — `style={[styles.root, style]}`. |
| `Pressable` | `style` is `StyleProp<ViewStyle>` **or** `(state) => StyleProp<ViewStyle>`, on the caller's side too, so the component MUST normalise it inside its own render-prop form: `typeof style === 'function' ? style(state) : style`. `Button`, `SettingsRow`, and `TabBarItem` all do this — see [`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx). |
| `Animated.View` (Reanimated) | Compose by array; never spread a Unistyles style into a worklet's returned object. `PlayingCard` and `PlayerRow` are the references ([`playing-card.tsx`](../../src/shared/ui/playing-card/playing-card.tsx), [`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)). |
| `Svg` (react-native-svg) | `style` behaves as a view style, but `width`, `height`, and `color` are **props, not styles** — which is why `IconProps` ([`icon-props.ts`](../../src/core/icons/icon-props.ts)) carries `color`/`size` as named props. A caller sizes an icon through `size`, not `style.width`. |
| `Text` / `TextInput` | `TextStyle`; layout keys still apply, but a caller overriding `fontSize` or `color` is changing what the component *is* — [Override Versus Variant](#override-versus-variant) below, not this rule's business. |
| A layout `View` wrapping one interactive element — `TextField` | Its props type inherits the `TextInput`'s own **minus `style`** — `Omit<ComponentProps<typeof TextInput>, 'style'>` ([`text-field.tsx`](../../src/features/feedback/ui/text-field.tsx)) — since the input is this field's identity, not the `View` that lays its label, hint, and error around it; that inheritance is what lets a caller reach past this field's own named props for anything the input already supports. `style` is declared separately and lands on this component's own literal JSX root, the wrapping `View`, exactly as the general rule above asks; the input's own surface is reached instead through the named `inputStyle` prop, merged after `styles.input`. Inheriting one element's props while landing `style` on a different one is legitimate only when that second surface gets a name of its own — this row is the worked example of that, not a case where `style` is allowed to quietly land somewhere other than the root. |
| `ScrollView` and friends | Two surfaces: `style` is the container, `contentContainerStyle` is the named second — never a redirected `style`. `FeedbackForm`'s own scroll view is the reference ([`feedback-form.tsx`](../../src/features/feedback/ui/feedback-form.tsx)). |
| Another project component as the root | `RadioRow` and `FeedbackRow` on `SettingsRow`, `BoardInputSheet` on `BottomSheet` ([`radio-row.tsx`](../../src/features/settings/ui/radio-row.tsx), [`board-input-sheet.tsx`](../../src/features/evaluations/ui/board-input-sheet/board-input-sheet.tsx)). `style` reaches the native element through the child's own merge; the parent still declares it — inherited from the child's own props type, or passed through untouched — so the contract is readable from the parent's own signature. |
| A portal-rendered component | `BottomSheet` returns `null` but constructs a real root and hands it to the portal; `style` lands on that constructed root. |
| A context provider with no native root | `PortalHost` ([`portal.tsx`](../../src/shared/ui/portal/portal.tsx)) inherits nothing and takes no `style`; its own type says why. |
| A route screen under `src/app/`, or navigator chrome | No caller can pass either a route screen or `TabBar` a `style` — a route is reached by the router, not composed by another component in this codebase, and `TabBar` is reached the same way, through the `Tabs` navigator's own `tabBar` render prop (`src/app/(tabs)/_layout.tsx`), never by a caller in the ordinary sense. Exempt. Stating the exemption here, by location and role, is what lets the nine files under `src/app/` carry no comment each; `TabBar` sits under `src/core/navigation/`, where the exemption is not obvious from the file's own location, so this row is what tells a reader it still applies. |
| A file-private subcomponent | Same rule, but its one caller is in the same file, so it takes `style` only when that caller passes one. `FanCard` and `FanArc` do ([`cards-pane.tsx`](../../src/shared/ui/cards-pane/cards-pane.tsx)); `BoardSlot`, `NewPlayerRow`, `PreviewSlot`, `GridCellComponent`, `ShorthandChip`, and `Tab` do not. |

## Override Versus Variant

A contextual difference — where a component sits, how much room it gets — is
a caller `style`. An identity difference — a filled versus outlined button, a
destructive versus neutral action — is a variant prop, never a caller
overriding the component's own colours.

## Where This Sits Against Component Contracts

[component-contracts.md](./component-contracts.md) governs the shape of a
component's props contract — inline declaration, root-props inheritance,
rest-prop propagation, callback naming; this document governs which styles
cross that boundary and which stay behind it once the contract's shape is
settled. The two questions are independent — a component that inherits its
root's own props correctly still owes its caller a `style` merged last, and a
component that merges `style` correctly still owes its own props type the
inline declaration component-contracts.md requires.
