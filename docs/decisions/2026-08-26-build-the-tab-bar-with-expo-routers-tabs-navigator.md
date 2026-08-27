---
status: accepted
---

# Build the Tab Bar with expo-router's Tabs Navigator

The four-tab shell needs a bottom tab bar rendering the design's own look: a
90px height including the home-indicator inset, a thin lime hairline
indicator scoped to the active cell, and an inverted `Sheet` shadow anchored
to the bar's top edge (`docs/conventions/design-system.md` catalogues the
values).

`expo-router`'s JavaScript `Tabs` navigator (`expo-router/js-tabs`) was
adopted, with a custom `tabBar` render prop supplying the bar's entire
presentation. This keeps typed routes and the mature React Navigation state
model expo-router already gives every other route in this project, while
handing the bar's rendering entirely to project code.

Two alternatives were rejected.

**`expo-router/unstable-native-tabs`.** Rejected because a platform-native
tab bar cannot render this design: it cannot reach a 90px height, it has no
way to scope a hairline indicator to one active cell, and it cannot draw the
inverted `Sheet` shadow this project's shadow tokens specify. The design is
specific enough that a native bar would be a different design, not an
implementation detail of this one.

**`expo-router/ui`'s headless `Tabs` primitives.** A genuine second choice,
and built for exactly this — a fully custom tab bar with typed routes intact.
Rejected for now because the JavaScript `Tabs` navigator's `tabBar` prop
already yields complete control over rendering while keeping the same typed
routes and the same mature React Navigation state model, and `expo-router/ui`
is still marked experimental. Recorded here so a later session does not
re-derive this comparison from scratch.
