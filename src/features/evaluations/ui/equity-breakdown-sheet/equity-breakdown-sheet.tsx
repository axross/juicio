import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { handRangeCardPairCount } from '@/shared/model/hand-range';
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from '@/shared/ui/bottom-sheet/bottom-sheet';

import {
  useEquityResultPlayerIds,
  usePlayerEquityResult,
  useEquityEvaluationStatus,
} from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import {
  classifyCardPairBands,
  countStrengthBands,
  liveCardPairsFromBuffers,
  type LiveCardPair,
} from '../../model/strength-band';
import { EquityBreakdownBlockerScore } from '../equity-breakdown-blocker-score/equity-breakdown-blocker-score';
import { EquityBreakdownChart } from '../equity-breakdown-chart/equity-breakdown-chart';
import { EquityBreakdownRankPairs } from '../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs';
import { PlayerRowContent } from '../player-row-content/player-row-content';

/** stands in for this player's own live card pairs while no result exists
 * yet — a fixed empty array, not a fresh `[]` literal at every read, so
 * `livePairs` stays referentially stable across a render this player's own
 * result did not change, and the `useMemo` calls below (`bands`/
 * `equities`) genuinely reuse their previous output rather than
 * recomputing over an indistinguishable-but-new empty array every time. */
const EMPTY_LIVE_PAIRS: readonly LiveCardPair[] = [];

/** the same referential-stability reason `EMPTY_LIVE_PAIRS` above exists
 * for, for `opponentNumbers` below (issue #293) — reused while `player` is
 * `null`, ahead of this component's own early return. */
const EMPTY_OPPONENT_NUMBERS: readonly number[] = [];

/** stands in for `result.equities`/`result.blockerScores` while no result
 * exists yet (issue #293) — `../equity-breakdown-blocker-score/
 * equity-breakdown-blocker-score.tsx` reads its own "not yet settled"
 * signal from `blockerScores.byteLength === 0` alone
 * (`isBlockerScoreSettled`), which this empty stand-in already satisfies
 * without that component ever needing to read `equities` in that case. */
const EMPTY_BUFFER: ArrayBuffer = new ArrayBuffer(0);

/** each legend item's own `countLabel` for as long as `isCalculating` is
 * `true` (issue #294) — an en dash rather than a formatted `0 combos`,
 * since a `0` would read as "no card pair falls in this band," a settled
 * fact this sheet has no basis for yet while the calculation is still
 * running. Plain, untranslated punctuation: `LegendItem`'s own accessible
 * label already reads `"<label>: <countLabel>"`, and a screen reader
 * announcing this en dash there is no worse than announcing the loading
 * chart's own dedicated `equityBreakdown.chart.calculatingAccessibilityLabel`
 * — the legend has no separate "calculating" wording of its own to reuse. */
const LOADING_COUNT_LABEL = '–';

