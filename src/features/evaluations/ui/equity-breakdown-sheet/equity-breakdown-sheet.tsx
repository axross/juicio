import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { handRangeCardPairCount } from '@/shared/model/hand-range';
import { BottomSheet } from '@/shared/ui/bottom-sheet/bottom-sheet';

import type { Player } from '../../model/player';
import { EquityBreakdownChart } from '../equity-breakdown-chart/equity-breakdown-chart';
import { PlayerRowContent } from '../player-row-content/player-row-content';

/**
 * the Equity Breakdown bottom sheet (docs/specs/equity-analysis.md, issue
 * #102): reached from a hand-range row's own detail press
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
 * the same 96pt height, the same 64×64 preview, a bare result figure, and
 * the chevron column left empty (`showChevron={false}`, unconditionally —
 * unlike the row, which shows it for a hand-range player, this header
 * never does, even though it only ever renders for one). Neither
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
 * issue #102's own Accessibility section is explicit that the difference
 * has to be carried in the announcement, since nothing about how it looks
 * still tells the two apart.
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
        <View />
      </BottomSheet>
    );
  }

  // `player.holding` is always a hand range here — only a hand-range
  // row's own `onBreakdownRequested` ever opens this sheet
  // (`../player-row/player-row.tsx`); a hole-cards player has no
  // distribution to break down, per issue #102's own settled decision.
  const combos =
    player.holding.kind === 'handRange'
      ? tHandRanges('cardPairCount', { count: handRangeCardPairCount(player.holding.rankPairs) })
      : '';
  const label = t('playerRow.title', { number: player.number });
  const resultLabel = t('playerRow.resultPercentage');
  const headerAccessibilityLabel = t('equityBreakdown.headerAccessibilityLabel', {
    number: player.number,
    combos,
    result: resultLabel,
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
        showChevron={false}
        testID={testID}
      />
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      onRequestClose={onRequestClose}
      handleAccessibilityLabel={t('equityBreakdown.handle.accessibilityLabel')}
      accessibilityLabel={t('equityBreakdown.sheet.accessibilityLabel')}
      header={header}
      testID={testID}
      style={style}
      {...props}
    >
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
      <EquityBreakdownChart style={styles.chart} testID={testID ? 'chart' : undefined} />
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
  // the clearance this sheet leaves below the chart, on top of whatever
  // bottom safe-area inset `../../../../shared/ui/bottom-sheet/
  // bottom-sheet.tsx`'s own panel already pads for: on a device reporting
  // no inset that padding is zero, and the chart would otherwise sit flush
  // against the panel's own edge. Supplied here rather than by
  // `EquityBreakdownChart` itself, per docs/conventions/component-
  // styling.md's "Placement Is the Caller's" — outer spacing is this
  // caller's to give, and this sheet is the chart's only caller.
  chart: {
    marginBottom: theme.space.x16,
  },
}));
