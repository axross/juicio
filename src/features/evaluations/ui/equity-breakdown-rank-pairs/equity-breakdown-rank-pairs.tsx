import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { HandRange } from '@/shared/model/hand-range';
import {
  parseRankPairKey,
  rankPairKey,
  type RankPair,
  type RankPairKey,
} from '@/shared/model/rank-pair';
import { gridCoordinatesToRankPair } from '@/shared/ui/grid-coordinates';
import { RankIcon } from '@/shared/ui/playing-card/icons/rank-icon';
import { SuitednessIcon } from '@/shared/ui/playing-card/icons/suitedness-icon';

const GRID_COLUMNS = 13;

// row-major, both axes descending A→2 — the same transform
// `@/shared/ui/rank-pair-grid/rank-pair-grid.tsx`'s own `GRID_CELL_KEYS`
// builds from, reused here (rather than that module's own array, which is
// keyed by `RankPairKey` alone and private to that file) since this
// component needs each cell's parsed `isPocket`/`suitedness` to sort it
// into a group, not only its key.
const ALL_RANK_PAIRS_IN_GRID_ORDER: readonly RankPair[] = Array.from(
  { length: GRID_COLUMNS * GRID_COLUMNS },
  (_, index) =>
    gridCoordinatesToRankPair({
      row: Math.floor(index / GRID_COLUMNS),
      col: index % GRID_COLUMNS,
    }),
);

type RankPairGroups = {
  readonly pocket: readonly RankPairKey[];
  readonly suited: readonly RankPairKey[];
  readonly offsuit: readonly RankPairKey[];
};

/**
 * splits `rankPairs` into the three groups this component lists, each
 * still in `ALL_RANK_PAIRS_IN_GRID_ORDER`'s own canonical order — one pass
 * over all 169 grid cells, keeping only the ones `rankPairs` actually
 * contains and sorting each into whichever of the three arrays it belongs
 * to.
 */
function groupRankPairsByGridOrder(rankPairs: HandRange): RankPairGroups {
  const pocket: RankPairKey[] = [];
  const suited: RankPairKey[] = [];
  const offsuit: RankPairKey[] = [];
  for (const pair of ALL_RANK_PAIRS_IN_GRID_ORDER) {
    const key = rankPairKey(pair);
    if (!rankPairs.has(key)) {
      continue;
    }
    if (pair.isPocket) {
      pocket.push(key);
    } else if (pair.suitedness === 'suited') {
      suited.push(key);
    } else {
      offsuit.push(key);
    }
  }
  return { pocket, suited, offsuit };
}

/**
 * the Equity Breakdown sheet's own Rank Pair list (issue #234): every Rank
 * Pair in a hand-range player's own range, grouped under three headings —
 * `Pocket pairs`, `Suited`, `Offsuit`, in that fixed order — below
 * `../equity-breakdown-chart/equity-breakdown-chart.tsx`'s histogram. Reads
 * its own `analyze`/`handRanges` i18n namespaces directly, the same way
 * that sibling chart component does, rather than taking already-resolved
 * strings from its caller.
 *
 * **a group renders nothing at all when it is empty** — no heading, no
 * empty row — mirroring `../player-row-content/player-row-content.tsx`'s
 * own "a caller with nothing to show draws nothing" rule for its own
 * `resultLabel`/`chevron` cases, rather than a heading with an empty chip
 * row beneath it.
 *
 * **no virtualization**: a hand range holds at most 169 Rank Pairs, split
 * across three groups — small enough to render as a plain, wrapped list.
 *
 * **each chip is non-interactive** — a plain `View`, never a `Pressable` —
 * since this list only enumerates what the histogram above it already
 * summed; nothing here selects a Rank Pair or filters the chart by one.
 */