/**
 * the Equity Breakdown bottom sheet (docs/specs/equity-analysis.md):
 * reached from a hand-range row's own detail press
 * (`../player-row/player-row.tsx`'s `onBreakdownRequested`), composing the
 * shared `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx` the board
 * and holding sheets already compose. Holds no store reference and reports
 * nothing back but its own dismissal — `player` is a plain prop, and
 * dismissing this sheet changes no player, the same "reports only its own
 * dismissal" shape `../board-input-sheet/board-input-sheet.tsx` follows
 * for its own no-outcome-callback case, taken one step further here since
 * this sheet submits nothing at all.
 *
 * **its header repeats the list row unchanged — option B, the design of
 * record.** `../player-row-content/player-row-content.tsx` is the same
 * component `../player-row/player-row.tsx` composes for the row itself:
 * the same 96pt height, the same 64×64 preview, and a bare result figure.
 * The one thing it does not repeat is the row's chevron column
 * (`chevron="omitted"`, against the list's own `'shown'`/`'reserved'`):
 * the list reserves that column so a hole-cards row's result figure lands
 * on the same vertical line as a hand-range row's, and this header renders
 * one player with no second row to align with — reserving it here would
 * only push the result figure a column's width in from the row's own
 * trailing padding. Neither
 * `onPreviewPress` nor `onDetailPress` is passed, so both regions render
 * as plain, non-interactive `View`s: this header opens nothing and cannot
 * be pressed.
 *
 * **the header's own accessible group carries the announcement, not
 * `PlayerRowContent` itself** — that shared component owns no
 * accessibility grouping of its own (see its own doc comment), so this
 * sheet wraps it in one `View` that announces the player it is about and
 * is explicitly **not** a button (no `accessibilityRole` at all), even
 * though option B makes this header look identical to a row that is one —
 * the difference has to be carried in the announcement, since nothing
 * about how it looks still tells the two apart.
 *
 * **holds no state of its own for which player it is open for** — that is
 * `../analyze-screen/analyze-screen.tsx`'s own state, in the same shape it
 * already owns which board slot opened the board sheet
 * (`boardSheetSlot`). `player` is `null` while `visible` is `false`
 * (nothing to show), and this component renders no header or chart at all
 * in that case — `BottomSheet` itself stays mounted regardless (see its
 * own doc comment on why), so this is never actually reached with
 * `visible` true and `player` null in practice, but the type still makes
 * that combination something this component decides rather than crashes
 * on.
 *
 * **its header rides `BottomSheet`'s own `<BottomSheetHeader>` slot; the
 * heading, legend, histogram, and — for a hand-range player, this sheet's
 * only case — the Rank Pair list all sit inside `<BottomSheetBody>`,**
 * `BottomSheet`'s own compound-child contract (that component's own doc
 * comment). `../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs.tsx`
 * enumerates the player's own range itself; this sheet only decides where
 * it sits (after the histogram) and hands it the range to draw.
 */
