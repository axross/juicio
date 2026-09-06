import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFont } from '@shopify/react-native-skia';

import { motionSpringConfig } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';

import { bandColor } from '../../model/band-color';
import {
  chooseBarCount,
  combosAxisUpperBound,
  EQUITY_BIN_COUNTS,
  foldEquityBins,
} from '../../model/equity-breakdown';
import {
  bandEquityBinCounts,
  countStrengthBands,
  majorityBandsPerBin,
  type StrengthBand,
} from '../../model/strength-band';
import { reportError } from '@/core/instrumentation/report-error';

import { BarChart } from './bar-chart';

/**
 * the "no result" input this chart folds when `distribution` is `null` —
 * every bin at zero, the same 20-bin shape a real
 * `EspadaEquityPlayerResult.distribution` carries. Folding this through
 * the same `foldEquityBins`/`combosAxisUpperBound` pipeline every real
 * distribution goes through, rather than special-casing the derived
 * values, is what keeps this one small array the only place "no data"
 * is decided — everything downstream (`combosAxisMax`, the accessibility
 * label) falls out of it the same way it would for a real, merely-empty
 * distribution.
 */
const NO_RESULT_DISTRIBUTION: readonly number[] = new Array(EQUITY_BIN_COUNTS[0]).fill(0);

/** the "no result" input `equities`/`bands` fold when either is `null` —
 * an empty pair list, which `bandEquityBinCounts` already resolves to
 * every bin at zero under every band, the same "fold the same shape a real
 * result would produce" reasoning `NO_RESULT_DISTRIBUTION` above already
 * follows. */
const NO_RESULT_EQUITIES: readonly number[] = [];
const NO_RESULT_BANDS: readonly StrengthBand[] = [];

/** the colour an empty bin's own bar takes — never actually visible, since
 * `majorityBandsPerBin` only resolves `null` for a bin no band holds any
 * card pair in, and that same bin's own folded `distribution` count is
 * always `0` too (`bandEquityBinCounts`/`foldEquityBins` bucket the exact
 * same live card pairs), so the bar this colour would paint is drawn at
 * zero height regardless of which colour it is handed. Picked as a fixed,
 * arbitrary band rather than left `undefined` so `bandColor` never needs a
 * `null` case of its own. */
const EMPTY_BIN_FALLBACK_BAND: StrengthBand = 'trash';

// no design-file measurement of the chart's own height alone — this is
// this project's own pick of how much vertical room the canvas gets
// inside the sheet, the same "implementer's own choice, not a design
// measurement" status `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
// own dismiss thresholds carry. Independent of the combos axis's own
// upper bound (`combosAxisUpperBound` below): `BarChart` scales whatever
// `valueAxisUpperBound` it is handed to fill its own plot area, so a taller
// axis draws shorter bars at the same canvas height rather than needing
// more of it.
const CHART_HEIGHT = 220;

