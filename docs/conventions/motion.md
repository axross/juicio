# Motion

This project's own motion convention: the "Soft" character every animated
surface reads — a spring for movement, a plain ease-out for colour and
opacity — where that character applies, where an engineering constraint
rules it out, and how reduced motion collapses it. The general practice of
choosing when and how a surface should animate belongs to the installed
[`high-fidelity-ui-design`](../../.claude/skills/high-fidelity-ui-design/SKILL.md)
capability; what follows is only this project's own tuning of it.

The design file specifies no motion of its own — every value below is the
maintainer's own pick from an options exhibit (PR #70, and issue #83 for the
second duration below), not a design-file measurement, the same status
[design-system.md](./design-system.md)'s Bottom Sheet Scrim
entry already carries for a value with no design-file source. The tokens
themselves live in code, at
`src/core/motion/tokens.ts` — this document records what the character is,
where it applies, and where it deliberately does not; it does not repeat the
numbers, which change in exactly one place if the maintainer ever retunes
them.

**The character is "Soft"**: roughly 320ms, a gentle spring with a slight,
visible overshoot. It is expressed two ways, split by property kind rather
than as one config for everything:

- **Movement** — `translateY`/`translateX` — reads a spring. A spring's
  overshoot is a real position a moment past the rest one, which is what
  makes "gentle... with a slight overshoot" a physical description at all.
- **Colour and opacity** — reads a plain ease-out timing curve, at the same
  duration, with no overshoot. Overshooting past a target colour is either
  meaningless or produces an out-of-range channel value, so a spring is the
  wrong tool here regardless of how gentle it is tuned.

A change MUST read both from `src/core/motion/tokens.ts` (`motionSpring`,
`motionColor`, and the two config objects they wrap) rather than tuning a
`withSpring`/`withTiming` call locally — the whole point of one shared
character is that every surface below reads the same numbers.

**A second, shorter duration exists beside the one above, for exactly one
surface** — the fan pan candidate's own lift, in "Where It Applies" below.
320ms is the wrong duration there: a candidate can change several times a
second during a fast drag, and a transition tuned to read as "gentle" would
still be settling when the next card takes over, which is visually
indistinguishable from not animating at all. The maintainer picked a quick
timing curve for it at issue #83's own plan gate, over a quick spring or an
asymmetric rise/fall — `src/core/motion/tokens.ts`'s own doc comment names
which option and why. A change MUST read it from that file
(`motionQuick` and its config) the same way it reads `motionSpring`/
`motionColor` above, never tuning a `withTiming` call locally for this
surface either.

## Where It Applies