export function EquityBreakdownSheet({
  visible,
  player,
  players,
  isPreflop,
  onRequestClose,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /** the player this sheet is showing the breakdown for — `null` while
   * `visible` is `false`. */
  player: Player | null;
  /** every seated player, in seat order — `../analyze-screen/
   * analyze-screen.tsx`'s own live players list, the same one `player`
   * above is drawn from, read explicitly from the caller rather than this
   * sheet reaching into `usePlayersStore` (`../../adapter/use-players.ts`)
   * itself, the same "the caller supplies the situation, this sheet only
   * classifies against it" split `player` already follows.
   *
   * replaced this sheet's own former `playerCount: number` prop (issue
   * #293): `playerCount` alone gave Rule R1's classification below its
   * `fair = 1/N` denominator, but `../equity-breakdown-blocker-score/
   * equity-breakdown-blocker-score.tsx` needs each opponent's own seat
   * position and `Player.number` too, to compute `opponentNumbers` below
   * and to letter its own column headers `Player 2`/`Player 3` — the fuller
   * list a caller already holds anyway, rather than a second prop carrying
   * only `players.length` alongside it. `playerCount` below is now derived,
   * never a second source of truth for the same count. */
  players: readonly Player[];
  /** whether the current board has no cards yet — Rule R1's preflop
   * variant classifies from equity alone once this is `true`, since current
   * strength has no board to be ahead on
   * (`EspadaEquityCardPairResult.strength`'s own doc comment). Read
   * explicitly from the caller for the same reason `playerCount` above is:
   * `../analyze-screen/analyze-screen.tsx` already holds the live board. */
  isPreflop: boolean;
  /** fires once this sheet's dismissal commits — handle tap, drag past
   * the threshold, or backdrop tap, exactly as `BottomSheet`'s own
   * `onRequestClose` already does. This sheet changes nothing of its
   * own; it is named for the mechanism, not an outcome, for the same
   * reason `BottomSheet`'s own `onRequestClose` is. */
  onRequestClose: () => void;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tHandRanges } = useTranslation('handRanges');
  // called unconditionally, ahead of the early return below, per the Rules
  // of Hooks — `''` is never a real player id (`../../model/player.ts`'s
  // own `createPlayerId`), so this reads as "no result" and is simply
  // unused whenever `player` is `null`. this header repeats
  // the row it was opened from unchanged (this sheet's own doc comment,
  // "option B, the design of record") — including that row's own real
  // result, once one exists. that result can already be live and still
  // updating, mid-calculation, exactly like the row's own — this component
  // reads nothing about which case it is, the same as `../player-row/
  // player-row.tsx`.
  const result = usePlayerEquityResult(player?.id ?? '');

  // authoritative for "is the acting player's own evaluation still running"
  // — this store drives exactly one job across every current player at
  // once, never one job per player (`../../adapter/use-equity-evaluation.ts`'s
  // own doc comment), so this run-level status is exactly as specific as a
  // per-player one would be. Read off status rather than off `result`'s own
  // buffer contents: a progress tick's own `equities`/`strengths` now carry
  // every slot at the `NaN` sentinel throughout the run (issue #294, see
  // `docs/decisions/2026-09-06-stop-filling-per-card-pair-equity-and-strength-buffers-on-progress-ticks.md`),
  // indistinguishable, by content alone, from the practically-unreachable
  // "no result" case below — `status` is the one signal that still tells
  // the two apart.
  const isCalculating = useEquityEvaluationStatus() === 'calculating';

  // `playerCount`, derived rather than a second prop of its own — see this
  // component's own `players` doc comment above.
  const playerCount = players.length;
  // this player's own result's frozen seat-order snapshot — see
  // `../../adapter/use-equity-evaluation.ts`'s own `resultPlayerIds` doc
  // comment. Read unconditionally, ahead of the early return below, for the
  // same Rules-of-Hooks reason `result` above is.
  const resultPlayerIds = useEquityResultPlayerIds();
  // every opponent's own `Player.number`, in `blockerScores`' own
  // opponent-ordinal order — `../equity-breakdown-blocker-score/
  // equity-breakdown-blocker-score.tsx`'s own `opponentNumbers` doc comment
  // states: position `i` here must be opponent ordinal `i`.
  //
  // **derived from `resultPlayerIds` (the frozen seat order the current
  // result was actually computed against), never from the live `players`
  // prop** (issue #293 fix round 4) — `players` can reorder out from under
  // an already-running or already-settled result, since
  // `equitySituationKey` (`../../model/equity-request.ts`) deliberately
  // treats a reorder alone as a no-op that never restarts the job that
  // laid `blockerScores`' own buffer out against the *previous* seat
  // order. Reading live `players` here would silently relabel one
  // opponent's own figures as another's the moment a reorder and a
  // Blocker Score read land in either order — the exact defect this
  // fix round's own regression test (`equity-breakdown-sheet.test.tsx`)
  // exercises. Each id in the frozen order is looked up against the
  // *live* `players` list only for its own `number` — a player's `number`
  // never changes once assigned (`../../model/player.ts`'s own doc
  // comment), reorder included, so this lookup can never disagree with
  // what a fresher snapshot would have reported; `.filter` below drops an
  // id no longer present in `players` at all (a player removed since this
  // result was captured — `equitySituationKey` does restart the job for
  // that, so a stale id here is transient, cleared the moment that
  // restart's own fresh snapshot lands).
  //
  // **degrades to the live `players`-derived order while no snapshot
  // exists yet** (`resultPlayerIds` empty — no evaluation has ever
  // produced a result for the current situation): there is no frozen
  // buffer order yet to disagree with, so the live order is exactly
  // correct here, and every existing caller that renders this sheet ahead
  // of a first result (this component's own pre-settlement skeleton rows)
  // keeps seeing accurate column headers rather than an empty list.
  const opponentNumbers = useMemo(() => {
    if (player === null) {
      return EMPTY_OPPONENT_NUMBERS;
    }
    if (resultPlayerIds.length === 0) {
      return players
        .filter((candidate) => candidate.id !== player.id)
        .map((candidate) => candidate.number);
    }
    const numberById = new Map(players.map((candidate) => [candidate.id, candidate.number]));
    return resultPlayerIds
      .filter((id) => id !== player.id)
      .map((id) => numberById.get(id))
      .filter((number): number is number => number !== undefined);
  }, [resultPlayerIds, players, player]);

  // this player's own live card pairs, read directly out of `result.equities`/
  // `result.strengths` (`../../model/strength-band.ts`'s
  // `liveCardPairsFromBuffers`) — filled only at settlement now (see
  // `isCalculating`'s own comment above); `EMPTY_LIVE_PAIRS` both while no
  // result exists yet and, now, for as long as `isCalculating` is `true`,
  // the same "nothing to bucket yet" degrade `resultLabel` below already
  // applies for "no result." Memoized on `result` and `isCalculating`, not
  // recomputed on every render, so a render that changed neither reuses the
  // same array reference — `result` itself is this player's own store slot
  // (`../../adapter/use-equity-evaluation.ts`'s `usePlayerEquityResult`),
  // stable across a re-render nothing about this player changed. Called
  // unconditionally, ahead of the early return below, for the same
  // Rules-of-Hooks reason `result` above is.
  const livePairs = useMemo(
    () =>
      result === null || isCalculating
        ? EMPTY_LIVE_PAIRS
        : liveCardPairsFromBuffers(result.equities, result.strengths),
    [result, isCalculating],
  );
  // classifies every one of `livePairs` into its own strength band
  // (`../../model/strength-band.ts`'s Rule R1) — memoized on `livePairs`,
  // `playerCount`, and `isPreflop` rather than recomputed on every render,
  // since `../equity-breakdown-chart/equity-breakdown-chart.tsx`'s own
  // `useMemo` depends on this array's own reference staying stable across a
  // render that changed none of the three.
  const bands = useMemo(
    () => classifyCardPairBands(livePairs, playerCount, isPreflop),
    [livePairs, playerCount, isPreflop],
  );
  // the four band counts the legend below shows beside each label — always
  // sums to `livePairs.length`, the player's own live card-pair count, per
  // this sheet's own acceptance criteria.
  const bandCounts = useMemo(() => countStrengthBands(bands), [bands]);
  // `bands`' own equities, parallel and in the same order — what
  // `EquityBreakdownChart` below buckets by equity bin to resolve each
  // bar's own height and majority band; the chart itself never reads a
  // full `LiveCardPair`, only this pairing (see that component's own doc
  // comment).
  const equities = useMemo(() => livePairs.map((pair) => pair.equity), [livePairs]);

  // tracks the bottom sheet's own "visually finished opening" signal
  // (`../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s `onOpened`,
  // issue #228) — `false` until this sheet's own entrance has visually
  // landed, then handed to `EquityBreakdownChart` below as
  // `hasFinishedOpening` so its own chart holds its growth animation at
  // zero rather than racing the sheet's own slide-up.
  const [hasFinishedOpening, setHasFinishedOpening] = useState(false);
  const handleOpened = useCallback(() => setHasFinishedOpening(true), []);

  // resets `hasFinishedOpening` back to `false` the moment `visible` turns
  // `false`, so a later reopen waits for its own opening transition again
  // rather than finding a stale `true` left over from the last time this
  // sheet was open — React's own "adjust state when a prop changes"
  // pattern (comparing against the previous render's own value), not a
  // `useEffect`: this reset has nowhere outside React it needs to reach, so
  // an effect would only add a second, avoidable commit on top of the one
  // this render already pays for.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setHasFinishedOpening(false);
    }
  }

  if (player === null) {
    return (
      <BottomSheet
        visible={visible}
        onRequestClose={onRequestClose}
        handleAccessibilityLabel={t('equityBreakdown.handle.accessibilityLabel')}
        accessibilityLabel={t('equityBreakdown.sheet.accessibilityLabel')}
        testID={testID}
        style={style}
        {...props}
      >
        <BottomSheetBody testID={testID ? 'body' : undefined} />
      </BottomSheet>
    );
  }

  // `player.holding` is always a hand range here — only a hand-range
  // row's own `onBreakdownRequested` ever opens this sheet
  // (`../player-row/player-row.tsx`); a hole-cards player has no
  // distribution to break down.
  const combos =
    player.holding.kind === 'handRange'
      ? tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) })
      : '';
  const label = t('playerRow.title', { number: player.number });
  // this sheet is only ever reachable from a hand-range row's own detail
  // press, which itself only exists once that row has any result —
  // including one still updating mid-calculation, not
  // only a settled one (`../player-row/player-row.tsx`'s own
  // `onDetailPress` gating) — so `result` is `null` here only in the
  // practically-unreachable case where a player is deleted, or evaluation
  // restarts, while this sheet somehow stays open; `resultLabel`/
  // `resultPhrase` degrade to the same "no result" presentation the row
  // itself would, rather than assuming this case can't happen.
  const resultLabel =
    result === null
      ? null
      : t('playerRow.resultPercentage', { percent: (result.equity * 100).toFixed(2) });
  const resultPhrase = resultLabel ?? t('playerRow.resultUnavailableLabel');
  const headerAccessibilityLabel = t('equityBreakdown.headerAccessibilityLabel', {
    number: player.number,
    combos,
    result: resultPhrase,
  });

  const header = (
    <View
      accessible
      accessibilityLabel={headerAccessibilityLabel}
      testID={testID ? 'header-row' : undefined}
    >
      <PlayerRowContent
        player={player}
        label={label}
        subtitle={combos}
        resultLabel={resultLabel}
        chevron="omitted"
        testID={testID}
      />
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={onRequestClose}
      onOpened={handleOpened}
      handleAccessibilityLabel={t('equityBreakdown.handle.accessibilityLabel')}
      accessibilityLabel={t('equityBreakdown.sheet.accessibilityLabel')}
      testID={testID}
      style={style}
      {...props}
    >
      <BottomSheetHeader>{header}</BottomSheetHeader>
      <BottomSheetBody testID={testID ? 'body' : undefined}>
        <Text
          style={styles.heading}
          accessibilityRole="header"
          testID={testID ? 'heading' : undefined}
        >
          {t('equityBreakdown.heading')}
        </Text>
        <View style={styles.legend} testID={testID ? 'legend' : undefined}>
          <LegendItem
            color={theme.bands.trash.solid}
            label={t('equityBreakdown.bands.trash')}
            countLabel={
              isCalculating
                ? LOADING_COUNT_LABEL
                : tHandRanges('cardPairCount', { count: bandCounts.trash })
            }
            testID={testID ? 'legend-trash' : undefined}
          />
          <LegendItem
            color={theme.bands.marginal.solid}
            label={t('equityBreakdown.bands.marginal')}
            countLabel={
              isCalculating
                ? LOADING_COUNT_LABEL
                : tHandRanges('cardPairCount', { count: bandCounts.marginal })
            }
            testID={testID ? 'legend-marginal' : undefined}
          />
          <LegendItem
            color={theme.bands.value.solid}
            label={t('equityBreakdown.bands.value')}
            countLabel={
              isCalculating
                ? LOADING_COUNT_LABEL
                : tHandRanges('cardPairCount', { count: bandCounts.value })
            }
            testID={testID ? 'legend-value' : undefined}
          />
          <LegendItem
            color={theme.bands.nuts.solid}
            label={t('equityBreakdown.bands.nuts')}
            countLabel={
              isCalculating
                ? LOADING_COUNT_LABEL
                : tHandRanges('cardPairCount', { count: bandCounts.nuts })
            }
            testID={testID ? 'legend-nuts' : undefined}
          />
        </View>
        <EquityBreakdownChart
          equities={result === null ? null : equities}
          bands={result === null ? null : bands}
          isCalculating={isCalculating}
          hasFinishedOpening={hasFinishedOpening}
          style={styles.chart}
          testID={testID ? 'chart' : undefined}
        />
        {
          // the Rank Pair list — every Rank Pair in this player's own hand
          // range, grouped and ordered by `EquityBreakdownRankPairs` itself.
          // `player.holding` is always a hand range on this branch (this
          // component's own doc comment, above) — the `kind` check here is
          // what lets the type checker see that, not a behaviour this sheet
          // does not already have.
        }
        {player.holding.kind === 'handRange' ? (
          <EquityBreakdownRankPairs
            rankPairs={player.holding.rankPairs}
            style={styles.rankPairs}
            testID={testID ? 'rank-pairs' : undefined}
          />
        ) : null}
        {
          // the Blocker Score section (issue #293): every hand in this
          // player's own range, below the Rank Pair list above — same
          // "hand range only" branch, same reason.
        }
        {player.holding.kind === 'handRange' ? (
          <EquityBreakdownBlockerScore
            rankPairs={player.holding.rankPairs}
            equities={result === null ? EMPTY_BUFFER : result.equities}
            blockerScores={result === null ? EMPTY_BUFFER : result.blockerScores}
            opponentNumbers={opponentNumbers}
            style={styles.blockerScore}
            testID={testID ? 'blocker-score' : undefined}
          />
        ) : null}
      </BottomSheetBody>
    </BottomSheet>
  );
}

