import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { EspadaEquityCardPairResult } from '@/modules/espada-engine/index';
import { handRangeCardPairCount } from '@/shared/model/hand-range';
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from '@/shared/ui/bottom-sheet/bottom-sheet';

import { usePlayerEquityResult } from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import { classifyCardPairBands, countStrengthBands } from '../../model/strength-band';
import { EquityBreakdownChart } from '../equity-breakdown-chart/equity-breakdown-chart';
import { EquityBreakdownRankPairs } from '../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs';
import { PlayerRowContent } from '../player-row-content/player-row-content';

/** stands in for `result?.pairs` while no result exists yet — a fixed empty
 * array, not a fresh `[]` literal at every read, so `pairs` stays
 * referentially stable across a render this player's own result did not
 * change, and the `useMemo` calls below (`bands`/`equities`) genuinely
 * reuse their previous output rather than recomputing over an
 * indistinguishable-but-new empty array every time. */
const EMPTY_PAIRS: readonly EspadaEquityCardPairResult[] = [];

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
  playerCount,
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
  /** the calculation's own player count — `N` in `fair = 1/N`
   * (docs/decisions/2026-09-04-classify-strength-bands-from-fair-share-
   * equity-and-current-strength.md), read explicitly from the caller rather
   * than this sheet reaching into `usePlayersStore`
   * (`../../adapter/use-players.ts`) itself: `../analyze-screen/
   * analyze-screen.tsx` already holds the live players list to look up
   * `player` itself, so this is the same "the caller supplies the
   * situation, this sheet only classifies against it" split `player`
   * already follows. */
  playerCount: number;
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

  // this player's own live card pairs, or `EMPTY_PAIRS` while no result
  // exists yet — the same "no result" degrade `resultLabel` below already
  // applies, read here too since the band classification below needs
  // something to classify regardless. Called unconditionally, ahead of the
  // early return below, for the same Rules-of-Hooks reason `result` above
  // is.
  const pairs = result?.pairs ?? EMPTY_PAIRS;
  // classifies every one of `pairs` into its own strength band
  // (`../../model/strength-band.ts`'s Rule R1) — memoized on `pairs`,
  // `playerCount`, and `isPreflop` rather than recomputed on every render,
  // since `../equity-breakdown-chart/equity-breakdown-chart.tsx`'s own
  // `useMemo` depends on this array's own reference staying stable across a
  // render that changed none of the three.
  const bands = useMemo(
    () => classifyCardPairBands(pairs, playerCount, isPreflop),
    [pairs, playerCount, isPreflop],
  );
  // the four band counts the legend below shows beside each label — always
  // sums to `pairs.length`, the player's own live card-pair count, per this
  // sheet's own acceptance criteria.
  const bandCounts = useMemo(() => countStrengthBands(bands), [bands]);
  // `bands`' own equities, parallel and in the same order — what
  // `EquityBreakdownChart` below buckets by equity bin to resolve each
  // bar's own majority band; the chart itself never reads a full
  // `EspadaEquityCardPairResult`, only this pairing (see that component's
  // own doc comment).
  const equities = useMemo(() => pairs.map((pair) => pair.equity), [pairs]);

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
            countLabel={tHandRanges('cardPairCount', { count: bandCounts.trash })}
            testID={testID ? 'legend-trash' : undefined}
          />
          <LegendItem
            color={theme.bands.marginal.solid}
            label={t('equityBreakdown.bands.marginal')}
            countLabel={tHandRanges('cardPairCount', { count: bandCounts.marginal })}
            testID={testID ? 'legend-marginal' : undefined}
          />
          <LegendItem
            color={theme.bands.value.solid}
            label={t('equityBreakdown.bands.value')}
            countLabel={tHandRanges('cardPairCount', { count: bandCounts.value })}
            testID={testID ? 'legend-value' : undefined}
          />
          <LegendItem
            color={theme.bands.nuts.solid}
            label={t('equityBreakdown.bands.nuts')}
            countLabel={tHandRanges('cardPairCount', { count: bandCounts.nuts })}
            testID={testID ? 'legend-nuts' : undefined}
          />
        </View>
        <EquityBreakdownChart
          distribution={result?.distribution ?? null}
          equities={result === null ? null : equities}
          bands={result === null ? null : bands}
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
      </BottomSheetBody>
    </BottomSheet>
  );
}

/** one legend entry: a solid colour swatch, the band's own name, and —
 * as of this stage — that band's own live card-pair count, read together as
 * one accessible group so a screen reader announces both without treating
 * the count as an unrelated second element. Private to this file — this
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
   * own `resultLabel` already is. */
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
}));
