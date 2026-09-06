import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFont } from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { WithTimingConfig } from 'react-native-reanimated';

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
  totalEquityBinCounts,
  type StrengthBand,
} from '../../model/strength-band';
import { reportError } from '@/core/instrumentation/report-error';

import { BarChart } from './bar-chart';
import { computePlotArea, type BarChartFrame, type PlotArea } from './geometry';

/** the "no result" input `equities`/`bands` fold when either is `null` —
 * an empty pair list, which `bandEquityBinCounts`/`totalEquityBinCounts`
 * already resolve to every bin at zero under every band. Folding this
 * through the same `totalEquityBinCounts`/`foldEquityBins`/
 * `combosAxisUpperBound` pipeline every real result goes through, rather
 * than special-casing the derived values, is what keeps this one small
 * pair of arrays the only place "no data" is decided — everything
 * downstream (`combosAxisMax`, the accessibility label) falls out of it the
 * same way it would for a real, merely-empty result. */
const NO_RESULT_EQUITIES: readonly number[] = [];
const NO_RESULT_BANDS: readonly StrengthBand[] = [];

/** the bars `BarChart` draws while `isCalculating` is `true` — none at all,
 * the same empty axis frame the practically-unreachable "no result" case
 * above draws, but reached directly rather than by folding
 * `NO_RESULT_EQUITIES`/`NO_RESULT_BANDS` through the bucket/fold/majority
 * pipeline: that pipeline is skipped outright while calculating (this
 * component's own doc comment), not merely fed an empty input. */
const NO_BARS: readonly { readonly value: number; readonly color: string }[] = [];