export function EquityBreakdownRankPairs({
  rankPairs,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  rankPairs: HandRange;
  testID?: string;
}) {
  const { t } = useTranslation('analyze');
  const groups = useMemo(() => groupRankPairsByGridOrder(rankPairs), [rankPairs]);

  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      {groups.pocket.length > 0 ? (
        <RankPairGroup
          heading={t('equityBreakdown.rankPairs.groupHeading.pocket')}
          keys={groups.pocket}
          testID={testID ? 'pocket' : undefined}
        />
      ) : null}
      {groups.suited.length > 0 ? (
        <RankPairGroup
          heading={t('equityBreakdown.rankPairs.groupHeading.suited')}
          keys={groups.suited}
          testID={testID ? 'suited' : undefined}
        />
      ) : null}
      {groups.offsuit.length > 0 ? (
        <RankPairGroup
          heading={t('equityBreakdown.rankPairs.groupHeading.offsuit')}
          keys={groups.offsuit}
          testID={testID ? 'offsuit' : undefined}
        />
      ) : null}
    </View>
  );
}

/** one group section — a heading and its own wrapped row of chips. private
 * to this file; `EquityBreakdownRankPairs` above is its only caller. */
function RankPairGroup({
  heading,
  keys,
  testID,
}: {
  heading: string;
  keys: readonly RankPairKey[];
  testID?: string;
}) {
  return (
    <View testID={testID}>
      <Text
        style={styles.groupHeading}
        accessibilityRole="header"
        testID={testID ? `${testID}-heading` : undefined}
      >
        {heading}
      </Text>
      <View style={styles.chips} testID={testID ? `${testID}-chips` : undefined}>
        {keys.map((key) => (
          <RankPairChip
            key={key}
            pairKey={key}
            testID={testID ? `${testID}-chip-${key}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * one Rank Pair chip: two `RankIcon`s at zero gap and, for `suited`/
 * `offsuit` only, a trailing `SuitednessIcon` also at zero gap — a pocket
 * pair chip draws no third icon, since a pocket pair's own two cards carry
 * no suitedness of their own to indicate. Sizing borrows
 * `../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`'s own
 * `ShorthandChip` geometry (height, radius, horizontal padding, border) —
 * this chip is not that one: it is never pressed, never active/inactive,
 * and carries no text label to pad around, only this icon row at zero
 * internal gap.
 *
 * **one combined accessible label on this chip's own root, its icon row
 * `accessible={false}`** — mirroring `../player-row-content/
 * player-row-content.tsx`'s own pattern for `HoleCardsPreview`/
 * `RankPairGrid`: a screen reader has no use for two or three
 * individually-announced icon glyphs with nothing tying them together.
 */
function RankPairChip({ pairKey, testID }: { pairKey: RankPairKey; testID?: string }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tCards } = useTranslation('handRanges');

  const pair = parseRankPairKey(pairKey);
  const iconColor = theme.colors.text.neutral.high;

  const accessibilityLabel = pair.isPocket
    ? t('equityBreakdown.rankPairs.pocketAccessibilityLabel', {
        rank: tCards(`card.rankName.${pair.highRank}`),
      })
    : t(
        pair.suitedness === 'suited'
          ? 'equityBreakdown.rankPairs.suitedAccessibilityLabel'
          : 'equityBreakdown.rankPairs.offsuitAccessibilityLabel',
        {
          highRank: tCards(`card.rankName.${pair.highRank}`),
          lowRank: tCards(`card.rankName.${pair.lowRank}`),
        },
      );

  return (
    <View style={styles.chip} accessible accessibilityLabel={accessibilityLabel} testID={testID}>
      <View style={styles.chipIcons} accessible={false}>
        <RankIcon rank={pair.highRank} color={iconColor} />
        <RankIcon rank={pair.lowRank} color={iconColor} />
        {pair.isPocket ? null : <SuitednessIcon suitedness={pair.suitedness} color={iconColor} />}
      </View>
    </View>
  );
}

// `ShorthandChip`'s own measured geometry
// (`../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`) — see this
// file's own `RankPairChip` doc comment for why that component itself
// isn't reused directly.
const CHIP_HEIGHT = 37;
const CHIP_RADIUS = 20;

const styles = StyleSheet.create((theme) => ({
  // the gap between this list's own three group sections — an
  // implementer's own spacing choice, not a design measurement: this
  // section has no design-file frame of its own yet.
  root: {
    gap: theme.space.x24,
  },
  groupHeading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
    marginBottom: theme.space.x8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.x8,
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: CHIP_RADIUS,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
    backgroundColor: theme.colors.component.neutral.rest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // zero gap, deliberately — see this file's own `RankPairChip` doc
  // comment: not `ShorthandChip`'s own text-padding logic.
  chipIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
}));
