---
status: accepted
---

# Adopt Victory Native and Skia for the Equity Breakdown Chart

The Equity Breakdown sheet needed a bar chart: a histogram over equity bins,
one bar per bin, coloured along a continuous ramp (see
`2026-08-26-show-equity-strength-as-a-continuous-gradient.md`). This project
had no charting library before this change, and `react-native-svg` — already
a dependency, drawing every card face and icon this project ships — was the
obvious first thing to reach for instead of a new one.

`victory-native` (the current, Skia-backed line of the package, not its older
SVG-based releases) was adopted instead, bringing `@shopify/react-native-skia`
with it as the runtime it draws on. Both were installed through
`npx expo install` for SDK-57-compatible versions, never hand-edited into
`package.json`.

A hand-rolled `react-native-svg` bar chart was the rejected alternative. It
would have cost nothing new in the dependency list or the native build, and
this histogram's own shape — flat-coloured rectangles on two fixed axes, no
interaction, no animation — is well within what `react-native-svg` alone
already draws elsewhere in this project. Reaching for a charting library at
all was still preferred: hand-rolling axis scaling, bar-count layout, and
padding is exactly the kind of general charting logic a library exists to own,
and Victory Native's own `CartesianChart`/`Bar` pairing owns it in a form this
histogram's own requirements — folding a fixed distribution to a measured bar
count, one flat colour per bar rather than a gradient fill within one — map
onto directly.

The trade-off is real. `@shopify/react-native-skia` is a large native
dependency with its own C++ build step, on a project that has otherwise kept
its own native surface to one hand-written Rust/C++/Nitro module and has,
elsewhere, chosen not to add a dependency whose useful surface was narrow (see
`2026-08-27-call-rust-from-js-through-a-cpp-nitro-hybridobject.md` and
`2026-08-29-build-the-bottom-sheet-in-tree-rather-than-adopt-gorhom.md`). This
histogram is the one surface in the app that actually needs what Skia
provides — a GPU-backed canvas a chart library can draw arbitrary shapes and
paints on — rather than the fixed vector icons `react-native-svg` already
covers, which is what earns it the exception `react-native-svg` alone did not
need.

Two choices narrow that cost rather than removing it. The chart's own axis
labels are plain themed `Text`, never Victory Native's own Skia-rendered tick
labels: that path needs a bundled font for Skia's `useFont` to load, and this
histogram only ever shows two axes' fixed endpoints and names, never a tick
per bar — reaching for Victory Native's own axis chrome for that would add a
font file this project has no other reason to carry. And each bar draws from
its own `Bar` mark with every other point in its `points` array zeroed out,
since a `Bar` mark takes exactly one flat `color`: colouring N bars along a
continuous ramp costs N `Bar` layers, not one `Bar` painted from a
multi-stop gradient shader Skia could otherwise draw directly.

Not measured at the time this was recorded: the installed app size and
native build time deltas this dependency adds. No Android emulator runs in a
cloud session (see `2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md`),
and this change's own native build verification could not produce a
comparable installed artifact to measure against.