/** the colour an empty bin's own bar takes — never actually visible, since
 * `majorityBandsPerBin` only resolves `null` for a bin no band holds any
 * card pair in, and that same bin's own `totalEquityBinCounts` total is
 * always `0` too (both fold the exact same `bandEquityBinCounts` output, so
 * neither can disagree about which bin a live card pair landed in), so the
 * bar this colour would paint is drawn at zero height regardless of which
 * colour it is handed. Picked as a fixed, arbitrary band rather than left
 * `undefined` so `bandColor` never needs a `null` case of its own. */
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
 * equity-analysis.md): the acting player's own real per-card-pair
 * `equities`/`bands` props — read, by the sheet, out of
 * `EspadaEquityPlayerResult.equities`/`strengths`
 * (`@/modules/espada-engine/index`), filled only at settlement — see
 * `isCalculating`'s own doc comment below for the loading state a progress
 * tick draws instead — bucketed into equity bins and folded to
 * whatever bar count this component's own measured drawing width supports
 * (`../../model/equity-breakdown.ts`), drawn through `./bar-chart.tsx` — a
 * bar-chart primitive with no knowledge of poker or equity, hand-rolled
 * directly on `@shopify/react-native-skia` canvas primitives and
 * `react-native-reanimated` shared values.
 *
 * **both a bar's own height and its own colour come from the identical
 * `bandEquityBinCounts` output** (`../../model/strength-band.ts`) — never
 * from two differently-encoded sources — so no live card pair can ever
 * count toward one bar's own height while its classified band paints a
 * different bar. `totalEquityBinCounts` sums that same per-band output
 * across all four bands for the height; `majorityBandsPerBin` resolves it
 * to one band per bar for the colour.
 *
 * **`equities`/`bands` are `null` only in the practically-unreachable case
 * `../equity-breakdown-sheet/equity-breakdown-sheet.tsx` already documents
 * for its own header** — the acting player removed, or a new calculation
 * restarted, while this sheet somehow stays open. That case folds
 * `NO_RESULT_EQUITIES`/`NO_RESULT_BANDS` (no live card pairs at all)
 * through the exact same pipeline a real result goes through, rather than
 * a second code path: every drawn bar's own value is `0`, so nothing is
 * drawn, without this component needing to special-case "no bars"
 * separately from "bars that happen to be short."
 *
 * **`isCalculating` is a third, distinct signal from either of those, and is
 * what this component actually gates the loading treatment on (issue
 * #294).** While the acting player's evaluation is still running, the
 * sheet stops deriving `equities`/`bands` from the live per-card-pair
 * buffers at all — a progress tick's own `equities`/`strengths` buffers now
 * carry every slot at the `NaN` sentinel throughout the run (see
 * `docs/decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md`),
 * indistinguishable by content alone from the practically-unreachable
 * "no result" case above, so a reader cannot tell the two apart from
 * `equities`/`bands` being empty or `null`. `isCalculating` is that
 * distinguishing signal, read by the sheet from the evaluation's own
 * running/settled status rather than from either buffer's own content.
 * `true` skips the whole `bandEquityBinCounts`/`foldEquityBins`/
 * `majorityBandsPerBin`/`combosAxisUpperBound` derivation below outright —
 * not merely hiding its output — and renders the histogram's own empty
 * axis frame (via `BarChart` with zero bars, exactly as the "no result"
 * case already draws), the `combos` axis with no numeric end label (see
 * `combosAxisMax`'s own doc comment below), and a breathing `Calculating`
 * caption centred in the plot area instead of any bars.
 *
 * **all the real logic lives in plain, unit-tested modules** —
 * `../../model/equity-breakdown.ts`'s `chooseBarCount`/`foldEquityBins`,
 * `../../model/strength-band.ts`'s `bandEquityBinCounts`/
 * `totalEquityBinCounts`/`majorityBandsPerBin`, and
 * `../../model/band-color.ts`'s `bandColor` — because Skia and Reanimated
 * are not exercisable under this project's Jest setup
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
 * player's own live per-card-pair equities and their already-classified
 * bands (`../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
 * `../../model/strength-band.ts` call, not repeated here), bucketed by
 * `../../model/strength-band.ts`'s `bandEquityBinCounts` into the same
 * 20 equity bins its own bar-height total (`totalEquityBinCounts`) is
 * already binned into, then folded to whichever bar count this component
 * resolved to and resolved to one majority band per bar by
 * `majorityBandsPerBin` — a tie between two bands within one bin settled
 * there in favour of the stronger band. `bandColor`
 * (`../../model/band-color.ts`) is the one place that resolved band becomes
 * an actual colour string, read off `theme.bands`
 * (`../../../../core/theme/tokens.ts`); `bars` below pairs each folded
 * count with that single colour, one entry per bar — `BarChart` draws each
 * bar as its own flat-coloured rectangle, never a gradient within one. An
 * empty bin (no live card pair under any band) resolves to `null` and
 * falls back to `EMPTY_BIN_FALLBACK_BAND` above, a colour nothing ever
 * actually shows: that same bin's own folded height total is always `0`
 * too, so its bar is drawn at zero height regardless of which colour it is
 * handed.
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
 * below is computed directly from the real, current `equities`/`bands` on
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
  equities,
  bands,
  isCalculating,
  hasFinishedOpening,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** this player's own live card pairs' own equities, in the same order as
   * `bands` below — read out of `EspadaEquityPlayerResult.equities`
   * (`@/modules/espada-engine/index`) by
   * `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`, this prop's
   * only source, which owns which player this chart is currently open
   * for; `null` when no result is currently available for that player
   * (see this component's own doc comment). Paired with `bands` rather
   * than carried as full `EspadaEquityCardPairResult` entries: this
   * component only ever needs a pair's own equity (to bucket it into an
   * equity bin) and its already-classified band, never `cardA`/`cardB`. */
  equities: readonly number[] | null;
  /** this same player's own live card pairs' own strength bands, already
   * classified by `../../model/strength-band.ts` — this component's own
   * job is only to bucket them by `equities` above into bins and resolve
   * each bar's own height and majority colour, never to classify a card
   * pair itself (that stays `../equity-breakdown-sheet/
   * equity-breakdown-sheet.tsx`'s own job, the same "the sheet computes it
   * once, the chart only folds it for rendering" split this component
   * already keeps for `equities` itself). `null` exactly when `equities`
   * is `null`. */
  bands: readonly StrengthBand[] | null;
  /** whether the acting player's evaluation is still running — read by
   * `../equity-breakdown-sheet/equity-breakdown-sheet.tsx` off
   * `../../adapter/use-equity-evaluation.ts`'s own
   * `useEquityEvaluationStatus()`, not off whether `equities`/`bands` above
   * are empty (see this component's own doc comment for why that
   * distinction matters now). `true` renders the loading treatment — the
   * empty axis frame, no numeric `combos` end label, and the breathing
   * caption — regardless of what `equities`/`bands` happen to carry. */
  isCalculating: boolean;
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

  // `CalculatingCaption`'s own status word and supporting line — read here,
  // not inside `StyleSheet.create` below, since `theme` is only reachable
  // through this component's own `useUnistyles()` call (a module-scope
  // `StyleSheet.create` needs the themed-function form to read it at all,
  // which nothing else in this file's own static styles below needs).
  // `caption`/`description` (`../../../../core/theme/tokens.ts`'s
  // `typography`) are this project's own literal names for a short status
  // word over a supporting line — the same pairing this loading state's
  // own copy keys (`calculatingLabel`/`calculatingDescription`) already
  // name.
  const calculatingLabelTypography = theme.typography.caption;
  const calculatingDescriptionTypography = theme.typography.description;
  const calculatingLabelColor = theme.colors.text.neutral.high;

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
  // hands this component that player's own real `equities`/`bands` rather
  // than this component reading or classifying them itself — so `width`,
  // those two (each read directly, with no lag of its own kind — see this
  // component's own doc comment on why the entrance no longer needs one),
  // and the four band anchors above are the only inputs this whole
  // derivation actually reads.
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
  // for a reason that changes neither `width`, `equities`/`bands`, nor the
  // theme — its parent sheet re-rendering because a state change elsewhere
  // in `../analyze-screen/analyze-screen.tsx` re-rendered the tree, such as
  // the list scrolling behind an open sheet — rather than calling
  // `bandEquityBinCounts`, `totalEquityBinCounts`, `foldEquityBins`,
  // `majorityBandsPerBin`, and `combosAxisUpperBound` again on every such
  // render. `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
  // `useMemo` calls are what keep `equities`/`bands` themselves
  // referentially stable across a re-render that changes neither this
  // player's own result nor the calculation's own player count/street.
  const { barCount, bars, combosAxisMax } = useMemo(() => {
    // `width` is the canvas's border box — wider than the strip the bars
    // are drawn in, by both the bounding rule and the combos axis's own
    // label gutter — and the count is chosen from it as measured, so the
    // widest supported phone keeps a point of headroom above the 20-bar
    // threshold instead of falling below it. See this component's own doc
    // comment; do not subtract either here.
    const barCount =
      width > 0 ? chooseBarCount(width) : EQUITY_BIN_COUNTS[EQUITY_BIN_COUNTS.length - 1];

    if (isCalculating) {
      // skips the whole bucket/fold/majority/upper-bound derivation below
      // outright, not merely hiding its output — this component's own doc
      // comment above explains why `equities`/`bands` cannot be trusted to
      // fall back to the "no result" case on their own while a calculation
      // is running (both buffers now carry the same all-`NaN` sentinel a
      // progress tick always does). `combosAxisMax` stays `undefined` rather
      // than `0` so the render below can tell "no data yet" apart from "an
      // axis that legitimately tops out at zero" and omit the numeric label
      // entirely instead of drawing a `0`.
      return { barCount, bars: NO_BARS, combosAxisMax: undefined };
    }

    // `equities`/`bands` are `null` in exactly the practically-unreachable
    // "no result" case this component's own doc comment names — bucketing
    // the empty `NO_RESULT_EQUITIES`/`NO_RESULT_BANDS` pair resolves every
    // bin's own majority to `null` and every bin's own height total to `0`,
    // drawing no bars, without a second "no data" branch below this line.
    const binCountsByBand = bandEquityBinCounts(
      equities ?? NO_RESULT_EQUITIES,
      bands ?? NO_RESULT_BANDS,
    );
    // the bar-height totals and the majority colours below both fold this
    // same `binCountsByBand` — never a separately-encoded distribution —
    // which is what keeps a live card pair from ever counting toward one
    // bar's own height while its classified band paints a different bar.
    const counts = foldEquityBins(totalEquityBinCounts(binCountsByBand), barCount);
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
    // `width`, `equities`, `bands`, `isCalculating`, and the four anchor
    // strings are the only reactive values this callback reads —
    // `chooseBarCount`, `bandEquityBinCounts`, `totalEquityBinCounts`,
    // `foldEquityBins`, `majorityBandsPerBin`, `bandColor`, and
    // `combosAxisUpperBound` are module-level pure functions, not values a
    // dependency array needs to name.
  }, [width, equities, bands, isCalculating, trashColor, marginalColor, valueColor, nutsColor]);

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

  // while calculating, none of `barCount`/`combosAxisMax`/the four band
  // phrases above name anything real yet — `combosAxisMax` itself is
  // `undefined` in this branch (above) — so this reads a dedicated key
  // instead of interpolating those into the settled label's own template.
  // See that key's own comment (`src/core/i18n/resources/en.ts`) for why it
  // is a separate key rather than composed here from `calculatingLabel`/
  // `calculatingDescription`.
  const accessibilityLabel = isCalculating
    ? t('equityBreakdown.chart.calculatingAccessibilityLabel')
    : t('equityBreakdown.chart.accessibilityLabel', {
        count: barCount,
        max: combosAxisMax,
        trash: trashBandPhrase,
        marginal: marginalBandPhrase,
        value: valueBandPhrase,
        nuts: nutsBandPhrase,
      });

  // hoisted out of the `BarChart` call below so `plotArea` (next) can share
  // it — `./bar-chart.tsx` recomputes the identical object internally from
  // this same `frame` prop, so this is not a second, differently-configured
  // frame, only the one call site this component already had.
  const frame: BarChartFrame = {
    color: axisRuleColor,
    // all four sides, deliberately — see `./bar-chart.tsx`'s own doc
    // comment: an omitted side is this component's own decision, drawn as
    // `0`, never left undefined. The top and right edges stay open, since a
    // full box would read as a frame around the chart rather than as two
    // axes.
    top: 0,
    right: 0,
    bottom: axisRuleWidth,
    left: axisRuleWidth,
  };

  // the same rectangle `./bar-chart.tsx`'s own `BarChart` computes
  // internally to lay out its bars — recomputed here, via the identical
  // pure `computePlotArea` (`./geometry.ts`), only so `CalculatingCaption`
  // below can centre itself inside it without this component reaching into
  // `BarChart`'s own internals. `null` until `axisFont` is loaded, the same
  // gate the render guard below already applies to `BarChart` itself, since
  // `SkFont.getSize()`/`measureText` need a loaded font to call at all.
  // `yAxisLabelWidth` mirrors `./bar-chart.tsx`'s own computation for
  // `yAxis.endLabel === undefined` (this component's own loading `yAxis`
  // below always omits it) — the combos axis's `0` start label alone.
  const plotArea: PlotArea | null = axisFont
    ? computePlotArea({
        width,
        height: CHART_HEIGHT,
        lineHeight: axisFont.getSize(),
        yAxisLabelWidth: axisFont.measureText(COMBOS_AXIS_START_LABEL).width,
        frame,
      })
    : null;

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
            valueAxisUpperBound={combosAxisMax ?? 0}
            width={width}
            height={CHART_HEIGHT}
            font={axisFont}
            labelColor={axisLabelColor}
            frame={frame}
            xAxis={{
              startLabel: EQUITY_AXIS_START_LABEL,
              endLabel: EQUITY_AXIS_END_LABEL,
              title: equityAxisName,
            }}
            yAxis={{
              startLabel: COMBOS_AXIS_START_LABEL,
              // omitted while calculating — `combosAxisMax` has nothing to
              // report yet (this component's own doc comment); `./bar-chart.tsx`
              // draws no `<Text>` for it at all in that case, rather than a
              // stale or invented number.
              endLabel: isCalculating ? undefined : String(combosAxisMax),
              title: combosAxisName,
            }}
            springConfig={prefersReducedMotion ? undefined : motionSpringConfig}
            hasFinishedOpening={hasFinishedOpening}
          />
        ) : null}
        {isCalculating && plotArea ? (
          <CalculatingCaption
            plotArea={plotArea}
            label={t('equityBreakdown.chart.calculatingLabel')}
            description={t('equityBreakdown.chart.calculatingDescription')}
            labelStyle={[calculatingLabelTypography, { color: calculatingLabelColor }]}
            descriptionStyle={[calculatingDescriptionTypography, { color: axisLabelColor }]}
            testID={testID}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * the loading treatment's own caption (issue #294): a breathing status word
 * ("Calculating") over a static supporting line, centred in the same plot
 * area `BarChart` would otherwise draw bars inside. Positioned with
 * `plotArea` — `./geometry.ts`'s own `computePlotArea`, the identical pure
 * function `./bar-chart.tsx` uses internally, computed once by this file's
 * own `EquityBreakdownChart` and handed down rather than recomputed here —
 * so this caption and the empty axis frame it sits over always agree on
 * where the plot actually is.
 *
 * rendered as a plain `Text`/`Animated.Text` sibling of the Skia `Canvas`,
 * absolutely positioned over it via `plotArea`'s own pixel rectangle
 * (`styles.calculatingCaption` below), not drawn by Skia itself: this
 * project's own text rendering, dynamic type, and screen-reader affordances
 * all come free this way, and neither `BarChart` nor `./bar-chart.tsx` needs
 * to learn what "calculating" means. `pointerEvents="none"`, since this
 * caption sits over the canvas only to be read, never to be touched.
 *
 * **the breathing loop mirrors `../new-player-fab/new-player-fab.tsx`'s own
 * resting glow** — this app's only other continuous, non-reduced-motion
 * loop — rather than reusing `@/core/motion/tokens.ts`'s one-shot
 * `motionSpring`/`motionColor`/`motionSize` helpers, none of which fit a
 * perpetual loop with no single collapse target
 * (`docs/conventions/motion.md`). `captionPhase`, a Reanimated shared value
 * looping between `0` and `1` (`withRepeat(withTiming(1,
 * CALCULATING_CAPTION_TIMING_CONFIG), -1, true)`,
 * `CALCULATING_CAPTION_BREATH_HALF_CYCLE_MS` each direction, eased with
 * `Easing.inOut(Easing.sin)`), drives the status word's own opacity between
 * `CALCULATING_CAPTION_DIM_OPACITY` and `1` — the supporting line stays at a
 * constant opacity throughout, since only the status word breathes.
 * `usePrefersReducedMotion()` freezes `captionPhase` at `1` instead of
 * running the loop — the status word stays visible at full opacity, never
 * dimmed, but perfectly still — the same reduced-motion shape the glow above
 * already takes, and for the same reason: a caption that never disappears
 * needs no single collapse target, only a still one. The opacity floor, the
 * loop's duration, and its easing curve are this change's own pick for a
 * soft, unhurried breathe, not a design-file measurement.
 */
function CalculatingCaption({
  plotArea,
  label,
  description,
  labelStyle,
  descriptionStyle,
  testID,
}: {
  readonly plotArea: PlotArea;
  readonly label: string;
  readonly description: string;
  /** the status word's own typography and colour, resolved by
   * `EquityBreakdownChart` off `theme` — kept out of this component's own
   * `StyleSheet.create` block, which has no themed access of its own (this
   * file's own comment on `calculatingLabelTypography` above). */
  readonly labelStyle: ComponentProps<typeof Animated.Text>['style'];
  /** the supporting line's own typography and colour, resolved the same
   * way. */
  readonly descriptionStyle: ComponentProps<typeof Text>['style'];
  /** `EquityBreakdownChart`'s own `testID` prop, threaded through only to
   * name this caption's two lines for a test — `calculating-label`/
   * `calculating-description` — the same "only present when the caller
   * opted into testIDs at all" convention every other optional `testID`
   * on this component's own tree already follows (`canvas`, above). */
  readonly testID?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const captionPhase = useSharedValue(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      cancelAnimation(captionPhase);
      captionPhase.value = 1;
      return;
    }
    captionPhase.value = 0;
    captionPhase.value = withRepeat(withTiming(1, CALCULATING_CAPTION_TIMING_CONFIG), -1, true);
    return () => {
      cancelAnimation(captionPhase);
    };
  }, [prefersReducedMotion, captionPhase]);

  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity:
      CALCULATING_CAPTION_DIM_OPACITY + captionPhase.value * (1 - CALCULATING_CAPTION_DIM_OPACITY),
  }));

  return (
    <View
      style={[
        styles.calculatingCaption,
        {
          left: plotArea.left,
          top: plotArea.top,
          width: plotArea.right - plotArea.left,
          height: plotArea.bottom - plotArea.top,
        },
      ]}
      pointerEvents="none"
    >
      <Animated.Text
        style={[labelStyle, animatedLabelStyle]}
        testID={testID ? 'calculating-label' : undefined}
      >
        {label}
      </Animated.Text>
      <Text
        style={[styles.calculatingDescription, descriptionStyle]}
        testID={testID ? 'calculating-description' : undefined}
      >
        {description}
      </Text>
    </View>
  );
}

// this app's only other continuous, non-reduced-motion loop
// (`../new-player-fab/new-player-fab.tsx`'s own resting glow) names its
// half-cycle duration and timing config the same way — see
// `CalculatingCaption`'s own doc comment above for why this caption mirrors
// that pattern instead of `@/core/motion/tokens.ts`'s one-shot helpers.
const CALCULATING_CAPTION_BREATH_HALF_CYCLE_MS = 1400;
const CALCULATING_CAPTION_TIMING_CONFIG: WithTimingConfig = {
  duration: CALCULATING_CAPTION_BREATH_HALF_CYCLE_MS,
  easing: Easing.inOut(Easing.sin),
};
/** the status word's own dimmest opacity — the brighter end of the breathe
 * is always `1`, never a second constant of its own. */
const CALCULATING_CAPTION_DIM_OPACITY = 0.4;

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
    // `CalculatingCaption` positions itself with plain pixel `left`/`top`
    // (`plotArea`, above) against this container's own box — `relative` is
    // what makes that an absolute position within it rather than within the
    // sheet's own further-out ancestor.
    position: 'relative',
  },
  calculatingCaption: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  calculatingDescription: {
    textAlign: 'center',
  },
});