/** one legend entry: a solid colour swatch, the band's own name, and that
 * band's own live card-pair count, read together as one accessible group so
 * a screen reader announces both without treating the count as an unrelated
 * second element. Private to this file — this
 * sheet is the legend's only caller. */
function LegendItem({
  color,
  label,
  countLabel,
  testID,
}: {
  color: string;
  label: string;
  /** the band's own count, already formatted (`handRanges:cardPairCount`,
   * "N combos") — resolved by the caller the same way `PlayerRowContent`'s
   * own `resultLabel` already is. `LOADING_COUNT_LABEL` (an en dash) while
   * `isCalculating` is `true`, in place of a formatted count this sheet has
   * no settled figure for yet (issue #294). */
  countLabel: string;
  testID?: string;
}) {
  return (
    <View
      style={styles.legendItem}
      accessible
      accessibilityLabel={`${label}: ${countLabel}`}
      testID={testID}
    >
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel} testID={testID ? 'label' : undefined}>
        {label}
      </Text>
      <Text style={styles.legendCount} testID={testID ? 'count' : undefined}>
        {countLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  heading: {
    ...theme.typography.heading,
    color: theme.colors.text.neutral.high,
    marginBottom: theme.space.x16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.x16,
    marginBottom: theme.space.x16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x8,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: theme.radius.xs,
  },
  legendLabel: {
    ...theme.typography.chartLegendLabel,
    color: theme.colors.text.neutral.low,
  },
  // no design-file measurement of the legend's own count text — this
  // stage's own implementer pick, the same "no design-file source" status
  // `../equity-breakdown-chart/equity-breakdown-chart.tsx`'s own
  // `CHART_HEIGHT` already carries. Reuses `chartLegendLabel` whole, rather
  // than inventing a fifth type role for one more piece of this sheet's own
  // annotation text — see docs/conventions/design-system.md's "Equity
  // Breakdown Legend and Axis Labels" section for why a departure from a
  // measured role gets recorded there rather than assumed silently; this is
  // not such a departure, since `chartLegendLabel` was never a measured
  // reading of this text to begin with.
  legendCount: {
    ...theme.typography.chartLegendLabel,
    color: theme.colors.text.neutral.low,
  },
  // the clearance this sheet leaves below the chart — between it and the
  // Rank Pair list that follows it for a hand-range player, or the panel's
  // own edge for the practically-unreachable case that list doesn't render
  // (this component's own doc comment). Supplied here rather than by
  // `EquityBreakdownChart` itself, per docs/conventions/component-
  // styling.md's "Placement Is the Caller's" — outer spacing is this
  // caller's to give, and this sheet is the chart's only caller.
  chart: {
    marginBottom: theme.space.x16,
  },
  // the clearance this sheet leaves below the Rank Pair list, on top of
  // whatever bottom safe-area inset `../../../../shared/ui/bottom-sheet/
  // bottom-sheet.tsx`'s own panel already pads for: on a device reporting
  // no inset that padding is zero, and the list would otherwise sit flush
  // against the panel's own edge. Supplied here rather than by
  // `EquityBreakdownRankPairs` itself, per the same styling rule `chart`
  // above already follows.
  rankPairs: {
    marginBottom: theme.space.x16,
  },
  // the clearance this sheet leaves above the Blocker Score section, the
  // same way `chart`/`rankPairs` above already supply the clearance around
  // their own sections — moved here from that section's own root, which had
  // baked it in as a `marginTop` in violation of this same "Placement Is
  // the Caller's" rule (issue #293 fix round 2's own finding).
  blockerScore: {
    marginTop: theme.space.x16,
  },
}));
