---
status: accepted
---

# Load the Equity Breakdown Chart's Axis Font With `useFont`, Not `matchFont`

`2026-09-02-adopt-victory-native-and-skia-for-the-equity-breakdown-chart.md`
recorded a belief about how Skia resolves an axis label's font and built the
chart on it: `matchFont({ fontSize: axisLabelFontSize })`, with no
`fontFamily`, defaults to the literal family name `"System"` and resolves it
through `Skia.FontMgr.System()` synchronously on both platforms — so that
record concluded the chart needed no font asset, no asset loading, and no
first frame drawn without labels.

That belief did not survive a real device. Issue #188 first reported the
equity axis's captions missing; pull request #189's maintainer-run on-device
test (2026-09-04) found **both** axes' text invisible on Android, not only
the axis originally reported, because both axes shared the one `SkFont`
object `matchFont` built. Reading
`node_modules/@shopify/react-native-skia@2.6.2`'s own source explained why:
iOS resolves the literal string `"System"` through a native alias
(`.AppleSystemUIFont`) before handing it to the font manager and renders;
Android has no equivalent alias, so `"System"` is asked for verbatim against
Android's real font families, fails to match anything, and silently produces
a font that draws no visible glyphs — no error, and nothing a mocked Jest
test or a source-level read could have caught, only a real device running
the build.

Commits `82b255d` and `fd810c3` replaced `matchFont` with Skia's `useFont`
(`@shopify/react-native-skia`'s `src/skia/core/Font.ts`), loading this
project's own bundled `assets/fonts/InnovatorGrotesk-Regular.otf` asset by
its actual bytes, reached through the `@/assets/*` alias
(`docs/conventions/directory-structure.md`), with an `onError` that reports
a decode failure through `reportError` rather than leaving it
indistinguishable from "still loading." The full mechanism — including why
`useFont` needs no memoisation `matchFont` did, and how the render guard
withholds the whole chart until the font resolves — is recorded once, in
`EquityBreakdownChart`'s own doc comment in
`src/features/evaluations/ui/equity-breakdown-chart/equity-breakdown-chart.tsx`;
this record states only the decision and why it reversed, not the mechanism
itself.

This is the exact cost the 2026-09-02 record's font paragraph believed it
was avoiding, now paid instead: the chart **does** add a font asset,
**does** add asset loading, and **does** have a first frame drawn without
axis labels — the render guard draws nothing at all until `useFont`
resolves, rather than axes with no text for one or more frames. On
2026-09-03, before the Android failure was known, the maintainer was asked
and chose to keep the system-font path specifically to avoid this
async-load cost. On 2026-09-04, after the failure above, the maintainer was
asked again and chose to accept the async-load cost in exchange for a fix
that depends on no platform resolving any family name at all. **A later
change MUST NOT revert to `matchFont` or any other system-font path without
going back to the maintainer once more** — the failure is Android-only and
device-specific, so it will not resurface in this project's mocked tests
either, the same way it never surfaced in the rounds of tests `matchFont`'s
own build already passed.

No alternative to `useFont` was investigated once `matchFont`'s mechanism
was known to be broken. The project already bundled this exact face for
every other text role (`2026-09-02-bundle-innovator-grotesk-and-diverge-
from-figmas-inter.md`), so loading it here was the direct fix rather than
one candidate among several weighed against others; the only real choice
was whether to accept the async-load cost that bundled asset carries, which
is the maintainer decision recorded above.

This record supersedes only
`2026-09-02-adopt-victory-native-and-skia-for-the-equity-breakdown-chart.md`'s
font paragraph — the bolded claim that the change "still adds no font
asset, no asset loading, and no first frame without labels." That record's
own reasoning for taking on Victory Native and Skia at all, over a
hand-rolled `react-native-svg` chart, and its measurement of the native size
that dependency adds, are unaffected and still hold; this record does not
reopen either.