/**
 * the Equity Breakdown sheet's own bar chart (docs/specs/
 * equity-analysis.md): the acting player's own real
 * per-card-pair `distribution` prop, folded to whatever bar count this
 * component's own measured drawing width supports
 * (`../../model/equity-breakdown.ts`), drawn through `./bar-chart.tsx` — a
 * bar-chart primitive with no knowledge of poker or equity, hand-rolled
 * directly on `@shopify/react-native-skia` canvas primitives and
 * `react-native-reanimated` shared values.
 *
 * **`distribution` is `null` only in the practically-unreachable case
 * `../equity-breakdown-sheet/equity-breakdown-sheet.tsx` already documents
 * for its own header** — the acting player removed, or a new calculation
 * restarted, while this sheet somehow stays open. That case folds
 * `NO_RESULT_DISTRIBUTION` (every bin at zero) through the exact same
 * pipeline a real distribution goes through, rather than a second code
 * path: every drawn bar's own value is `0`, so nothing is drawn, without
 * this component needing to special-case "no bars" separately from
 * "bars that happen to be short."
 *
 * **all the real logic lives in plain, unit-tested modules** —
 * `../../model/equity-breakdown.ts`'s `chooseBarCount`/`foldEquityBins`,
 * `../../model/strength-band.ts`'s `bandEquityBinCounts`/
 * `majorityBandsPerBin`, and `../../model/band-color.ts`'s `bandColor` —
 * because Skia and Reanimated are not exercisable under this project's Jest setup
 * (docs/conventions/testing.md). `BarChart` is this project's own
 * component, not a third party, so it renders for real in
 * `equity-breakdown-chart.test.tsx` too, over the identical mocked Skia
 * primitives `bar-chart.test.tsx` mocks — that suite asserts this
 * component's own configuration (the bar values and colours it folds, the
 * accessibility label, which spring config or none reaches `./bar-chart.tsx`)
 * against what actually gets drawn, never against a captured `BarChart`
 * prop; `./bar-chart.tsx`'s own pixel-geometry math is asserted directly,
 * with neither library involved, in `./geometry.test.ts`.
 *
 * **measures its own width via `onLayout`, then chooses the bar count from
 * that measurement as it arrives** — the sheet's `PANEL_MAX_WIDTH` and its
 * own side padding mean the chart's
 * actual drawing width is not a pure function of device width alone. What
 * `onLayout` reports is the canvas's **border box**: React Native's own
 * `LayoutMetrics.h` documents a `frame` as covering border, padding and
 * content, and `BaseViewEventEmitter::onLayout` dispatches that frame, not
 * the content one. The strip the bars actually get is narrower still — the
 * combos axis's own labels and name sit outside the plot, reserving their
 * width plus an offset off its left edge, tens of points rather than one
 * — and the count is chosen from the measurement anyway, deliberately.
 * At the widest supported phone the measurement is 401pt, one point clear
 * of the 400pt the 20-bar tier needs. Subtracting either the label gutter
 * or the bounding rule first would drop that tier: the gutter outright,
 * and the rule by putting the tier exactly on its threshold, where a
 * measurement arriving as 400.9 rather than 401 — Android's pixel-grid
 * rounding of the widest supported phone's own 430dp width less two
 * 14.5dp paddings lands either side of the integer — would silently drop
 * the widest phone to 16 bars. Which tier a phone lands on is a
 * correctness requirement, while
 * `MINIMUM_BAR_PITCH` is a
 * legibility heuristic neither a rule's width nor a label's decides, so
 * the headroom is spent on the requirement. **A later pass must not
 * "correct" this by subtracting either of them.**
 *
 * Before the first layout pass reports a real width, no chart is drawn at
 * all: the canvas below renders `null` while `width` is still `0`, and
 * only the accessibility label is resolved in that state, from the
 * narrowest tier `../../model/equity-breakdown.ts` ever chooses
 * (`EQUITY_BIN_COUNTS`'s own last entry). Drawing nothing for that one
 * frame beats drawing at a count the real measurement is about to
 * contradict. The same render guard now also requires `axisFont` (below) to
 * be loaded — `useFont` returns `null` until its asset finishes loading, and
 * this chart draws nothing rather than a frame with no axis text for
 * exactly the same "draw nothing until ready" reason. That same `null` also
 * covers the asset failing to decode at all, which `useFont` never recovers
 * from — the guard still draws nothing, correctly, in that case too;
 * `axisFont`'s own declaration below is what reports it as a diagnosable
 * failure rather than leaving it indistinguishable from "still loading".
 *
 * **each bar's own flat colour is its bin's majority strength band, never a
 * gradient fill** (docs/decisions/2026-09-04-colour-each-histogram-bar-by-
 * its-majority-strength-band.md) — `equities`/`bands` below are this
 * player's own per-card-pair equities and their already-classified bands
 * (`../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
 * `../../model/strength-band.ts` call, not repeated here), bucketed by
 * `../../model/strength-band.ts`'s `bandEquityBinCounts` into the same
 * 20 equity bins a real `distribution` is already binned into, then folded
 * to whichever bar count this component resolved to and resolved to one
 * majority band per bar by `majorityBandsPerBin` — a tie between two bands
 * within one bin settled there in favour of the stronger band. `bandColor`
 * (`../../model/band-color.ts`) is the one place that resolved band becomes
 * an actual colour string, read off `theme.bands`
 * (`../../../../core/theme/tokens.ts`); `bars` below pairs each folded
 * count with that single colour, one entry per bar — `BarChart` draws each
 * bar as its own flat-coloured rectangle, never a gradient within one. An
 * empty bin (no live card pair under any band) resolves to `null` and
 * falls back to `EMPTY_BIN_FALLBACK_BAND` above, a colour nothing ever
 * actually shows: that same bin's own folded `distribution` count is
 * always `0` too, so its bar is drawn at zero height regardless of which
 * colour it is handed.
 *
 * **one labelled element, not one stop per bar** — the canvas container
 * below carries `accessible`/`accessibilityLabel` naming what the chart
 * shows, how many bars it drew, what each axis runs from and to, and each
 * of the four strength bands' own live card-pair count, in the legend's own
 * weakest-to-strongest order: Trash, Marginal, Value, Nuts.
 * Everything the chart says is
 * painted by Skia rather than laid out as text, so that one label is the
 * only thing about this chart a screen reader can reach at all: it has to
 * carry what each individual axis label would otherwise announce on its
 * own. Each band's own count is tallied by `countStrengthBands` from this
 * component's own `bands` prop — the same tally and the same already-
 * classified per-pair bands `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx`'s own legend already uses for the identical
 * four counts — and worded the same `"<band name>: <count> combos"` pairing
 * that legend's own accessibility label already carries, so the two always
 * agree for the same result.
 *
 * **the axis furniture is `BarChart`'s own, not assembled around it** — the
 * bounding rules, the two end labels each axis draws, and both axis titles
 * are `./bar-chart.tsx`'s own responsibility now, given exactly the text
 * and configuration to draw: `frame` below sets all four side widths
 * explicitly (a side at `0` is not drawn at all — a side this component
 * omitted, rather than set to `0`, would be `BarChart`'s own decision to
 * make, and it draws nothing for one), and `xAxis`/`yAxis` below pass only
 * each axis's own two end labels and title — `BarChart` draws nothing at
 * any other position along either axis, so a blank interior tick falls out
 * of what it is given rather than being special-cased by a formatter.
 * `BarChart` draws
 * `yAxis.endLabel` directly, with no tick-resolution step of its own kind
 * at all, so the combos axis's own top label is never silently dropped for
 * lacking a resolved tick — see
 * docs/decisions/2026-09-04-drop-victory-native-for-a-hand-rolled-skia-bar-chart.md
 * for why this chart no longer reads through a charting library's own
 * ticking at all.
 *
 * **the tick labels need an `SkFont`, loaded from this project's own
 * bundled asset — not asked of the platform by family name.** A family name
 * resolved through `Skia.FontMgr.System()` is unreliable across platforms:
 * iOS resolves the literal string `"System"` through a native alias
 * (`.AppleSystemUIFont`) before handing it to the font manager, so it
 * matches and renders; Android has no equivalent alias, so `"System"` is
 * asked for verbatim against Android's real font families (`sans-serif`,
 * `Roboto`, …), fails to match anything, and silently produces a font that
 * draws no visible glyphs at all — no error, nothing a mocked test or a
 * source read can catch, only a real device. See
 * docs/decisions/2026-09-04-load-the-equity-breakdown-chart-axis-font-with-usefont-not-matchfont.md
 * for why this project moved off a platform-resolved family name
 * entirely, and why a later change must not revert to `matchFont` or any
 * other system-font path without the same maintainer decision that record
 * required.
 *
 * `useFont`
 * (`@shopify/react-native-skia`'s `src/skia/core/Font.ts`) loads this
 * project's own bundled `assets/fonts/InnovatorGrotesk-Regular.otf` by its
 * actual bytes — reached via `@/assets/*`, this project's own `tsconfig.json`
 * alias for crossing the `src/` boundary to a non-`src/` directory
 * (docs/conventions/directory-structure.md), not a hand-counted relative
 * path — rather than asking the platform to resolve a family name,
 * sidestepping the whole class of platform-dependent alias-resolution
 * failure described above. `useFont(source, size)` reads
 * `theme.typography.chartAxisLabel`'s own size (this project's type scale
 * stays the single source of that number; only the size reaches Skia,
 * since a font has no line height to take — docs/conventions/
 * design-system.md's Typography section records that). `useFont` is
 * already memoised internally on `[size, typeface]` (`Font.ts`'s own
 * `useMemo`), so this component does not wrap it in a second one. Loading
 * a font asset means it is not available on the first frame, so the chart
 * draws with no axis labels at all for one or more frames while the load
 * completes — see the render-guard paragraph above `axisFont`'s own
 * declaration below for how this component handles that. `useFont` also
 * takes a third `onError` argument — a font that fails to decode resolves
 * to `null` forever, indistinguishable from "still loading" otherwise — see
 * `axisFont`'s own declaration below for how this component reports that.
 *
 * **each axis keeps only its two ends** — not by formatting away an
 * interior tick, but because `BarChart` is
 * handed exactly those two strings per axis and draws nothing else.
 *
 * **every bar eases toward its own new height instead of snapping to it,
 * grows in from zero every time this component's own `BarChart` mounts, and
 * grows in from zero again whenever the bar count itself changes.** `bars`
 * below is computed directly from the real, current `distribution` on
 * every render, with no lagged state of its own — see
 * docs/decisions/2026-09-04-drop-victory-native-for-a-hand-rolled-skia-bar-chart.md
 * for why a lagged-state entrance mechanism was replaced. The entrance and
 * the mid-calculation easing are both `./bar-chart.tsx`'s
 * own responsibility now: it holds a Reanimated shared value for every
 * bar's own height and, in one synchronous effect callback, assigns that
 * shared value to zero and then immediately calls `withSpring` toward the
 * real values it is handed — on its own mount, and again whenever the bar
 * count itself changes, since a different bar count means the bars
 * represent different bins and easing between them would be meaningless.
 * An update at a stable bar count calls `withSpring` directly, with no zero
 * reset, for the unchanged mid-calculation easing. Neither transition
 * depends on a second React commit landing at all — see
 * `./bar-chart.tsx`'s own doc comment for the full mechanism.
 *
 * **the entrance half of that also waits for `hasFinishedOpening` below,
 * this component's own pass-through of `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx`'s own tracking of the bottom sheet's "visually
 * finished opening" signal (issue #228)** — so the growth animation only
 * plays once the sheet has visually come to rest, never while it is still
 * sliding into place. `bars` still grows from zero the moment it mounts or
 * its bar count changes (unchanged), but the spring toward the real values
 * now holds until `hasFinishedOpening` is `true`; the mid-calculation
 * easing above is untouched, since it only ever runs once the sheet is
 * already open. `./bar-chart.tsx`'s own `hasFinishedOpening` doc comment
 * covers the gate itself.
 *
 * `springConfig` below is `motionSpringConfig`
 * (`@/core/motion/tokens.ts`) — this project's own movement spring, not its
 * size timing — a deliberate departure
 * from this project's own rule that a spring is reserved for
 * `translateX`/`translateY` and a size reads a plain ease-out instead
 * (`motionSpringConfig`'s own doc comment explains why a *collapsing* size
 * cannot take a spring without briefly un-collapsing on the rebound): a bar
 * *growing in* has nothing below zero to rebound through, so that failure
 * mode cannot occur here, and a growing
 * bar reads closer to the bottom sheet's own spring-driven arrival than to
 * a row's collapsing height. `usePrefersReducedMotion()` collapses both
 * transitions to an immediate, correct height: `springConfig` is
 * `undefined` under reduced motion, which `./bar-chart.tsx`'s own doc
 * comment states is drawn with no animation call at all, on both an
 * entrance and an update.
 *
 * **this does not close the one residual gap every other reader of
 * `usePrefersReducedMotion()` already tolerates.** That hook's own doc
 * comment (`@/core/motion/use-prefers-reduced-motion.ts`) states its return
 * value reads `false` on every render until its first async
 * `AccessibilityInfo` check settles — so on a sheet open where that check
 * has not yet settled by the moment `BarChart`'s own mount gate (`width > 0
 * && axisFont`, below) clears, `BarChart` mounts with `springConfig` still
 * set, seeds its shared value at zero, and starts a real `withSpring`
 * transition toward the real heights, exactly the entrance every other open
 * plays. Only once `prefersReducedMotion` resolves `true` on a later render
 * does `springConfig` become `undefined`, at which point `./bar-chart.tsx`'s
 * own effect (an update, not a second entrance, since the bar count has not
 * changed) assigns the real heights directly, cutting the in-flight spring
 * short rather than letting it finish. This is the same live, resolve-timing
 * race that hook's own doc comment already names — "a transition beginning
 * before the true value resolves plays once, as ordinary motion, rather
 * than breaking anything" — not a new one this component introduces;
 * `equity-breakdown-chart.test.tsx`'s own regression test exercises it
 * directly.
 */
