import type { ComponentProps } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { handRangeCardPairCount } from '@/shared/model/hand-range';
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from '@/shared/ui/bottom-sheet/bottom-sheet';

import { usePlayerEquityResult } from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import { EquityBreakdownChart } from '../equity-breakdown-chart/equity-breakdown-chart';
import { EquityBreakdownRankPairs } from '../equity-breakdown-rank-pairs/equity-breakdown-rank-pairs';
import { PlayerRowContent } from '../player-row-content/player-row-content';

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
  onRequestClose,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  visible: boolean;
  /** the player this sheet is showing the breakdown for — `null` while
   * `visible` is `false`. */
  player: Player | null;
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
          <LegendItem color={theme.bands.trash.solid} label={t('equityBreakdown.bands.trash')} />
          <LegendItem
            color={theme.bands.marginal.solid}
            label={t('equityBreakdown.bands.marginal')}
          />
          <LegendItem color={theme.bands.value.solid} label={t('equityBreakdown.bands.value')} />
          <LegendItem color={theme.bands.nuts.solid} label={t('equityBreakdown.bands.nuts')} />
        </View>
        <EquityBreakdownChart
          distribution={result?.distribution ?? null}
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

/** one legend entry: a solid colour swatch and its band name. private to
 * this file — this sheet is the legend's only caller. */
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
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