| Surface | What animates |
| --- | --- |
| Sheet entrance | `src/shared/ui/bottom-sheet/bottom-sheet.tsx`'s scrim leads: its opacity starts fading toward full strength, on the colour/opacity character, the instant the sheet is asked to open — well before the sheet's own contents exist, which is what lets it reach the screen while they're still being built. `translateY` is placed at its offscreen position before the sheet can ever be painted, and its spring toward the open position starts only once the panel's own first layout reports the sheet is genuinely on screen, not at the request itself — see [decisions/2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md](../decisions/2026-09-02-fade-the-bottom-sheet-scrim-before-its-contents-are-built.md) for why the scrim stopped being derived from `translateY` for this half of the animation. |
| Sheet exit | The same `translateY` spring, symmetrical with entrance — this used to animate at a plain 250ms `withTiming`, unrelated to the entrance (which had none). The scrim does not get a colour/opacity timeline of its own here: it derives straight from `translateY`'s own position for the whole exit, the same as it always did before entrance option B — see "Where It Does Not Apply" below and `bottom-sheet.tsx`'s own `isEntranceLeading`, which is what keeps the entrance's timeline from leaking into the exit. |
| Sheet drag release | `bottom-sheet.tsx`'s drag already follows the finger on the UI thread; only the release — snap back or commit to dismiss — animates. The scrim stays pinned to `translateY`'s own position throughout, exactly as it is while the drag is live (see "Where It Does Not Apply" below) — a snap back or a commit is `translateY` running its spring back to a rest position, not a separate scrim timeline retimed alongside it. |
| Tab pill | `src/shared/ui/segmented-tabs/segmented-tabs.tsx`'s selected pill slides between tabs (a shared element, not a per-tab colour swap) — its label colour transitions alongside it, so a tab's text never reads as already-selected before the pill visually arrives; icon and label sit side by side on every tab, selected or not (see [design-system.md](./design-system.md#the-cardrange-sheets-tab-row)), so nothing about that layout itself animates. The pill's own shadow does: a "settle glow" — `glowIntensity` jumps to its peak the instant the pill's position target changes, then eases back to rest on the same colour/opacity timing every other surface here reads, via `motionColorTimingConfig`. It shares `pillTranslateX`'s own effect and guard — a re-press of the tab already selected changes neither target, so neither the slide nor the glow restarts or duplicates. |
| Shorthand chip | `src/shared/ui/hand-range-pane/hand-range-pane.tsx`'s `ShorthandChip` — background, ring colour (not the ring's width, which stays fixed — see the "Where It Does Not Apply" reasoning on why a spring, not a timing, owns movement), and label all transition between rest and active. |
| Focus ring | `src/shared/ui/cards-pane/cards-pane.tsx`'s ring travels between the two preview slots (a shared element, not one owned by each slot) rather than teleporting. |
| Card landing in a slot | `src/shared/ui/playing-card/playing-card.tsx`'s `PlayingCard` fades its own fill and border in on mount, from the empty slot's own look, when its caller opts in via `animateEntrance` — only `CardsPane`'s preview slots pass it; the fan mounts thirteen cards per arc at once (see Part B below) and animating every one in would read as a burst, not a landing. |
| Grid cell, single tap | `src/shared/ui/selection-grid/selection-grid.tsx`'s cell fill transitions when `beginPaint` (`./painting.ts`) produced the flip — see the next section for why a crossing during a drag does not. |
| Fan pan candidate | `cards-pane.tsx`'s `FanCard` raises the card under the finger and lowers the previous one, both over the quick duration above (issue #83) — a candidate change used to move both cards in a single frame, which read as cards popping rather than one card travelling with the finger. The candidate itself is never delayed — `FanArc`'s pan resolves it synchronously per touch event, same as before this change — so what animates is only the lift that follows an already-resolved candidate. Whether the quick duration is short enough that a fast sweep never visibly trails the finger is a device-feel judgment the plan left to a real-device check, still outstanding as of this change; it is not the "Where It Does Not Apply" reasoning below, which rules out easing for a surface that itself follows the finger frame-for-frame. |
| Equity Breakdown chart bars | `src/features/evaluations/ui/equity-breakdown-chart/equity-breakdown-chart.tsx`'s `EquityBreakdownChart` eases every bar's own height toward its new value instead of snapping to it — both the first time the sheet draws a real distribution after opening (every bar grows in from zero) and every time the acting player's live result updates while a calculation is running (issue #197). This is a **deliberate departure from the movement-spring-is-for-`translateX`/`translateY`-only rule above**: a bar's own height is a size, which this document's own split would otherwise route to the plain ease-out timing side — but the maintainer's own call (2026-09-04) was that a bar *growing in* has nothing below zero to rebound through, so `motionSizeTimingConfig`'s own failure mode (a collapsing box un-collapsing for a frame on the rebound, see `src/core/motion/tokens.ts`) cannot occur here, and a growing bar reads closer to the bottom sheet's own spring-driven arrival than to a row's collapsing height. It reads `motionSpringConfig` unchanged, passed through as this chart's own `bar-chart.tsx` primitive's `springConfig` prop: the primitive drives a single Reanimated shared value with `withSpring` on the UI thread, and each bar's own `Rect` reads its height and y position from that shared value through a `useDerivedValue` — no bespoke interpolation of this component's own, and no dependency on a charting library noticing two distinct React commits to replay it. **The entrance half of that — the grow-from-zero, not the live-update easing — now waits for the bottom sheet's own "visually finished opening" signal before it starts (issue #228)**, so the chart's own growth animation plays only once the sheet has come to rest rather than racing its slide-up: `src/shared/ui/bottom-sheet/bottom-sheet.tsx`'s `BottomSheet` exposes that signal through an optional `onOpened` callback, fired at the same moment as its own `sheetOpen` haptic; `equity-breakdown-sheet.tsx` tracks it as `hasFinishedOpening`, resetting to `false` whenever the sheet closes, and threads it down through `EquityBreakdownChart` into `bar-chart.tsx`'s own identically-named prop, which holds every bar at zero until it arrives. |

## Where It Does Not Apply

An engineering constraint, not a preference — each of these already follows
the finger or the last discrete pointer move, and easing a *further* one
would desynchronise the paint from the input that drives it:

| Surface | Why |
| --- | --- |
| Grid drag-paint | One cell flips per pointer move (`continuePaint`, `./painting.ts`). Easing each would leave a visible trail lagging the finger. |
| Sheet drag follow | Already follows the finger on the UI thread — only the release (in "Where It Applies" above) animates, and even then stays on this same footing. The scrim's opacity is derived directly from `translateY`'s live position every frame, drag or release alike, the same as before entrance option B; only the entrance gives the scrim a timeline of its own. |

**The grid carries this distinction in one component, not two.** A single
tap and a drag both start the same way — `beginPaint` decides the first
cell — so `selection-grid.tsx` cannot know in advance which one a gesture
will turn out to be; it tags the *cause* of each flip (`beginPaint` vs.
`continuePaint`) instead, and a caller's cell reads that tag to fade only
the gesture's first cell, snapping every cell a drag crosses after it. This
is what lets one grid serve both cases without the second becoming a
trail: only the touch-down cell of any gesture ever eases, whether that
gesture stays a tap or grows into a drag.

## Reduced Motion

`src/core/motion/use-prefers-reduced-motion.ts`'s `usePrefersReducedMotion`
reads the OS "reduce motion" setting live, through `AccessibilityInfo`
(`isReduceMotionEnabled` plus the `reduceMotionChanged` event) — this
project's first read of that setting anywhere, so there was no existing
precedent to follow. `motionSpring`/`motionColor`/`motionSize` (`src/core/motion/
tokens.ts`) all collapse to an immediate jump to the target value when it
reads `true`, rather than a shortened animation: every surface above keeps
its state change and its feedback, only the travel between the two states
is skipped.

**A perpetual loop has no single target value to collapse to, and this
project's first one departs from the pattern above for that reason
(2026-09-04, issue #210).** Every surface catalogued above, `Reduced
Motion`'s own two paragraphs included, is a discrete, triggered
state-to-state transition — `motionColor`/`motionSpring`'s own
collapse-to-target semantics fit that shape exactly, because there is
always a `toValue` the skipped travel would otherwise have arrived at.
`src/features/evaluations/ui/new-player-fab/new-player-fab.tsx`'s resting
glow is this project's first continuous, looping animation instead — it
runs for as long as the button is on screen, with no discrete "arrived"
state to jump to. It does not read `motionColor` for its own reduced-motion
branch: reduced motion instead holds the glow's own animated value at the
brighter end of the range it otherwise breathes across, coloured and
visible but perfectly still, rather than collapsing toward a `toValue` a
loop never had in the first place. See that component's own doc comment for
the mechanism.

