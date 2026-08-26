---
status: accepted
---

# Drop the Menu Overlay for the Tab Bar

The design file carries a floating `Menu` overlay with three rows —
`Hand Range Preset`, `Calculation History`, `Setting` — whose destinations
duplicate three of the app's four tabs.

The overlay is dropped. The tab bar is the app's only navigation surface.

Two alternatives were rejected. Keeping the overlay for screen-specific
actions the tab bar cannot hold was rejected because no such actions are
designed — the overlay's own three rows are pure navigation, identical to
three tab destinations, so there is nothing distinct for it to carry. Keeping
the overlay while dropping the tab bar was rejected because every Presets,
History, and Settings frame in the design is drawn around a tab bar; removing
it would mean redesigning every one of those screens, not just this one.

An affordance the design file still contains is therefore deliberately not
built. A later session that opens the design file will still find the `Menu`
frame there and must not read its presence as something the app is missing —
that is exactly why this record exists.
