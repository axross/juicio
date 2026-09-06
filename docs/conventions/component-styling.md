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
four exemptions from the general prohibition on a root setting its own
placement, and the composition order every caller's `style` prop merges
through once it reaches this project's own root elements.

## Placement Is the Caller's

The installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability's own
[style-composition.md](../../.claude/skills/react-component-styling/references/style-composition.md)
reference already forbids a component's own root, on mobile native, from
setting `position`, `margin`, `top`/`left`/`right`/`bottom`, `flex`,
`alignSelf`, or a fixed `width`/`height`. On top of that base, a component's
own root style in this project MUST NOT also set `zIndex` or the RTL
`start`/`end` pair, which that list does not name. Every one of these says
only where a component sits among its siblings; a component that sets any
of them cannot be placed a second time without the caller out-specifying
it.

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

Three things it does not reach:

- **A non-root child's own style.** `SegmentedTabs`'s `pill`
  ([`segmented-tabs.tsx`](../../src/shared/ui/segmented-tabs/segmented-tabs.tsx)),
  `TabBarItem`'s `marker`
  ([`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx)),
  `PlayerRow`'s `bin`
  ([`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)),
  and `SettingsSection`'s `card`
  ([`settings-section.tsx`](../../src/features/settings/ui/settings-section.tsx))
  all legitimately position or margin themselves inside their own
  component — the rule governs the root a caller receives, not everything a
  component draws beneath it.
- **A style a parent passes *into* a child component's own `style` prop.**
  `SubmitBar`'s `button` style — `{ alignSelf: 'stretch' }`, handed to
  `Button` through `Button`'s own caller-`style` prop
  ([`submit-bar.tsx`](../../src/shared/ui/submit-bar/submit-bar.tsx)) — is a
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

**A parent's own `gap`, spacing more than one optional child, is the ordinary
rule in practice, not a fourth exemption from it.** `BottomSheet`'s own
compound-child slots — `BottomSheetHeader` (optional) and `BottomSheetBody`
(required) — are each a component in their own right now, not a non-root
child `BottomSheet` draws inline, so the first bullet above (a non-root
child's own style) is not what governs either of them any more: each is its
own component's **root**, and the ordinary rule applies to it exactly as it
would to any other caller-placed component. Neither one sets its own top
spacing: `BottomSheetHeader`'s root style is empty, and `BottomSheetBody`'s
root has none of its own either. The landmark gap between the handle row and
whichever of the two renders next — and between the two, when both do — is
`BottomSheet`'s own `styles.panel.gap`
([`bottom-sheet.tsx`](../../src/shared/ui/bottom-sheet/bottom-sheet.tsx)):
the parent supplying placement for its children, the same relationship
`SubmitBar`'s `button` style above has with `Button`, generalised to a flex
`gap` once the number of children present can vary.

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
it is placed, stays on the component's own root: `Button`'s 52-tall root,
`BUTTON_HEIGHT`
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
making. The condition is a MUST: a comment at the value naming where its
number comes from — a node id, a measured figure, the issue that settled it,
or, for a platform accessibility floor rather than a design-file source, the
project convention that states it, as
[design-system.md](./design-system.md)'s 44pt touch-target floor does — not a
bare number a later reader has to trust or re-derive unverified.

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

## Neutralising a Framework-Imposed Default Is Not Choosing a Size

A root that sets `flexGrow: 0` and `flexShrink: 0` to cancel a growth or
shrink behaviour the host element it renders already imposes, rather than to
size or place itself, carries none of the placement rule's hazard either: the
value returns the root to the neutral sizing every other component gets for
free, so it removes an imposition the framework made rather than making a
placement choice the component has no standing to make. `ScrollView` is the
framework fact behind it: its own base style sets `flexGrow: 1` and
`flexShrink: 1` on both `baseVertical` and `baseHorizontal`
(`react-native@0.86.3`'s `ScrollView.js`), which the caller's own `style`
then composes over, whichever way it scrolls — so a horizontally scrolling
row placed in a column stack grows vertically to share the stack's spare
height, a behaviour nothing about the row's own content asked for.
`PresetFilterChipRow` and `PresetFilterPillRow`
([`preset-filter-chip-row.tsx`](../../src/features/presets/ui/preset-filter-chip-row/preset-filter-chip-row.tsx),
[`preset-filter-pill-row.tsx`](../../src/features/presets/ui/preset-filter-pill-row/preset-filter-pill-row.tsx))
are this project's first instance of the case (2026-09-06, issue #298): each
row already owns a fixed intrinsic height — a 37-tall band of chips or
pills — so each row's own root sets `{ flexGrow: 0, flexShrink: 0 }` ahead of
the caller's style, refusing the vertical growth `ScrollView` otherwise
imposes on it inside the Preset list screen's column.

Like [the design-fixed-dimension
case](#a-design-fixed-intrinsic-dimension-stays-with-the-component) above,
this is safe despite the general prohibition on a root sizing itself because
[the caller's style still lands
last](#the-callers-style-lands-on-the-jsx-root-and-inherits-that-roots-own-style-type)
below: a caller that genuinely wants the row to grow still wins over the
row's own `flexGrow: 0`. The condition is a MUST: a site relying on this
exemption MUST carry a comment naming the specific default it neutralises and
the element that imposes it — `PresetFilterChipRow`'s own comment names
`ScrollView`'s base style by version and property, and
`PresetFilterPillRow`'s own comment cross-references it rather than
repeating it — because a bare `flexGrow: 0` is indistinguishable from a root
quietly choosing its own placement.

This sanctions neutralising a default the component never asked for, not a
component reaching for `flex`, `flexGrow`, or `flexShrink` to size itself
relative to its siblings: the general rule still forbids that, and nothing
about a `ScrollView`'s base style excuses a component that chooses to grow
or shrink on its own account.

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
| A file-private subcomponent | Same rule, but its one caller is in the same file, so it takes `style` only when that caller passes one. `FanCard` and `FanArc` do ([`cards-pane.tsx`](../../src/shared/ui/cards-pane/cards-pane.tsx)); `BoardSlot`, `PreviewSlot`, `GridCellComponent`, `ShorthandChip`, and `Tab` do not. |

**An `AnimatedPressable` (Reanimated) cannot follow the `Pressable` row's own
render-prop normalisation, and this project's first one to hit that limit is
`NewPlayerFab` (2026-09-04, issue #210).** Wrapping `Pressable` as
`Animated.createAnimatedComponent(Pressable)` — needed so a `useAnimatedStyle`
result can apply to its root at all — makes that wrapper the thing that
decides which of an incoming `style` array's entries are animated styles, and
it does that by walking the array directly. A caller-supplied `style`
*function* (the `Pressable` row's own render-prop form) is invisible to that
walk: it is `Pressable`'s own render, not the wrapper, that ever calls it, so
nesting an animated style inside `state => [...]` type-checks and renders
once but never receives a live update on a real device.
`src/features/evaluations/ui/new-player-fab/new-player-fab.tsx`'s
`NewPlayerFab` resolves the caller's `style` function itself —
against `pressed`, tracked as its own local state set in
`onPressIn`/`onPressOut` rather than read from `Pressable`'s own render-prop
callback — before composing the root's `style` as a plain array, the
caller's resolved style landing last. The caller-style contract itself does
not change: a caller-supplied `style` function still receives the same
`{ pressed }` shape the `Pressable` row above describes; only which code
calls it moved, from `Pressable`'s own render to this component's own
render. See that component's own doc comment for the full mechanism.

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
