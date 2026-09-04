---
status: superseded
superseded_by: 2026-09-04-drop-victory-native-for-a-hand-rolled-skia-bar-chart.md
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

Having taken the library on, the chart uses it for the parts worth not
hand-rolling: its bounding frame, its tick labels and its axis titles are
Victory Native's own, rather than an equivalent assembled beside the canvas
out of platform text and borders. An earlier revision of this change did
assemble one, on the belief that Skia-rendered tick labels need a bundled
font file. They do not: `@shopify/react-native-skia`'s own `matchFont`
defaults its font manager to `Skia.FontMgr.System()` and returns
synchronously on both platforms, so the platform's own face is reachable at
render. **This change still adds no font asset, no asset loading, and no
first frame without labels** — which is what that earlier belief was
protecting, and it costs nothing to keep once the mechanism is understood.

One choice does narrow the cost above rather than removing it. Each bar draws
from its own `Bar` mark given a single-element `points` array — its own one
point, never the full array — paired with an explicit `barCount` so bar
thickness is still sized from the real bar count rather than from that
one-element array's own length, since a `Bar` mark takes exactly one flat
`color`: colouring N bars along a continuous ramp costs N `Bar` layers, each
handed one point and one colour, not one `Bar` painted from a multi-stop
gradient shader Skia could otherwise draw directly. (An earlier revision
zeroed every other point's `y` instead of slicing to one; that never hid
anything, since `y` is already a pixel coordinate by the time it reaches a
`Bar` layer — see
`../../src/features/evaluations/ui/equity-breakdown-chart/bar-layers.ts`'s
own doc comment.)

The native size this dependency adds is now measured, and known in full. A
debug APK built from this branch at commit `94ed087`
(`android/app/build/outputs/apk/debug/app-debug.apk`) is 122,445,093 bytes
(116.8 MiB), of which `lib/arm64-v8a/librnskia.so` alone is 18,147,600 bytes
(17.3 MiB), stored uncompressed (`method=Stored`) rather than compressed, so
it contributes its full size to both the APK and the installed footprint.
`victory-native` ships no Android native code of its own —
`node_modules/victory-native/android` does not exist, since it draws through
Skia rather than carrying any native drawing code of its own — so
`librnskia.so`'s 17.3 MiB is not merely *a* figure but the entire native-size
delta this change adds: there was no native surface here for it to share with
anything else.

Still not measured: no build of this branch **without** the new runtime was
produced, so this build's own wall time — 6m19s, on a warm Gradle cache — has
no baseline to compare against and is not itself a build-time delta, only a
single data point; and a debug APK is not a release artifact, so a release
build's stripped, optimised size will differ from the figure above. See
`2026-08-30-do-not-run-an-android-emulator-in-cloud-sessions.md` for why no
cloud session can run the resulting build on a device — a different gap from
producing and measuring the artifact itself, which is what the figures above
come from.
