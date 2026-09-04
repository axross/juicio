---
status: accepted
---

# Drop Victory Native for a Hand-Rolled Skia Bar Chart

`2026-09-02-adopt-victory-native-and-skia-for-the-equity-breakdown-chart.md`
adopted `victory-native`'s `CartesianChart`/`Bar` pairing so this project
would not have to hand-roll axis scaling, bar layout, and per-bar animation
itself. Issue #197 built the Equity Breakdown chart's entrance animation on
top of that pairing's own `animate` prop, and issue #208 found it broken:
after the sheet's first open in an app session, every later reopen snapped
the bars straight to their final heights instead of growing them in, on a
real device.

Issue #208's own investigation traced this to `animate`'s own mechanism
rather than to how this project called it: Victory Native's `<Bar animate>`
depends on its own internal effect noticing two distinct React commits —
one at a bar's old value, one at its new one — to know an interpolation is
owed at all. That dependency held on a cold start, where mount itself
supplies the first of the two commits, but stopped holding reliably after
the first chart draw in a session, on a real device, with no reproduction
available in this project's mocked Jest environment. No other packaged
charting library surveyed — Skia-backed or otherwise — asks for anything
but the same two-distinct-commits contract from its own caller: the
dependency is intrinsic to handing animation ownership to a library that
decides for itself when to interpolate, not a defect specific to Victory
Native's own implementation. Replacing Victory Native with a different
packaged library was therefore not seriously weighed as an alternative —
it would not have fixed issue #208.

The chart's own bar drawing and its own entrance/update transitions are now
hand-rolled directly on `@shopify/react-native-skia` canvas primitives
(`Canvas`/`Rect`/`Line`/`Text`) and `react-native-reanimated` shared
values this project's own code writes to, imperatively, in
`src/features/evaluations/ui/equity-breakdown-chart/bar-chart.tsx` — see
that file's own doc comment for the mechanism, which this record does not
restate. `victory-native` is removed from `package.json` entirely.
`@shopify/react-native-skia` stays: the new primitive still draws on it
directly, so 2026-09-02's own measurement of the native-size cost that
dependency carries is unaffected by this decision — only the library layer
Victory Native added on top of Skia is gone, not Skia itself. Whether
removing `victory-native` shrinks a built APK, and by how much, has not
been separately measured.

This decision supersedes 2026-09-02's own central choice to adopt a
charting library for this chart at all — the trade-off that record weighed
(hand-roll on `react-native-svg` versus take on a Skia-backed library) is
moot now that the chart is hand-rolled directly on Skia instead, needing no
library layer above it.
`2026-09-04-load-the-equity-breakdown-chart-axis-font-with-usefont-not-matchfont.md`'s
own decision is unaffected and still holds: `equity-breakdown-chart.tsx`
still loads the same bundled font asset through the same `useFont` call,
handing the resolved `SkFont` to `./bar-chart.tsx` unchanged.
