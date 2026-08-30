---
status: accepted
---

# Render the Bottom Sheet Through an In-Tree Portal

`HoldingInputSheet`/`BottomSheet` used to render inside the Analyze tab
screen (`src/app/(tabs)/index.tsx`), a screen inside `Tabs`
(`src/app/(tabs)/_layout.tsx`). `Tabs` draws its own tab bar as a sibling
above every screen it hosts, so a component rendered inside one of those
screens can never paint over the tab bar — however that component
positioned itself. On a real device this clipped the sheet to the area
above the tab bar, leaving the tab bar always fully visible and on top,
which contradicted the sheet's own modal intent: `docs/specs/hand-ranges.md`
and `docs/specs/navigation.md` both describe it as the frontmost surface
among the UI that exists today.

React Native's own `<Modal>` was rejected: it presents a separate native
window with its own animation and complicates coordinating with this
sheet's own `react-native-gesture-handler`/`react-native-reanimated` drag,
which drives the same `translateY` shared value the backdrop's opacity
reads from. Adopting `@gorhom/portal` was rejected for the same reason
[`2026-08-29-build-the-bottom-sheet-in-tree-rather-than-adopt-gorhom.md`](./2026-08-29-build-the-bottom-sheet-in-tree-rather-than-adopt-gorhom.md)
already rejected `@gorhom/bottom-sheet`: that record named
`@gorhom/portal` explicitly as part of the cost it declined, and nothing
about the tab-bar-clipping defect changed the reasoning behind that.

The decision: a small in-tree portal, `src/shared/ui/portal/portal.tsx`
— a `PortalContext` and a `<PortalHost />` mounted exactly once, in
`src/app/_layout.tsx`, above `<Stack>` and inside `GestureHandlerRootView`.
`BottomSheet` calls `usePortal` to render its own content through that host
instead of returning it in place, so every current and future caller of
`BottomSheet` gets root-level rendering, above the tab bar, for free,
without either caller or `BottomSheet` itself needing to know `<PortalHost
/>` exists.

Mobile native exposes no primitive equivalent to a DOM portal, so this does
not move a node between React *trees* the way one would — it lifts the
node into `<PortalHost />`'s own state instead, so it renders as
`<PortalHost />`'s own child in the one real component tree this app has.
Every context a portalled node depends on therefore has to resolve from an
ancestor of `<PortalHost />`, not of the node's original caller — true
today for the three contexts a bottom sheet's own content reaches for
(`react-native-gesture-handler`'s root context, Unistyles' theme, and
`react-i18next`'s translations; see `portal.tsx`'s own doc comment for why
each already resolves correctly from there), but a constraint a future
portal consumer has to keep in mind before reaching for one. Entries stack
in the order they mounted, with no explicit z-index of their own to keep in
sync — deliberate, since it is what lets a future modal dialog mount after
an already-open bottom sheet and paint above it with no further work.
