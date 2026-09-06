# Design System

The tokens the design specifies for this app: colour, effects, type, spacing
and radius, and iconography. This project's own motion convention lives in
[motion.md](./motion.md), and its app-wide copy rules in
[copy-conventions.md](./copy-conventions.md). What a change must satisfy
visually — contrast, hierarchy, motion, and the rest of visual design
practice — is not restated here: the installed
[`high-fidelity-ui-design`](../../.claude/skills/high-fidelity-ui-design/SKILL.md)
capability owns that, and the installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability owns the implementation mechanics of applying it. Both load
whenever a task touches styling. This document catalogues every token the
design specifies, read from
[operations/design-source.md](../operations/design-source.md), whether or
not the surface that uses it has shipped yet — a token being catalogued
here is not itself a claim that its surface is built; each `specs/` document
says what is actually shipped for its own domain.

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

This section previously claimed that `jade dark/9` (`#29A383`) and `blue
dark/9` (`#0090FF`) are bound to colour styles in the file but never
rendered on any screen or component, and that a change MUST NOT add either
to the token set. That was checked against the design file directly and
found false: the card picker at design node `98:7317` renders both —
`get_variable_defs` on that node returns `blue dark / 9 Solid backgrounds:
#0090FF` and `jade dark/9 Solid backgrounds: #29A383`, alongside `ruby dark
/ 9` and `olive dark/11` — and the seventeen SVGs exported from that node
carry those exact fills. Both are now in the token set, as two of the four
suit anchors [Suit Colours](#suit-colours) below covers; that section
carries where each suit's colour is used and the contrast it measures.

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

### Brand Accent and Unselected-Control-Border Roles

Two roles this change adds to `src/core/theme/tokens.ts` deliberately break
same-step parity — the rule that every other role in this file follows,
where light and dark resolve the same Radix step. Each does it for the same
reason: the design's own step disappears against a light ground, so light
takes a different step than dark to clear the WCAG 2 AA 3:1 non-text floor.
The next person tuning colour in this file should not "fix" either of these
back to parity — that is exactly the regression each one exists to avoid.

| Role | Resolves to (dark) | Resolves to (light) | Why it exists |
| --- | --- | --- | --- |
| `text.accent.brand` | `lime dark/9` `#BDEE63` (the design's own value) | `lime/11` `#5C7C2F`, not the same-step `lime/9` | The active tab's icon and label, the selected radio's ring and dot, and — since issue #285 — the segmented tab row's own selected pill ring (see [The Card/Range Sheet's Tab Row](#the-cardrange-sheets-tab-row) below) — a lime mark standing directly on a neutral ground. `lime/9` is tuned to carry *dark text on top of it* (see `text.onSolid` above), and at 20px alone on a near-white row it fails the 3:1 floor. |
| `border.neutral.unselectedControl` | `olive dark/9` `#687066` (the design's own exported-SVG stroke value) | `olive/10` `#7F847D`, one step past the same-step `olive/9` | The unselected radio ring's stroke; Analyze's empty board slots' dashed border, since issue #64; and the Equity Breakdown chart's two axis rules, since issue #102. All three stand directly on a neutral ground, with nothing else marking where the control or the plotted area is. `olive/9` measures only 1.38:1 in light (and the wrong colour, `border.neutral.interactive`/step 7, measured 1.38:1 in light and 1.72:1 in dark, was in use before this change); step 10 is the smallest departure from parity that clears the floor. |

Measured contrast, against the row background each theme actually uses
(`component.neutral.rest`, `olive dark/3` `#212220` dark / `olive/3`
`#eff1ef` light):

| Ramp step | Dark on `#212220` | Light on `#eff1ef` |
| --- | --- | --- |
| `olive` step 7 (the value this replaced) | 1.72:1 | 1.38:1 |
| `olive` step 9 (`#687066`, the design's literal value) | **3.12:1** | 2.94:1 |
| `olive` step 10 | 4.06:1 | **3.36:1** |

Dark takes step 9 because it already clears the floor at the design's own
literal value; light takes step 10, the next step up, because step 9 falls
short there. `text.accent.brand`'s own measured ratios are recorded as unit
tests in `src/core/theme/tokens.test.ts` rather than repeated here.

**Issue #64's second use — Analyze's empty board slot border.** The
design's own literal value for a slot's dashed border is `olive/7`
(`border.neutral.interactive`), not `unselectedControl`; against the
board's own ground it fails the same 3:1 floor by an even wider margin than
it does against the row background above, and `unselectedControl` clears
it on every ground the board could plausibly render on:

| Colour | Dark on `background.neutral.subtle` (`#181917`) | Light on `background.neutral.subtle` (`#f8faf8`) | Dark on `background.neutral.app` (`#111210`) | Light on `background.neutral.app` (`#fcfdfc`) |
| --- | --- | --- | --- | --- |
| `olive` step 7 (the design's literal value, `border.neutral.interactive`) | 1.90:1 | 1.50:1 | 2.02:1 | 1.54:1 |
| `border.neutral.unselectedControl` (step 9 dark / step 10 light) | **3.44:1** | **3.64:1** | **3.67:1** | **3.75:1** |

The board shared the nav bar's `background.neutral.subtle` background
(option A of the presentation exhibit at issue #64) until issue #260 moved
both to `background.neutral.app` instead, so `app` is the ground the board
actually renders on today; `subtle` stays measured too since it was the
board's own ground before that issue. These four
`unselectedControl` ratios are recorded as unit tests in
`src/core/theme/tokens.test.ts`, in the same shape as the `text.accent.brand`
and `border.neutral.unselectedControl` contrast tests already there.

**Issue #102's third use — the Equity Breakdown chart's axis rules.** The
two rules bounding that chart's plotted area
(`src/features/evaluations/ui/equity-breakdown-chart/bar-chart.tsx`,
[specs/equity-breakdown.md](../specs/equity-breakdown.md)) take this role for
the same reason the board slots do, on the ground the shared bottom-sheet
panel gives them: `background.neutral.app`, already the last two columns of
the table above, so no new measurement is needed. Unlike the other two uses
these are not React Native borders at all — this chart's own `bar-chart.tsx`
primitive paints them into a Skia canvas, and the role reaches it as a
colour passed to that primitive rather than as a `borderColor`. The role is
what carries across, not the mechanism: a rule is held to the same non-text
floor whichever runtime draws it. Neither
`border.neutral.interactive` (step 7, the first colour these rules were
written in) nor `border.neutral.hovered` (step 8) clears the 3:1 floor
there — step 8 measures 1.88:1 in light, and its dark figure rounds to
3.00:1 but is 2.9997:1. A rule that fails the floor also fails what the
maintainer asked these rules for — that the axes be easy to make out on a
real device — so this is not a case where recording a sub-floor departure
would have been the alternative.

### Rank-Pair Grid Cell Label

The unselected label of a rank-pair grid cell (docs/specs/hand-ranges.md's
13×13 grid) uses `theme.colors.solid.neutral.rest` — `olive` step 9 at
same-step parity in both themes (`#687066` dark, `#898e87` light) — not
`border.neutral.unselectedControl` above, even though the two happen to
share the same dark-theme value. This is a deliberate departure from the
pattern that role exists for: `unselectedControlBorder` breaks same-step
parity specifically to clear the WCAG 2 AA 3:1 non-text floor a *border*
is held to; a grid cell's label is text, held to the stricter 4.5:1 normal
floor, and the maintainer chose to let it fall short of that floor rather
than raise it — the grid's own position (diagonal, above, or below it)
already carries the pocket-pair/suited/offsuit meaning, and the label
itself is supporting information, not the mechanism a player reads the
grid by. Measured against `component.neutral.rest`, the row background the
grid's own cell fill sits on: 3.12:1 dark, 2.94:1 light — the same
measurements the table under [Brand Accent and Unselected-Control-Border
Roles](#brand-accent-and-unselected-control-border-roles) above already
records for `olive` step 9, reused here rather than re-measured, since the
ground is the same `component.neutral.rest` row background either way. A
future pass MUST NOT "fix" this contrast by swapping in
`unselectedControlBorder` or another step that clears the floor — that
would be reversing a decision made deliberately, not correcting an
oversight.

### Board Slot Pressed State

Analyze's five board slots each answer a touch by **fading** while the
finger is down on them, not by recolouring their border. There is no
design-file source for this — none of the three board frames
(`103:10947`, `145:21922`, `145:21298`) draws a pressed state at all — so
this entry, like [Bottom Sheet Scrim](#bottom-sheet-scrim) below, records a
value chosen rather than a measurement reproduced. The maintainer picked
the fade from an options exhibit at issue #85, over recolouring the slot's
dashed border in the accent colour.

A change MUST implement it as a plain `opacity` style merged at the call
site from `Pressable`'s own press state, never as a Unistyles
dynamic-function style — see
[decisions/2026-08-29-ban-dynamic-function-styles.md](../decisions/2026-08-29-ban-dynamic-function-styles.md).
`src/features/evaluations/ui/board/board.tsx`'s `SLOT_PRESSED_OPACITY`
holds the value and states why it sits where it does.

This is a deliberately weak signal, and the exhibit records the cost the
maintainer accepted: an already-faint dashed outline getting fainter is
little to see, and a fingertip covers most of it. Two things bound that,
and a change MUST keep both. The press target is the **whole** 48×75 slot,
which clears both platforms' 44pt floor on each axis with no `hitSlop`. And
the fade is never the only feedback: the sheet opening is, with the
`primaryAction` haptic alongside it — see
[haptics.md](./haptics.md)'s Haptics Is Never the Only Signal. Because the
fade is this weak, the slot's own `accessibilityRole="button"` is what
actually announces it as pressable rather than the visual state doing it.

Nothing automated in this project can check any of that: RNTL never drives
`Pressable`'s own press state, so the fade is unobservable from a component
test, and whether it reads as feedback under a real fingertip is a device
check. See [testing.md](./testing.md).

### Bottom Sheet Scrim

`theme.colors.scrim` is a colour role with **no design-file source at all**
— unlike every role above, which is a Radix step the design file itself
binds. `src/shared/ui/bottom-sheet/bottom-sheet.tsx` draws the sheet as a
standalone artboard with nothing behind it, so its scrim shipped fully
transparent at first, and that gap was flagged back to the maintainer
rather than an unreviewed colour invented to fill it. The maintainer then
asked for a backdrop anyway; this entry is the record of the value chosen
for it, not a measured design value reproduced faithfully — the opposite
of what every other entry in this document is.

The value is `rgba(0, 0, 0, 0.6)` — Radix's `blackA` alpha scale, step 8
(`src/core/theme/palette.ts`'s `blackAlpha`), the same in both themes. Two
things made a plain Radix alpha ramp the wrong source here: Radix's
*dark*-theme alpha ramps (`oliveDarkA`, `limeDarkA`, `rubyDarkA`) are
**white**-based — built to lighten whatever sits under them, the opposite
of what a scrim needs — and a scrim has to darken the same way whichever
theme is active, which `blackA` (Radix's one theme-independent black-alpha
scale) is the only ramp already in this project that does.

The step itself is a deliberate departure from Material 3's own published
figure, not a value picked on taste. Material 3's scrim —
`md.sys.color.scrim`, always black, at 32% opacity
(`androidx.compose.material3`'s `ScrimTokens.ContainerOpacity`, a literal
`0.32f` in that library's own source) — was checked against this app's own
`background.neutral.app` (`#111210`, Radix's `olive` dark/1, already
near-black), not merely recalled:

| Opacity | Composited over `#111210` | Relative luminance drop |
| --- | --- | --- |
| Material 3's own 32% (`rgba(0, 0, 0, 0.32)`) | ≈ `#0c0c0b` | ≈ 30% |
| This project's 60% (`blackA` step 8, `rgba(0, 0, 0, 0.6)`) | ≈ `#070706` | ≈ 60% |

32% over a ground this close to black already reads as "almost nothing
changed" — this app's screens are dark enough that Material's own figure,
tuned against a lighter baseline, does not read as a curtain drawn behind
the sheet. 60% was chosen as clearly, not marginally, stronger: roughly
double Material's own relative drop, and a value actually checked against
this app's own darkest ground rather than assumed to transfer from a
lighter one.

**The backdrop also carries a native blur now, on top of this unchanged
scrim colour** (issue #258).
`src/shared/ui/bottom-sheet/bottom-sheet.tsx` adds an `expo-blur` `BlurView`
layer behind the flat-colour one, sharing its exact position and its exact
animated opacity, so the two fade in lockstep. `intensity` is fixed at
`50` — `expo-blur`'s own documented default, and the "Medium" option of
this issue's own options exhibit — never animated: animating `BlurView`'s
`intensity` prop via `react-native-reanimated`'s `useAnimatedProps` is a
currently-unreliable pattern on this library, on both iOS and Android. Like
the scrim colour and opacity above, `50` has no design-file source; the
maintainer's own on-device fine-tuning of it is deferred to a later pass,
same as this project already defers a value with no design-file source
elsewhere in this document until a real device confirms it.

The blur only ever reaches Android on API 31 and above, but not because
`expo-blur` falls back to nothing below that floor on its own — traced
against `expo-blur@57.0.2`'s actual Android source
(`node_modules/expo-blur/android/src/main/java/expo/modules/blur/
{ExpoBlurView,BlurModule}.kt`, `enums/TintStyle.kt`), `blurMethod=
"dimezisBlurViewSdk31Plus"`'s own fallback below API 31 still calls
`setBackgroundColor` with a computed tint colour, painting a real, extra
translucent layer rather than genuinely doing nothing. `bottom-sheet.tsx`'s
own `SUPPORTS_BACKDROP_BLUR` constant is what actually enforces the floor:
the blur layer is not rendered at all on Android below API 31, so the same
flat scrim this section already documents is the only backdrop layer a
pre-API-31 device ever paints — pixel-identical to before this blur layer
existed, not merely visually close to it. Getting a real blur on Android at
all further needs the screen content wrapped in `expo-blur`'s own
`BlurTargetView` (`src/app/_layout.tsx`, wrapping `<Stack />`, via
`@/shared/ui/blur-target/blur-target`) for that native blur method to
sample from — see that module's own doc comment for why the context
carrying its ref has to be mounted above `<PortalHost />` rather than
inside `BottomSheet` itself.

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
[specs/equity-breakdown.md](../specs/equity-breakdown.md), so no meaning rests
on colour alone; a change MAY rely on the `text` counterpart wherever a
label needs to clear the text floor instead. `orange/11`, the `Value`
band's own text counterpart, itself measures 4.42:1 in light — marginally
under the 4.5:1 normal-text floor — so a change MUST NOT set it below
18pt/24px, or 14pt bold (18.67px) and heavier, same as the `text.onSolid`
shortfall pairings above.

As of issue #237, each bar takes the flat `solid` fill of whichever band
holds the most of that bar's own card pairs, rather than a position along a
continuous gradient; that is covered in
[specs/equity-breakdown.md](../specs/equity-breakdown.md) and
[decisions/2026-09-05-confirm-majority-colour-presentation-took-effect-with-issue-255.md](../decisions/2026-09-05-confirm-majority-colour-presentation-took-effect-with-issue-255.md)
rather than restated here.

## Suit Colours

A four-colour deck: each of the four suits anchors to one Radix scale step,
read from the card picker at design node `98:7317` and the seventeen SVGs
exported from it — not from a bound Figma colour style on a card component;
`get_variable_defs` on that node returns the four suits' step-9/step-11
values alongside `olive dark/11` and `ruby dark / 9`, and the SVGs' own
fills corroborate them. Two of the four are ramps already in the token set;
`blue` and `jade` are the two genuinely new scales this change adds:

| Suit | Token | Resolves to (dark) | Resolves to (light) |
| --- | --- | --- | --- |
| ♠ Spades | `olive dark/11` (already in the set — the same grey `text.neutral.low` and the rank glyphs use) | `#AFB5AD` | `#60655F` |
| ♥ Hearts | `ruby dark/9` (already in the set — the same value `solid.destructive.rest` uses) | `#E54666` | `#E54666` |
| ♦ Diamonds | `blue dark/9` (new) | `#0090FF` | `#0090FF` |
| ♣ Clubs | `jade dark/9` (new) | `#29A383` | `#29A383` |

`src/core/theme/tokens.ts` exposes these as `theme.suits.s` / `.h` / `.d` /
`.c` — keyed by `Suit`'s own letter, not the suit's full name (see
`src/shared/model/card.ts`) — a categorical data-encoding family like the
equity strength bands above, not a UI colour scheme: each suit is
a single fill rather than a tier/slot ramp, and none carries an alpha
counterpart. Hearts, diamonds, and clubs resolve to the same value in both
themes, per the Radix rule that step 9 is identical between the light and
dark scale for every chromatic scale this project uses (the same rule
`text.accent.brand`'s doc comment in `tokens.ts` cites). Spades is the one
exception, because `olive` is this project's neutral scale, where step 9 —
and every other step — differs by theme the way every other neutral role
in this file does.

**Measured against the card face.** A suit pip sits on
`component.neutral.rest` (`olive dark/3` `#212220` dark / `olive/3`
`#EFF1EF` light) at two sizes: 12pt in the card fan, below the 18pt/24px
large-text threshold this document already uses above, so the 4.5:1
normal-text floor applies; and 24pt in a preview slot, at or above that
threshold, so the 3:1 large-text floor applies instead.

| Suit | Dark on `#212220` | Light on `#EFF1EF` | Clears at 12pt (4.5:1)? | Clears at 24pt (3:1)? |
| --- | --- | --- | --- | --- |
| Spades | 7.64:1 | 5.25:1 | yes, both themes | yes, both themes |
| Hearts | 4.11:1 | 3.43:1 | no, both themes | yes, both themes |
| Diamonds | 4.89:1 | 2.88:1 | dark only | dark only |
| Clubs | 5.07:1 | 2.78:1 | dark only | dark only |

Every ratio above measures the design's own literal step-9 (step-11 for
spades) value, implemented unchanged: the maintainer approved these four
colours at the plan gate that settled the four-colour deck, so a departure
from them is a decision for the maintainer to take, not one this change
takes on its own. Two shortfalls follow from keeping them as measured.
Hearts, at 12pt, falls below the 4.5:1 normal-text floor in both themes,
though it still clears the 3:1 large-text floor at 24pt — the same
shortfall shape `text.onSolid` and the `Value` band's text counterpart
already carry elsewhere in this document, where a size floor is the fix.
Diamonds and clubs, in the light theme only, fall below even the 3:1
large-text floor at either size — no size fixes that shortfall the way it
fixes hearts's, so a light-theme diamond or club pip on the card face has
no size that clears the floor with the design's own colour. These four
suits' measured ratios are recorded as unit tests in
`src/core/theme/tokens.test.ts`, in the same shape as the
`text.accent.brand` and `border.neutral.unselectedControl` contrast tests
already there.

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

### Segmented Pill Settle Glow

`SegmentedTabs`' own sliding selection pill (`src/shared/ui/segmented-tabs/
segmented-tabs.tsx`) casts an animated shadow rather than a fixed
`box-shadow`: it interpolates between a resting and a peak state as its own
`glowIntensity` shared value travels, flashing to the peak the instant the
pill's position target changes and easing back to rest —
[The Card/Range Sheet's Tab Row](#the-cardrange-sheets-tab-row) below names
the trigger, [motion.md](./motion.md)'s own "Tab pill" row the timing.

| | `offsetY` | `blurRadius` | alpha |
| --- | --- | --- | --- |
| Rest | `2` | `8` | `0.18` |
| Peak | `6` | `18` | `0.55` |

Unlike `Sheet` above, this carries no design-file effect style or
annotation-node corroboration of its own — see
`docs/decisions/2026-09-06-give-the-segmented-tab-pill-a-tonal-fill-ring-and-settle-glow.md`
for where it comes from instead.

## Typography

A change MUST use Innovator Grotesk, bundled as four faces under
`assets/fonts/` and registered through `app.json`'s `expo-font` plugin
entry, named as tokens on `theme.fontFaces` in `src/core/theme/tokens.ts`:

| Face | `fontFamily` value | `theme.fontFaces` token |
| --- | --- | --- |
| Regular | `InnovatorGrotesk-Regular` | `fontFaces.regular` |
| Medium | `InnovatorGrotesk-Medium` | `fontFaces.medium` |
| Semi Bold | `InnovatorGrotesk-SemiBold` | `fontFaces.semiBold` |
| Bold | `InnovatorGrotesk-Bold` | `fontFaces.bold` |

A role's weight is carried by its face, not by a number: a text role MUST
carry exactly one of the four `fontFaces` tokens above as its `fontFamily`,
and MUST NOT also carry a numeric `fontWeight` — this family's weights do
not share one addressable family name on iOS, so the number cannot reach
Medium or Semi Bold there, and pairing it with a face that already carries
the weight risks the platform synthesising a heavier (faux) style on top.
[decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md](../decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md)
holds why the family behaves that way, and why this app renders in Innovator
Grotesk while the Figma design source itself still specifies Inter.

A change MUST use these named text styles:

| Role | Size | Face | Line height |
| --- | --- | --- | --- |
| `body` | 16 | Regular | 20 |
| `textLink` | 16 | Regular | 20 |
| `heading` | 18 | Semi Bold | 23 |
| `navBarTitle` | 18 | Medium | 23 |
| `caption` | 14 | Regular | 20 |
| `description` | 14 | Regular | 18 |
| `label` | 16 | Medium | 20 |
| `tabLabel` | 12 | Regular | 16 |
| `sectionHeading` | 16 | Medium | 20 |
| `gridCellLabel` | 10 | Regular | 13 |
| `chipLabel` | 14 | Regular | 18 |
| `paragraph` | 16 | Regular | 24 |
| `rowLabel` | 16 | Semi Bold | 20 |
| `rowSubtitle` | 12 | Regular | 16 |

`body` (`Body/B1`), `textLink` (`Body/Text Link`), `heading` (`Heading/H2`),
and `navBarTitle` (`Nav Bar Title`) are Figma named styles, all specified
in the design file at `line-height: 100%` and `letter-spacing: 0`. A change
MUST NOT reproduce that 100% figure literally, though: this project's own
line-height floor for a bundled face — at least 125% of the font size,
rounded half up, wherever a role's own previous value fell short of that —
raises seven of the fourteen roles above the narrower figure the design
file (or an earlier, unbundled-font phase of this project) specified:
these four, plus `label`, `gridCellLabel`, and `chipLabel` further down
this table. Every other role already cleared that floor on its own — most
were never at 100% to begin with — and is unchanged by it.

This table previously claimed "no third size or weight appears anywhere in
the file" and named the Settings technical block as an example of text
using only the two sizes (16, 18) the four named styles above list. That was
false: 14px at the Regular face appears twice, at two different line
heights, and was verified against the design file's own machine-readable
properties (`600:31971`, `518:29828`, `600:29970`). A change MUST treat
these as two distinct roles rather than one — `src/core/theme/tokens.ts`
names them `caption` (14/Regular, 20px line height) and `description`
(14/Regular, 18px line height) — because react-component-styling's
theming reference requires a text role be applied whole, never with a line
height picked out of it by the caller; one role cannot correctly serve
both the 20px and 18px call sites at once.

Two further roles this change adds: `label` (16, Medium, a 20px line
height, `theme.typography.label`), which labels the Analyze screen's
add-player floating action button (`New Player`, issue #155 — the
solid-fill `+ New Player` button this role originally labelled was later
replaced by it), and `tabLabel` (12, Regular, a 16px line height,
`theme.typography.tabLabel`), which labels the tab bar. Neither is bound to
a named Figma style. `label` stays within the sizes and faces this table's
other rows already use; `tabLabel` does not — 12px appears nowhere else in
this table — the same way `caption` and `description` above introduced
14px. Its unit test asserts its 16px line height directly, so a future edit
that "corrects" the token toward a narrower figure would be changing the
wrong side.

One further role, added for issue #64: `sectionHeading` (16, Medium, a 20px
line height, `theme.typography.sectionHeading`), which labels the
`Players` heading above Analyze's board. **It now carries the identical
size, face, and line height as `label` above** — the two converged once
this project's own line-height floor raised `label`'s line height from its
earlier, narrower figure to 20px, the same value `sectionHeading` already
carried. They stay two named roles rather than collapsing into one: each
was introduced for a different call site (a button label against a section
heading), and this project already carries the same precedent for `body`
and `textLink` above — distinct roles differing in what they label, not
in their metrics.

Two more roles, added for the card/range input sheet
(docs/specs/hand-ranges.md): `gridCellLabel` (10, Regular, a 13px line
height, `theme.typography.gridCellLabel`), which labels each of the
hand-range grid's 169 rank-pair cells, and `chipLabel` (14, Regular, an
18px line height, `theme.typography.chipLabel`), which labels the three
shorthand chips above it. `gridCellLabel` introduces 10px, a size nowhere
else in this table — the same way `tabLabel`'s 12px did. **`chipLabel` now
carries the identical size, face, and line height as `description`** —
the same line-height-floor convergence `sectionHeading` and `label` above
went through, and recorded the same way: two roles for two different call
sites (a shorthand chip against an empty-state description), not one role
reused across both.

The card pair count beside the chips (`{{count}} combos`) uses `caption` —
no role of its own; the maintainer found the sheet's default `body` (16px)
too large for it on a real device, and `caption` is this project's existing
role for a compact secondary figure read alongside its own controls, the
same way the Settings technical-information block uses it.

An eighth role, `paragraph` (16, Regular, a 24px line height,
`theme.typography.paragraph`), was added for issue #75/PR #77. It is not a
reading off a named Figma style or a measured node the way every role above
is — the design file specifies no line height for wrapping body text at
all — because the Feedback screen (docs/specs/settings.md) is this
project's first surface with prose that wraps to more than one line.
`body`'s own 20px line height (125% of its font size, per this project's
line-height floor above) is correct for every call site built before this
role, all of them single-line, but even at that 125% a wrapped second line
still collides with the first. The maintainer reviewed the Feedback screen
on device and chose this option — `body`'s own 16px, Regular face, at a
150% (24px) line height — over the alternatives it was weighed against. The
same "apply a role whole" rule applies here too: `body` cannot correctly
serve both a call site that never wraps and one that does, so this is its
own role rather than a line height picked out of `body` at the call site.
It replaces `body` at the Feedback screen's four wrapping call sites (the
intro text, the error banner, the sent-confirmation body, and
`TextField`'s input); `TextField`'s `label` stays on `label` (single-line)
and its `hint`/`error` stay on `description`.

A ninth role, `rowLabel` (16, Semi Bold, a 20px line height,
`theme.typography.rowLabel`), was added for issue #87: the Analyze players
list row's own label (node `423:23692`). It shares `sectionHeading`'s size
and line height but not its face — Semi Bold against `sectionHeading`'s
Medium — and the "apply a role whole" rule that splits every pairing above
applies here too, so the face alone is enough to need a new role rather
than an override at the call site. Named for what it labels generically (a
list row), not for the one feature that introduces it first:
[copy-conventions.md](./copy-conventions.md)
carves the history row's own subtitle out of the player-row/preset-row
shared format, but a player
row, a preset row, and a history row still share one label/subtitle role —
a row's own primary label sitting above a row's own secondary line,
whichever content that line renders — so a shared label role for the same
family of rows is the consistent choice.

### Players List Row Subtitle — A Departure, Not a Reproduction

The players list row's own subtitle shipped at the design's own measured
value, `description` (14, Regular, an 18px line height, the Empty-state
description row in the table above) — until the maintainer's own on-device
pass over Android preview `0.1.0-pr-93` found it reading too large on a
real device, once weighed against the row's own other elements, and
replaced it with 12, Regular, at a 16px line height instead. **This is a
deliberate departure from a measured design value, recorded here the same
way [Rank-Pair Grid Cell Label](#rank-pair-grid-cell-label) above and
[the empty board slot's border](#brand-accent-and-unselected-control-border-roles)
are** — it is not the design's own reading, and a future pass MUST NOT
"correct" it back to `description` on the assumption that the smaller size
was an oversight.

The replacement value happens to be numerically identical to `tabLabel`'s
own 12/Regular/16px metrics — coincidence, not cause: a tab label and a
list row's subtitle are not the same thing, and the installed
[`react-component-styling`](../../.claude/skills/react-component-styling/SKILL.md)
capability's "apply a role whole" rule — the same rule that already splits
`caption` from `description` above, and that this project also carries for
`sectionHeading`/`label` and `chipLabel`/`description` above even though
those two pairings now converge on identical metrics — applies here too,
on top of the fact that reusing `tabLabel` would tie a future change to
either role together by an accident of numbers rather than an intentional
shared meaning. `src/core/theme/tokens.ts` names this tenth role
`rowSubtitle` (`theme.typography.rowSubtitle`) instead — see that file's
own typography doc comment.

### Equity Breakdown Legend and Axis Labels — Departures, Not Reproductions

The Equity Breakdown sheet's band legend and its chart's axis labels both
shipped at `caption` (14, Regular, a 20px line height) — until the
maintainer's own on-device pass over PR #116's Android preview build found
both reading too large against the sheet's own body copy, and moved the
legend one step down this project's type scale and the axis labels two.
**These are deliberate departures from what shipped, recorded here the same
way
[Players List Row Subtitle](#players-list-row-subtitle--a-departure-not-a-reproduction)
above is** — neither the size that shipped nor the size that replaced it is
a design measurement this project has recorded: the table above binds no
row to this sheet's legend or its chart's axes, and `caption` reached them
as this project's own pick for compact secondary text, not as a reading of
them. A future pass MUST NOT "correct" either back to `caption` on the
assumption that the smaller size was an oversight.

`src/core/theme/tokens.ts` names them as two roles of their own:

- `chartLegendLabel` (12, Regular, at a 16px line height,
  `theme.typography.chartLegendLabel`), which labels the four band names in
  the sheet's legend, and, as of issue #237, the live card-pair count beside
  each of them — the same role applied whole to both, not a fifth role
  invented for the count. Numerically identical to both `tabLabel` and
  `rowSubtitle` — coincidence again, not cause, and the same "apply a role
  whole" rule that already keeps those two apart from each other keeps this
  one from being a reuse of either.
- `chartAxisLabel` (10, Regular, at a 13px line height,
  `theme.typography.chartAxisLabel`), which sizes both of the chart's axes —
  the `combos` name and its upper bound down the plot's left edge, and the
  `0`, `100` and `Equity` group along its bottom. **Only its `fontSize`
  reaches them.** This chart's own `bar-chart.tsx` primitive paints these
  labels into a Skia canvas from a loaded `SkFont` object rather than laying
  them out as `Text` from a style, and that object takes a size and a
  typeface: `useFont`
  builds the size from this role's own `fontSize`, but the typeface comes
  from a hardcoded `require('@/assets/fonts/InnovatorGrotesk-Regular.otf')`
  literal in `equity-breakdown-chart.tsx`, never from this role's own
  `fontFamily` field — a text style has no way to reach a canvas-drawn
  `SkFont`, and the component does not read `.fontFamily` at all. That
  literal's target currently happens to be the exact face `fontFamily`
  already names for this role (`fontFaces.regular` /
  `InnovatorGrotesk-Regular`), which is why the two agree today, but the
  agreement is a numeric-coincidence-style convention rather than one
  derived from the other: changing `chartAxisLabel.fontFamily` in
  `tokens.ts` would have no effect on what this chart draws, since nothing
  in the chart reads it. The 13px line height in this role is still real and
  still asserted, but it reaches
  nothing on this chart today; it is the value any future ordinary-text use
  of the role would take. Its line height is not a further on-device call
  the way its size is: it simply follows this file's own line-height rule
  for a bundled face — at least 125% of the role's own font size, rounded
  half up. Its face follows this file's own bundled-face rule too — the
  Regular face — and that rule is no longer only a spec to honor: `useFont`
  now loads that exact file as this axis's real, drawn font. Applying those
  same two rules to `gridCellLabel`, this project's other 10px role, lands
  it on that identical face and line height too, so the two roles — already
  the same size before either rule existed — now converge on identical
  metrics across the board. They stay
  two named roles rather than collapsing into one, the same precedent
  `sectionHeading`/`label` and `chipLabel`/`description` above already
  set — and that this project also carries here even though this pairing,
  too, now converges on identical metrics. Its own row in `tokens.test.ts`'s
  table-driven typography suite asserts this fontSize/face/lineHeight triple
  directly, so an edit drifting any of the three away from these values
  fails there.

## Spacing and Radius

No spacing or radius variables exist in the design file. **Faithful
reproduction of a measured value is the default: a change MUST reproduce
the value the design measures at — hand-coded, where the project's spacing
scale has no matching step, rather than nudged onto one.** Normalizing a
measured value onto a 4/8px grid is a fallback, reached only where the
design gives a change nothing to reproduce faithfully in the first place:
where the design carries no measurement of the value at all, so it has to
be derived from something other than the design, or where a measurement is
plainly incidental — an artifact of how a shape happened to be drawn in
the design tool, not a considered spacing decision.

This document previously required the opposite: that a change MUST
normalize every measured value onto the 4/8px grid rather than hand-code
what the design measures at. The maintainer has replaced that rule,
because a grid this coarse cannot represent every measurement the design
actually carries without breaking the match it exists to preserve. The
rank-pair grid — 29pt cells on a 30.833px pitch, from the design's own
hand-range grid — is the case that forces this: neither dimension has a
4/8px-grid representation that still matches, so normalizing either one
stops the implementation from matching what the design measures.

Every measured value this document has recorded so far turns out to need
no adjustment either way: list rows at 96 and 72, and icons at 24, are
reproduced exactly as measured. So is the tab bar, at 90 (90 ÷ 4 = 22.5,
off the grid) — it no longer needs the earlier grid rule's carve-out to
explain why it is not normalized, since faithful reproduction is what
every one of these values does by default now, not an exception to a rule
that required something else.

Button height is now the one departure from that faithful-reproduction
default: the design still measures the button at approximately 44, but
`src/shared/ui/button/button.tsx`'s `BUTTON_HEIGHT` — and the two floating
action buttons that mirror it, `NewPlayerFab` and `NewPresetFab` — are 52,
not a reproduction of that measurement. It matches the Settings screen's
own row height instead, for the same reason that row height itself already
departs from the design's own 44dp measurement: 44 read too small as a
touch target. See
[specs/settings.md](../specs/settings.md#the-settings-screen-itself) for
that rationale, recorded once there rather than repeated here.

The Preset list's own row (`src/features/presets/ui/preset-row/
preset-row.tsx`, issue #176) adds a third list-row-height reading, distinct
from both of the two above: 112, measured against the confirmed design
frame's own "Players" instance (node `145:22333`,
[operations/design-source.md](../operations/design-source.md)). That same
row's hand-range preview measures 72 — larger than the player list row's
own 64px preview (`player-row-content.tsx`'s `PREVIEW_SIZE` above) — a
reading this document had not recorded before this phase.

The status bar is 60px, not the 54px this document previously recorded:
every `Status Bar - iPhone` instance in the design file (`412:19317`,
`518:27346`, `518:30011`, `423:26457`, and the Settings frame's own
`I600:31822;600:26552`) measures 60px tall — coincidentally 60 ÷ 4 = 15,
on the grid, though whether a measured value lands on the grid no longer
decides how it is reproduced. On the Settings frame specifically, the
scrollable content column is offset 112px from the top, which is exactly
the 60px status bar plus the 52px nav bar (`Header Bar`, node
`I600:31822;600:26553`) beneath it — a reading that corroborates 60px
independently of the direct per-instance measurement above.

The design file records no radius measurement for most of what
`src/core/theme/tokens.ts` names — `xs`, `sm`, and `lg` are this project's
own, derived from the 4/8px grid rule because the design file carries no
radius measurement for them, exactly the fallback case above. `md` is
different: this phase measured the Settings card's corners and the
`+ New Player` button against the design file at 10px (10 ÷ 4 = 2.5, off
that grid), and corrected `md` from the previously-derived 12 to that
measured value — a genuine measurement, reproduced faithfully rather than
normalized, same as the tab bar above. The other three radius tiers are
still to be corrected once a screen's own radius is measured against a
real render.

### Bottom Sheet Panel Width

`src/shared/ui/bottom-sheet/bottom-sheet.tsx`'s panel caps at 600 and
centres above that width, rather than stretching to the full screen —
real-device feedback that a tablet or an unfolded foldable otherwise
inflates every element (the fan, the 13×13 grid, the preview slots) past
its designed scale, since each scales proportionally to the panel's own
measured width (PR #70). 600 is not a design-file measurement: the design
file's own `430×932` reference frame — the same one this document's Equity
Strength-Band Colours section samples and
[decisions/2026-08-26-target-android-and-ios.md](../decisions/2026-08-26-target-android-and-ios.md)
records — is the widest frame it draws for this sheet, so there is no
design-file value to carry a wider cap forward from. 600 was chosen
directly with the maintainer instead, out of a set of concrete candidates
(560 / 600 / 720 / a screen-proportional formula with its own cap), to give
the sheet's content more room on a wide device — a tablet, an unfolded
foldable, or a landscape phone — than 430 left it. 430 remains this
project's other sizing reference (`../../src/shared/ui/card-fan-geometry.test.ts`'s
and `hand-range-pane.tsx`'s own "430 reference"), unaffected by this change.

Below the cap the panel still spans the full screen edge-to-edge, as
before. Its own outer width is now computed explicitly from the same
screen-width reading (`rt.screen.width`, react-native-unistyles' runtime)
its content width already used, rather than through a separate CSS
percentage the layout engine resolved on its own — a real device (a Pixel
10 Pro Fold's 412dp-wide cover screen) showed those two figures could
diverge: the panel's outer box rendered narrower than the true screen while
its content, already sized from that same reading, rendered correctly in
the same screenshot.

## Icon Set

A change MUST draw an icon from this set of fourteen 24×24 stroke icons,
uniform 1.5px stroke with rounded caps and joins: Chevron Left, Chevron Right,
Chevron Down, X, Plus, Cog, Share, Bar Chart, History, Presets, Baloon (a
speech bubble; the name in the file is a misspelling), Document, Database,
Terminal.

**The set is Lucide — this is inferred, not confirmed.** It rests on a
strong visual match across all fourteen glyphs at this canvas size and stroke
treatment, and was not checked against Lucide's own SVG sources. The
component sheet separately carries older icon layers named after Font
Awesome glyphs (`clock-rotate-left-solid`, `folder-regular`), so the file is
not internally consistent about which icon library it draws from. **That
inference does not extend to every icon this project draws** — see the
players list's own trash icon below, whose provenance is measured, not
inferred.

This catalogue is not exhaustive of what the design file draws: the
Settings `Licenses` row (see
[specs/settings.md](../specs/settings.md)) uses a glyph outside these
fourteen — a circle enclosing a bracket-pair, not catalogued here — so
which icon a change should use for that row is unsettled. Three of the
fourteen — `Document`, `Database`, `Terminal` — are named by no
specification; they were inventoried from the component sheet, not derived
from a screen.

### The Players List's Trash Icon

The Analyze players list's swipe-to-delete panel (docs/specs/
equity-analysis.md, issue #87) draws a 20×20 icon outside the fourteen
above — smaller than every icon this catalogue lists, and not part of it.
**Measured, not inferred: it is Heroicons v2 outline `trash`, not Lucide.**
The design's own SVG strokes `#ECEEEC` at width 1.5 with round caps and
joins, and its coordinates are Heroicons' own 24-unit `trash` path scaled
by 20/24 exactly — `14.74 → 12.28333…`, `9.26 → 7.71666…`, `18 → 15`,
`0.91 → 0.75833…` all match the design's own five-decimal figures. This
correction is scoped to this one icon; the fourteen-icon set's own Lucide
inference above is unchecked and unchanged by it, and re-deriving the
other thirteen icons' provenance is a separate pass this change does not
take on.

### The Preset Editor's Save Icon

The Preset editor's own `Save` action
(`src/features/presets/ui/preset-editor-screen/preset-editor-screen.tsx`,
issue #177) draws a 24×24 check icon
(`src/core/icons/check-icon.tsx`) that is not one of the fourteen above —
unlike `Baloon`, the speech bubble Feedback's own `Send` action already
draws from that set, no check or save glyph is in it, and the editor's own
frame draws no save action at all for one to be transcribed from directly
(see [specs/hand-ranges.md](../specs/hand-ranges.md)'s "The Preset
Editor"). Transcribed from Lucide's own published `check` glyph (`M20 6
9 17l-5-5`) at this project's usual 1.5px stroke, rounded caps and joins —
the same treatment, and the same "no frame to transcribe from" gap, as
`x-icon.tsx`'s own precedent for an icon this project needs but the design
file does not draw for it.

### The Hole Cards and Hand Range Icons

`src/features/hand-ranges/ui/hole-cards-icon/hole-cards-icon.tsx`'s
`HoleCardsIcon` and
`src/features/hand-ranges/ui/hand-range-icon/hand-range-icon.tsx`'s
`HandRangeIcon` are two
more 24×24 stroke icons outside the fourteen above — same canvas, same
1.5px stroke with round caps and joins, but not Lucide, inferred or
otherwise. Each is a redraw of one glyph from the AquaIcons font
(https://github.com/axross/aqua/blob/master/assets/fonts/AquaIcons.ttf):
`HoleCardsIcon` from `card-pair` (U+E801), `HandRangeIcon` from `grid`
(U+E808). The font's own glyphs are filled shapes; this project's icon set
is a stroke set, so each glyph's silhouette was redrawn as a stroke path by
hand rather than importing the font's filled path data. This is a
deliberate exception recorded here so a change reading this catalogue's
"draw from this set" rule as exhaustive still has a place to find these
two.

This entry described the two components, not a screen, since no screen drew
either icon at the time it was written (issue #257). Issue #285's tab-row
polish pass is the first to: see
[The Card/Range Sheet's Tab Row](#the-cardrange-sheets-tab-row) below.

### The Card/Range Sheet's Tab Row

`src/shared/ui/segmented-tabs/segmented-tabs.tsx`'s track and selected pill
— the `Cards` / `Hand Range` switcher atop the card/range input sheet
(`docs/specs/hand-ranges.md`), this control's only consumer — carry a set
of departures from this control's own design node (`128:33644`), alongside
its first use of the two icons above.

- **Track.** Still `44` tall, that same node's own measured value,
  unchanged by anything below. Its padding is `4`, not that node's own
  measured `3` — a deliberate departure, recorded in
  `docs/decisions/2026-09-06-give-the-segmented-tab-pill-a-tonal-fill-ring-and-settle-glow.md`.
  It carries no border of its own; the ring below sits on the pill instead.
- **Selected pill.** Still the same sliding, shared element described in
  that component's own doc comment, now filled with the tonal
  `theme.colors.component.accent.rest` rather than the solid accent, ringed
  in a `1`-wide (`theme.borderWidth.base`) border in
  `theme.colors.text.accent.brand`, and shadowed by the animated settle glow
  — see [Segmented Pill Settle Glow](#segmented-pill-settle-glow) above.
- **Icon.** Each tab shows its own icon — `HoleCardsIcon` on `Cards`,
  `HandRangeIcon` on `Hand Range` — fixed at `20`, not either icon
  component's own `24` default, and not scaled to the track's own height.
  Tinted to the same selected/unselected colour the label already uses,
  switching the instant selection changes rather than cross-fading: the
  icon components take an already-resolved `color`, not an animatable one.
- **Label.** Unchanged type weight and face from before this pass — a
  departure this project considered and rejected; see this document's own
  Typography section for why a role is applied whole rather than
  reweighed at one call site. It now sits to the icon's right on every
  tab, selected or not — no reveal, no measurement — and its own colour
  still cross-fades the way [motion.md](./motion.md)'s own "Tab pill" row
  describes.

Every tab keeps an explicit `accessibilityLabel` equal to its own label
text, independent of whichever icon sits beside it — an icon-and-label
control's accessible name is this project's own label text, not whatever a
platform's own default name-construction from its child views would
otherwise produce.

