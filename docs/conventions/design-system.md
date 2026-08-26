# Design System

The tokens and copy conventions the design specifies for this app: colour,
type, spacing and radius, iconography, and app-wide copy rules. What a change
must satisfy visually — contrast, hierarchy, motion, and the rest of visual
design practice — is not restated here: the installed
[`high-fidelity-ui-design`](../../.claude/skills/high-fidelity-ui-design/SKILL.md)
capability owns that, and the installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability owns the implementation mechanics of applying it. Both load
whenever a task touches styling. None of what follows is built yet; it is
what the design file specifies, read from
[operations/design-source.md](../operations/design-source.md).

## Colour Tokens

A change MUST draw colour only from the Radix-derived tokens below; every
colour in the design file but one resolves by exact hex to a
[Radix Colors](https://www.radix-ui.com/colors) scale, named as the file
itself names them (`{scale}/{step} {purpose}`); the exception is the
table's own last row:

| Token | Hex | Role |
| --- | --- | --- |
| `olive dark/1 App background` | `#111210` | screen background |
| `olive dark/2 Subtle background` | `#181917` | section/card background |
| `olive dark/3 UI element background` | `#212220` | list row, input |
| `olive dark/5 Selected UI element background` | `#2F312E` | selected row/tab |
| `olive dark/6 Subtle borders and separators` | `#383A36` | divider |
| `olive dark/7 UI element border and focus rings` | `#454843` | border, focus ring |
| `olive dark/8 Hovered UI element border` | `#5C625B` | hovered border |
| `olive dark/9 Solid backgrounds` | `#687066` | solid neutral fill |
| `olive dark/11 Low contrast text` | `#AFB5AD` | secondary text |
| `olive dark/12 High contrast text` | `#ECEEEC` | primary text |
| `olive/11 Low contrast text` | `#60655F` | light-scale secondary text |
| `olive/12 High contrast text` | `#1D211C` | light-scale primary text |
| `lime dark/5 Selected UI element background` | `#334423` | accent selected bg |
| `lime dark/6 Subtle borders and separators` | `#3D522A` | accent divider |
| `lime dark/7 UI element border and focus rings` | `#496231` | accent border |
| `lime dark/9` / `lime/9 Solid backgrounds` | `#BDEE63` | **brand accent** |
| `lime dark/11 Low contrast text` | `#BDE56C` | accent secondary text |
| `ruby dark/9 Solid backgrounds` | `#E54666` | destructive (swipe-to-delete) |
| `Labels/Primary - Dark` | `#FFFFFF` | white label |

`Labels/Primary - Dark` is that one exception: it is not a Radix token, and
its name follows neither the `{scale}/{step} {purpose}` shape above nor any
Radix scale. It is bound on the Settings frame (`600:31803`), so it is in
use, not vestigial. The light-theme derivation recorded in
`2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md` works by
same-step parity on a `scale/step` name; this token has neither, so it has
no derived light counterpart — an implementer must choose its light-theme
value rather than compute one. On that same frame, `get_variable_defs`
returns no binding for `olive dark/12 High contrast text`, the primary-text
token named above, even though `Labels/Primary - Dark` is bound there; that
is what this one frame showed, not a claim checked against every screen.

`jade dark/9` (`#29A383`) and `blue dark/9` (`#0090FF`) are bound to colour
styles in the file but never rendered on any screen or component. A change
MUST NOT add either to the token set.

Both theme scales (`olive`/`olive dark`, `lime`/`lime dark`) ship; the light
side is derived from the dark side by same-step parity rather than drawn —
see
[decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md](../decisions/2026-08-26-ship-both-themes-and-derive-light-from-radix-steps.md).

This table records the steps a design-file frame was observed binding, not
a closed set: `src/core/theme/tokens.ts` declares the full thirteen-step
ramp — see the installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability's colour-and-gamut reference — for each of `olive`, `lime`, and
`ruby`, this project's `neutral`, `accent`, and `destructive` schemes. A
change MAY therefore draw a step this table does not list (`component.hovered`,
`solid.hovered`, and the rest of the ramp) as long as it stays inside those
three scales, or the four band scales in Equity Strength-Band Colours
below. Reaching outside that closed set of scales — as `jade` and `blue`
above would — stays a design decision, not an implementation one.

### Text on a Solid Fill

A change MUST use `text.onSolid` on a solid (step 9 or 10) fill, per scheme,
rather than guessing a foreground colour: Radix documents that `Sky`,
`Mint`, `Lime`, `Yellow`, and `Amber` need dark foreground text on their
solid steps, and every other scale needs white. Applied to this project's
three schemes:

| Scheme | Scale | `text.onSolid` |
| --- | --- | --- |
| `accent` | `lime` (needs dark text) | `#37401C` (`lime/12`, light scale) |
| `neutral` | `olive` (not in the dark-text group) | `#FFFFFF` |
| `destructive` | `ruby` (not in the dark-text group) | `#FFFFFF` |

`text.accent.onSolid` is `lime/12` from the **light** scale specifically, in
both themes: Radix's step 9 is the same value in the light and dark scale
for every chromatic scale this project uses, so the fill itself needs no
per-theme pair, and `lime dark/12` would fail against it — it is tuned for
a dark background, not for sitting on top of `lime/9`.

Two of these three pairings clear only the WCAG 2 AA large-text floor
(3:1), not the normal-text floor (4.5:1): white on `ruby/9` measures 3.89:1
in both themes, and white on light `olive/9` measures 3.34:1 (dark
`olive/9` measures 5.12:1 and clears the normal floor). A change MUST NOT
set text in either shortfall pairing below 18pt/24px, or 14pt bold
(18.67px) and heavier.

## Equity Strength-Band Colours

The Equity Breakdown histogram's four strength bands — `Trash`, `Marginal`,
`Value`, `Nuts` — each anchor to a colour, and each also carries a step-11
text counterpart from the same scale, for a band label that needs to clear
the text contrast floor. A change MUST use these four Radix scale steps, in
this order, for the four bands:

| Band | `solid` (step 9) | `text` (step 11) |
| --- | --- | --- |
| `Trash` | `cyan/9` `#00A2C7` | `cyan/11` |
| `Marginal` | `grass/9` `#46A758` | `grass/11` |
| `Value` | `orange/9` `#F76B15` | `orange/11` |
| `Nuts` | `tomato/9` `#E54D2E` | `tomato/11` |

Step 9 is the same value in the light and dark scale for all four, so
`solid` is theme-independent, same as `text.onSolid` above; step 11 is not,
and a change MUST read `text` per theme like any other text role.

These four sit outside the Radix token set above: `get_variable_defs` on the
Equity Breakdown frame (`293:21379`) returns only `olive`, `lime`, and
typography tokens, so the histogram and its legend use raw fills, not bound
Figma variables. A change MUST NOT expect to find them named among the
design file's own colour definitions.

The design file's own swatches were sampled from the rendered legend at
430×932 (each swatch a 10px solid run at y=583–591) to `Trash` `#06A5C4`,
`Marginal` `#C0E360`, `Value` `#D59145`, `Nuts` `#E54E2F` — not read from a
design-file colour definition, and not themselves a Radix step for two of
the four: `Marginal`'s nearest step 9 in CIELAB is `lime/9`, this project's
own brand accent, and `Value` has no close Radix step 9 at all. The table
above sources all four from Radix scales instead, trading the sampled
hexes' closer match to the rendered swatch for Radix provenance and the
step-11 text counterpart the sampled hexes had no way to derive — see
[decisions/2026-08-26-source-band-colours-and-onsolid-text-from-radix.md](../decisions/2026-08-26-source-band-colours-and-onsolid-text-from-radix.md).

Three of the four band `solid` fills fall below the WCAG 2 AA 3:1 non-text
floor against the app background in the light theme: `cyan/9` 2.95:1,
`grass/9` 2.97:1, `orange/9` 2.91:1 (`tomato/9` passes at 3.79:1). They are
legend swatches and histogram bars, always accompanied by a text label per
[specs/equity-analysis.md](../specs/equity-analysis.md), so no meaning rests
on colour alone; a change MAY rely on the `text` counterpart wherever a
label needs to clear the text floor instead. `orange/11`, the `Value`
band's own text counterpart, itself measures 4.42:1 in light — marginally
under the 4.5:1 normal-text floor — so a change MUST NOT set it below
18pt/24px, or 14pt bold (18.67px) and heavier, same as the `text.onSolid`
shortfall pairings above.

The bars between the four bands run as a continuous gradient with no colour
change at any equity value; that is covered in
[specs/equity-analysis.md](../specs/equity-analysis.md) and
[decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md](../decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md)
rather than restated here.

## Effects

A change MUST draw the elevation of a surface that floats above the
screen's content from one of these two effect styles, chosen by which edge
the surface anchors to:

- `Sheet` — `box-shadow: 0 4px 6px -2px rgba(0,0,0,0.05), 0 10px 15px -3px
  rgba(0,0,0,0.1)`, used on a top-anchored surface. The Settings screen's
  Nav Bar (`600:31822`) uses it.
- `Sheet (Inverted)` — the same two layers with both y-offsets negated
  (`0 -4px 6px -2px` and `0 -10px 15px -3px`), for a bottom-anchored
  surface. The Settings screen's Tab Bar (`600:31823`) uses it.

These MUST be written as `box-shadow`, not `filter: drop-shadow()`: CSS's
`drop-shadow()` has no spread parameter, and both styles carry a negative
spread (−2px on the first layer, −3px on the second) that a `drop-shadow()`
transcription silently drops. A standalone annotation node (`442:29621`)
loose on the design file's canvas — a designer's note, not a bound
annotation — independently corroborates the `Sheet` value, spread included:
`box-shadow: rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px
4px 6px -2px;`.

`Sheet` matches Tailwind CSS **1.9.6 and 2.2.19**'s `shadow-lg` utility
byte for byte (`stubs/defaultConfig.stub.js` in those packages), but not
current Tailwind: 3.4.17 and 4.1.11 (`stubs/config.full.js` / `theme.css`)
put both shadow layers at `0.1` alpha and the second layer's spread at
`-4px`. A change MUST NOT reach for a present-day `shadow-lg` — Tailwind or
NativeWind — as a substitute; it renders a visibly more opaque near-shadow
than this design specifies.

No shadow was found on the Equity Breakdown sheet's own background rect
(`293:21380`); that is what that one node showed, not a claim that no
bottom sheet in the file carries a shadow.

## Typography

A change MUST use Inter, at these four named text styles, all
`line-height: 100%` and `letter-spacing: 0`:

| Style | Size | Weight |
| --- | --- | --- |
| `Body/B1` | 16 | 400 |
| `Body/Text Link` | 16 | 400 |
| `Heading/H2` | 18 | 600 |
| `Nav Bar Title` | 18 | 500 |

Text that appears in the file but is bound to none of these named styles —
the large result percentages, list secondary text, the Settings technical
block — uses only the two sizes and three weights the four styles above
already name; no third size or weight appears anywhere in the file.

## Spacing and Radius

No spacing or radius variables exist in the design file. A change MUST
normalize a measured value onto a 4/8px grid and tokenize from it rather than
hand-coding the value the design happens to measure at. Several measured
values already sit on that grid without adjustment: list rows at 96 and 72,
icons at 24, button height at approximately 44.

Two measured values do not sit on that grid: the status bar at 54 (54 ÷ 4 =
13.5) and the tab bar at 90 (90 ÷ 4 = 22.5). Both are the screen's top and
bottom chrome bands, not spacing decisions — the status-bar frame is
literally named `Status Bar - iPhone` — so the grid rule above does not
govern them. A change MUST take those two measurements as given rather than
normalize them.

The design file records no radius measurement at all — not even an
off-grid one, unlike spacing above. `src/core/theme/tokens.ts`'s named
radius tiers (`xs`/`sm`/`md`/`lg`/`full`) are therefore this project's own,
derived from the 4/8px grid rule alone rather than from anything measured
in the design file, and are to be corrected once a screen's own radius is
measured against a real render.

## Icon Set

A change MUST draw an icon from this set of fourteen 24×24 stroke icons,
uniform ~2px stroke with rounded caps and joins: Chevron Left, Chevron Right,
Chevron Down, X, Plus, Cog, Share, Bar Chart, History, Presets, Baloon (a
speech bubble; the name in the file is a misspelling), Document, Database,
Terminal.

**The set is Lucide — this is inferred, not confirmed.** It rests on a
strong visual match across all fourteen glyphs at this canvas size and stroke
treatment, and was not checked against Lucide's own SVG sources. The
component sheet separately carries older icon layers named after Font
Awesome glyphs (`clock-rotate-left-solid`, `folder-regular`), so the file is
not internally consistent about which icon library it draws from.

This catalogue is not exhaustive of what the design file draws: the
Settings `Licenses` row (see
[specs/settings.md](../specs/settings.md)) uses a glyph outside these
fourteen — a circle enclosing a bracket-pair, not catalogued here — so
which icon a change should use for that row is unsettled. Three of the
fourteen — `Document`, `Database`, `Terminal` — are named by no
specification; they were inventoried from the component sheet, not derived
from a screen.

## App-Wide Copy Conventions

- A section heading MUST be title case — `Players`, `Language`, `About` —
  never all caps, even where a frame in the design file shows an all-caps
  treatment (`BOARD`, `PLAYERS`).
- The Analyze empty state MUST use the heading `Nothing in the water yet`
  and the description `Add 2 players to start calculation.`
- The History empty state MUST use the heading `Nothing to look back on`
  and the description `Run an analysis and it'll show up here.`
- A player row, a preset row, and a history row MUST state their subtitle
  the same way: the four tag axes' values, joined in the fixed order
  `Position, # of Players, Depth, Action` — for example
  `BTN, 6max, 100BB, Open`.
- The Equity Breakdown histogram MUST use the high-saturation bar palette —
  the design file draws the same histogram twice, once at high saturation and
  once muted; the high-saturation version is authoritative.
