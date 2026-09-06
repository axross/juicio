import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { HandRange } from '@/shared/model/hand-range';
import type { RankPairKey } from '@/shared/model/rank-pair';

import { groupRankPairsByGridOrder } from '../../model/rank-pair-groups';
import { RankPairChip } from '../rank-pair-chip/rank-pair-chip';

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
 * `groupRankPairsByGridOrder` (`../../model/rank-pair-groups.ts`) is what
 * actually enumerates and groups `rankPairs` — moved out of this file
 * (issue #293) once `../equity-breakdown-blocker-score/
 * equity-breakdown-blocker-score.tsx` needed the identical grouping to lay
 * out its own rows under the same three headings.
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
        // a fixed local literal, not `${testID}-heading` — this group's own
        // `testID` prop already scopes it (a caller finds this child
        // through `within()`, per docs/conventions/component-contracts.md's
        // "A Non-Root Child Gets Its Own Local testID"), so the three
        // sibling groups this component renders can share the same literal
        // without colliding: nothing ever queries `group-heading`
        // un-scoped. named `group-heading`, not the bare `heading` a fixed
        // literal would otherwise suggest, since this component renders
        // inside `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s
        // own `body`, which already owns a `heading` of its own (that
        // sheet's title) at a shallower level of the same tree — a bare
        // `heading` here would collide with it for any query scoped no
        // narrower than that shared ancestor.
        testID={testID ? 'group-heading' : undefined}
      >
        {heading}
      </Text>
      <View style={styles.chips} testID={testID ? 'chips' : undefined}>
        {keys.map((key) => (
          // `chip-${key}` — a fixed literal prefix plus this chip's own
          // natural key, the `.map()`-list form the same doc names
          // (`cell-${key}`), never `${testID}-chip-${key}`.
          <RankPairChip key={key} pairKey={key} testID={testID ? `chip-${key}` : undefined} />
        ))}
      </View>
    </View>
  );
}

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
}));