export function EquityBreakdownChart({
  distribution,
  equities,
  bands,
  hasFinishedOpening,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** the acting player's own real per-card-pair equity distribution — a
   * fixed-length array of counts, one per equal-width equity slice,
   * exactly the shape `EspadaEquityPlayerResult.distribution`
   * (`@/modules/espada-engine/index`) carries, or `null` when no result
   * is currently available for that player (see this component's own
   * doc comment). `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`
   * is this prop's only source — it owns which player this chart is
   * currently open for. */
  distribution: readonly number[] | null;
  /** this same player's own live card pairs' own equities, in the same
   * order as `bands` below — `null` exactly when `distribution` is `null`
   * (no result currently available). Paired with `bands` rather than
   * carried as full `EspadaEquityCardPairResult` entries: this component
   * only ever needs a pair's own equity (to bucket it into an equity bin)
   * and its already-classified band, never `cardA`/`cardB`. */
  equities: readonly number[] | null;
  /** this same player's own live card pairs' own strength bands, already
   * classified by `../../model/strength-band.ts` — this component's own
   * job is only to bucket them by `equities` above into bins and resolve
   * each bar's own majority, never to classify a card pair itself (that
   * stays `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
   * job, the same "the sheet computes it once, the chart only folds it for
   * rendering" split this component already keeps for `distribution`
   * itself). `null` exactly when `distribution` is `null`. */
  bands: readonly StrengthBand[] | null;
  /** passed straight through to `./bar-chart.tsx`'s own identically-named
   * prop — see this component's own doc comment and that prop's own for
   * the gate this drives. `../equity-breakdown-sheet/
   * equity-breakdown-sheet.tsx` is this prop's only source: it tracks the
   * bottom sheet's own "visually finished opening" signal and resets it
   * whenever the sheet closes, so this component itself holds no state of
   * its own about it. */
  hasFinishedOpening: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  // `cardPairCount` ("{{count}} combos") lives in this project's own
  // `handRanges` namespace, not `analyze` — the same second `useTranslation`
  // call `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
  // `tHandRanges` already makes for the identical reason.
  const { t: tHandRanges } = useTranslation('handRanges');

  const prefersReducedMotion = usePrefersReducedMotion();

  const [width, setWidth] = useState(0);

  // `theme.bands`'s own shape (`../../../../core/theme/tokens.ts`'s
  // `buildBands`) pairs each band with both its `solid` fill and its `text`
  // counterpart; `bandColor` wants only the four `solid` anchors, so those
  // are the only four scalars this component reads off `theme` for the
  // bars at all. Reading them here, outside the `useMemo` below, still goes
  // through `useUnistyles`'s own proxy `get` trap and registers this
  // component's `UnistyleDependency.Theme` subscription exactly as reading
  // them inside the memo would have (`node_modules/react-native-unistyles/
  // src/core/useProxifiedUnistyles/useProxifiedUnistyles.ts`'s `get`
  // handler adds the dependency on every property access, regardless of
  // which caller made it) — so pulling them out here costs the theme
  // subscription nothing.
  const trashColor = theme.bands.trash.solid;
  const marginalColor = theme.bands.marginal.solid;
  const valueColor = theme.bands.value.solid;
  const nutsColor = theme.bands.nuts.solid;

  // the four scalars the axis furniture takes, read off `theme` the same
  // way and for the same reason: every one of them is a plain number or
  // hex string, so the memos below can depend on them by value.
  //
  // `border.neutral.unselectedControl`, not any step of the neutral border
  // ramp: the rules stand on the sheet panel's `background.neutral.app`
  // ground, where every one of those steps falls under the WCAG 2 AA 3:1
  // non-text floor a rule is held to, while `unselectedControl` — the role
  // this project already added for exactly that failure — clears it.
  // docs/conventions/design-system.md's "Brand Accent and Unselected-
  // Control-Border Roles" section carries the measurements and settles
  // this, and `../../../../core/theme/tokens.test.ts` asserts them; the
  // functional requirement is that the axes stay easy to make out on a
  // real device, which points the same way. do not "normalise" this back
  // to a ramp step.
  const axisRuleColor = theme.colors.border.neutral.unselectedControl;
  const axisRuleWidth = theme.borderWidth.base;
  const axisLabelColor = theme.colors.text.neutral.low;
  const axisLabelFontSize = theme.typography.chartAxisLabel.fontSize;

  const equityAxisName = t('equityBreakdown.chart.equityAxisLabel');
  const combosAxisName = t('equityBreakdown.chart.combosAxisLabel');

  // loads the bundled `InnovatorGrotesk-Regular` face by its actual bytes,
  // not by asking the platform to resolve a family name — see this
  // component's own doc comment for why `matchFont`'s system-font path is
  // gone. `useFont` returns `null` until the asset finishes loading (or on
  // load failure), and is already memoised internally on `[size, typeface]`
  // (`@shopify/react-native-skia`'s `Font.ts`), so this component does not
  // wrap it in its own `useMemo` the way it did for `matchFont`. The render
  // guard below must not hand `BarChart` a `null` font.
  //
  // `@/assets/*`, not a hand-counted relative path back out of `src/` —
  // this is that alias's own settled purpose (`tsconfig.json`'s
  // `"@/assets/*": ["./assets/*"]`, docs/conventions/directory-structure.md)
  // for crossing the `src/` boundary to the non-`src/` `assets/` directory,
  // and this project's other `@/...` imports (this file's own test, for
  // one) already prove it resolves under both `tsc` and `jest-expo`'s babel
  // preset.
  //
  // the third argument is `useFont`'s own `onError` — a font that fails to
  // decode resolves to `null` forever (`node_modules/@shopify/
  // react-native-skia@2.6.2`'s `useTypeface`), indistinguishable from
  // "still loading" from this component's own render guard alone. Without
  // this, a corrupted or unreadable bundled asset would reproduce the exact
  // "invisible axis text, no error anywhere" symptom the switch away from
  // `matchFont` above exists to cure, only silently. Reported through
  // `reportError` (`@/core/instrumentation/report-error`), the same
  // vendor-neutral seam `src/core/haptics/haptics.ts`'s `triggerHaptic` uses
  // for its own "swallowed by default, but worth knowing about" failure —
  // this is diagnostics only, not a UI change: the render guard below
  // already draws nothing for a `null` font regardless of why it is `null`.
  const axisFont = useFont(
    require('@/assets/fonts/InnovatorGrotesk-Regular.otf'),
    axisLabelFontSize,
    (error) =>
      reportError(error, {
        tags: { module: 'equity-breakdown-chart', asset: 'InnovatorGrotesk-Regular' },
      }),
  );

  // the functional requirement: "the chart re-renders
  // only when the sheet's own width or open player changes; scrolling the
  // list behind the sheet must not recompute it." this component takes no
  // `player` prop at all — `../equity-breakdown-sheet/
  // equity-breakdown-sheet.tsx` is what owns which player is open, and
  // hands this component that player's own real `distribution`/`equities`/
  // `bands` rather than this component reading or classifying them itself —
  // so `width`, those three (each read directly, with no lag of its own
  // kind — see this component's own doc comment on why the entrance no
  // longer needs one), and the four band anchors above are the only inputs
  // this whole derivation actually reads.
  //
  // The dependency array below names those four anchor **strings**, not
  // `theme` itself, and that difference is load-bearing rather than
  // stylistic: `useUnistyles()`'s returned `theme` is a `Proxy` that
  // `useProxifiedUnistyles` constructs fresh on every call — unconditionally,
  // whether or not the underlying theme actually changed
  // (`useProxifiedUnistyles.ts`'s `const proxifiedTheme = new Proxy(theme,
  // { ... })`, itself rebuilt every render because the `get` trap needs a
  // closure over that render's own `dependencies` set). A dependency array
  // holding `theme` therefore never has two equal values across renders —
  // `Object.is` compares the previous render's `Proxy` wrapper against this
  // render's new one, never the wrapped theme underneath — so a `useMemo`
  // depending on `theme` recomputes on every render regardless of whether
  // the theme changed, silently discarding the whole point of memoizing.
  // The four anchors are plain hex strings (`theme/tokens.ts`'s `buildBands`),
  // so `Object.is` compares them by value: unchanged strings compare equal
  // across renders, and the previous `barCount`/`bars`/`combosAxisMax` are
  // genuinely reused whenever this component's own function body re-runs
  // for a reason that changes neither `width`, `distribution`/`equities`/
  // `bands`, nor the theme — its parent sheet re-rendering because a state
  // change elsewhere in `../analyze-screen/analyze-screen.tsx` re-rendered
  // the tree, such as the list scrolling behind an open sheet — rather than
  // calling `foldEquityBins`, `bandEquityBinCounts`, `majorityBandsPerBin`,
  // and `combosAxisUpperBound` again on every such render.
  // `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own `useMemo`
  // calls are what keep `equities`/`bands` themselves referentially stable
  // across a re-render that changes neither this player's own result nor
  // the calculation's own player count/street — the same stability
  // `distribution` already relies on via that store's own selector.
  const { barCount, bars, combosAxisMax } = useMemo(() => {
    // `width` is the canvas's border box — wider than the strip the bars
    // are drawn in, by both the bounding rule and the combos axis's own
    // label gutter — and the count is chosen from it as measured, so the
    // widest supported phone keeps a point of headroom above the 20-bar
    // threshold instead of falling below it. See this component's own doc
    // comment; do not subtract either here.
    const barCount =
      width > 0 ? chooseBarCount(width) : EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];
    // `distribution === null` is the practically-unreachable "no result"
    // case (see this component's own doc comment) — folding
    // `NO_RESULT_DISTRIBUTION` through the same pipeline a real
    // distribution goes through draws every bar at count `0`, so no bars
    // are drawn, without a second "no data" branch below this line.
    const counts = foldEquityBins(distribution ?? NO_RESULT_DISTRIBUTION, barCount);
    // `equities`/`bands` are `null` in exactly the same "no result" case
    // `distribution` is — bucketing the empty `NO_RESULT_EQUITIES`/
    // `NO_RESULT_BANDS` pair resolves every bin's own majority to `null`,
    // which the fallback below already turns into a colour nobody sees
    // (every one of those bars is drawn at zero height too).
    const binCountsByBand = bandEquityBinCounts(
      equities ?? NO_RESULT_EQUITIES,
      bands ?? NO_RESULT_BANDS,
    );
    const majorityBands = majorityBandsPerBin(binCountsByBand, barCount);
    const anchors = {
      trash: trashColor,
      marginal: marginalColor,
      value: valueColor,
      nuts: nutsColor,
    };
    const bars = counts.map((count, index) => ({
      value: count,
      color: bandColor(majorityBands[index] ?? EMPTY_BIN_FALLBACK_BAND, anchors),
    }));
    // derived from `counts` above, not a fixed figure — see
    // `combosAxisUpperBound`'s own doc comment
    // (`../../model/equity-breakdown.ts`) for why a fixed axis top cannot
    // hold across every bar count `chooseBarCount` can resolve to.
    const combosAxisMax = combosAxisUpperBound(counts);

    return { barCount, bars, combosAxisMax };
    // `width`, `distribution`, `equities`, `bands`, and the four anchor
    // strings are the only reactive values this callback reads —
    // `chooseBarCount`, `foldEquityBins`, `bandEquityBinCounts`,
    // `majorityBandsPerBin`, `bandColor`, and `combosAxisUpperBound` are
    // module-level pure functions, not values a dependency array needs to
    // name.
  }, [width, distribution, equities, bands, trashColor, marginalColor, valueColor, nutsColor]);

  // the four strength-band counts the accessibility label below names
  // alongside the bar count and axis max — tallied from this component's
  // own `bands` prop by the same `countStrengthBands`
  // (`../../model/strength-band.ts`) `../equity-breakdown-sheet/
  // equity-breakdown-sheet.tsx`'s own legend already tallies its identical
  // four counts with, over the same "no result" `NO_RESULT_BANDS` fallback
  // `bandEquityBinCounts` above already reads. A plain `useMemo` on `bands`
  // alone, not folded into the bar/colour `useMemo` above: this tally does
  // not depend on `width` or the four theme colour anchors that memo's own
  // dependency array exists to guard.
  const bandCounts = useMemo(() => countStrengthBands(bands ?? NO_RESULT_BANDS), [bands]);

  // each band's own "<name>: <count> combos" phrase — the same pairing
  // `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
  // `LegendItem` already composes for its identical accessibility label, so
  // a screen-reader user hears the same words for the same count whichever
  // of the two they reach.
  const trashBandPhrase = `${t('equityBreakdown.bands.trash')}: ${tHandRanges('cardPairCount', { count: bandCounts.trash })}`;
  const marginalBandPhrase = `${t('equityBreakdown.bands.marginal')}: ${tHandRanges('cardPairCount', { count: bandCounts.marginal })}`;
  const valueBandPhrase = `${t('equityBreakdown.bands.value')}: ${tHandRanges('cardPairCount', { count: bandCounts.value })}`;
  const nutsBandPhrase = `${t('equityBreakdown.bands.nuts')}: ${tHandRanges('cardPairCount', { count: bandCounts.nuts })}`;

  const accessibilityLabel = t('equityBreakdown.chart.accessibilityLabel', {
    count: barCount,
    max: combosAxisMax,
    trash: trashBandPhrase,
    marginal: marginalBandPhrase,
    value: valueBandPhrase,
    nuts: nutsBandPhrase,
  });

  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View
        style={styles.canvas}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={accessibilityLabel}
        testID={testID ? 'canvas' : undefined}
      >
        {width > 0 && axisFont ? (
          <BarChart
            bars={bars}
            valueAxisUpperBound={combosAxisMax}
            width={width}
            height={CHART_HEIGHT}
            font={axisFont}
            labelColor={axisLabelColor}
            frame={{
              color: axisRuleColor,
              // all four sides, deliberately — see `./bar-chart.tsx`'s own
              // doc comment: an omitted side is this component's own
              // decision, drawn as `0`, never left undefined. The top and
              // right edges stay open, since a full box would read as a
              // frame around the chart rather than as two axes.
              top: 0,
              right: 0,
              bottom: axisRuleWidth,
              left: axisRuleWidth,
            }}
            xAxis={{
              startLabel: EQUITY_AXIS_START_LABEL,
              endLabel: EQUITY_AXIS_END_LABEL,
              title: equityAxisName,
            }}
            yAxis={{
              startLabel: COMBOS_AXIS_START_LABEL,
              endLabel: String(combosAxisMax),
              title: combosAxisName,
            }}
            springConfig={prefersReducedMotion ? undefined : motionSpringConfig}
            hasFinishedOpening={hasFinishedOpening}
          />
        ) : null}
      </View>
    </View>
  );
}

/** the equity axis's own fixed `[0, 100]` domain — its two end labels never
 * change, unlike the combos axis's own upper bound. */
const EQUITY_AXIS_START_LABEL = '0';
const EQUITY_AXIS_END_LABEL = '100';
/** the combos axis's own start is always `0`; its end is `combosAxisMax`,
 * computed fresh per render below. */
const COMBOS_AXIS_START_LABEL = '0';

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  canvas: {
    width: '100%',
    height: CHART_HEIGHT,
  },
});
