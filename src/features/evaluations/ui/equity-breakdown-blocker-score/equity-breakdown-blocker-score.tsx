import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { Card } from '@/shared/model/card';
import { cardPairNumber, type CardPair } from '@/shared/model/card-pair';
import type { HandRange } from '@/shared/model/hand-range';
import type { RankPairKey } from '@/shared/model/rank-pair';
import { cardSpokenName } from '@/shared/ui/card-spoken-name';
import { RankIcon } from '@/shared/ui/playing-card/icons/rank-icon';
import { SuitIcon } from '@/shared/ui/playing-card/icons/suit-icon';

import {
  blockerScoreBarFraction,
  blockerScoreRowsForRankPair,
  blockerScoreScale,
  formatBlockerScore,
  isBlockerScoreSettled,
  type BlockerScoreRow,
} from '../../model/blocker-score';
import { groupRankPairsByGridOrder } from '../../model/rank-pair-groups';
import { rankPairAccessibilityLabel, RankPairChip } from '../rank-pair-chip/rank-pair-chip';

/**
 * a settled hand-range player's own Blocker Score section
 * (docs/specs/equity-breakdown.md's "The Blocker Score", issue #293): every
 * hand in `rankPairs`, below `../equity-breakdown-rank-pairs/
 * equity-breakdown-rank-pairs.tsx`'s own list — same three group headings,
 * same canonical grid order, so a reader tracks one ordering across the
 * whole sheet.
 *
 * **carries the two raw fixed-slot buffers, not an already-derived row
 * list** — `equities`/`blockerScores` are `EspadaEquityPlayerResult`'s own
 * fields, read by `../../model/blocker-score.ts`'s
 * `blockerScoreRowsForRankPair` once per rank pair, memoized on the buffers
 * themselves rather than recomputed on every render: this is the "grouping
 * runs once per settled result, not per rendered row" non-functional
 * requirement, satisfied by `useMemo` rather than a second store slice.
 *
 * **settled vs. pre-settlement is read from `blockerScores` alone**
 * (`isBlockerScoreSettled`) — an empty buffer means either a progress tick
 * or the practically-unreachable no-result case `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` already degrades for (its own doc comment);
 * this component does not need to tell the two apart, since both show the
 * identical pre-settlement structure.
 *
 * **pre-settlement rows are rank-pair-only, never split into card pairs** —
 * the grouping itself depends on settled figures this component does not
 * have yet, so every rank pair in `rankPairs` gets exactly one skeleton row
 * with no digit, no sign, and no bar direction, per this change's own round-
 * two high-fidelity mockup.
 *
 * **a bounded-height, virtualized `FlatList`, nested inside `../
 * equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own outer
 * `Animated.ScrollView`** — a deliberate departure from `../player-list/
 * player-list.tsx`'s own "nesting a virtualized list inside another
 * scrolling container is a pattern React Native warns against": this
 * section's own non-functional requirement ("must not be built by
 * rendering every entry eagerly") makes virtualization necessary at up to
 * 1,326 rows, where `PlayerList`'s own fixed three-row cap makes it
 * unnecessary there. The height below (258) is not this implementer's own
 * pick — it is read directly from the approved round-two high-fidelity
 * mockup's own `.blocker-scroll { max-height: 258px; }`, the one concrete
 * measurement that mockup gives this section. Gesture arbitration between
 * this list's own native scroll and the sheet's own drag-to-dismiss pan
 * (that component's own `contentPan`, gated on the *outer* `Animated.
 * ScrollView`'s scroll position) is not something a Jest render can
 * observe — this is exactly what the plan's own manual verification steps
 * 1-3 exist to confirm on a real device, not a gap this component papers
 * over silently.
 *
 * **`nestedScrollEnabled` set below is hardening, not a confirmed fix for
 * an observed defect** — on Android, a nested `FlatList`'s own scroll
 * defaults this prop to `false`, and whether it receives the gesture at
 * all when an outer container's own recognizer also wants it (this
 * section's own outer `Animated.ScrollView`, above) is frequently decided
 * by exactly this prop. Nothing runnable here can settle whether the
 * gesture arbitration this doc comment already flags as unconfirmed
 * actually needs it; setting it removes one known Android-specific reason
 * it might not, without asserting the arbitration itself is now
 * confirmed — that stays the plan's own manual verification steps' job.
 */
export function EquityBreakdownBlockerScore({
  rankPairs,
  equities,
  blockerScores,
  opponentNumbers,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  rankPairs: HandRange;
  /** `EspadaEquityPlayerResult.equities` — read only once `blockerScores`
   * below reports settled; an empty stand-in buffer while no result exists
   * yet is fine, since it is never read in that case. */
  equities: ArrayBuffer;
  /** `EspadaEquityPlayerResult.blockerScores` — settlement-only; an empty
   * `ArrayBuffer(0)` is this section's own "not yet settled" signal
   * (`isBlockerScoreSettled`), covering both a progress tick and no result
   * at all. */
  blockerScores: ArrayBuffer;
  /** every opponent's own `Player.number`, in seat order with the scoring
   * player skipped — `../equity-breakdown-sheet/equity-breakdown-sheet.tsx`
   * derives this the same way it derives everything else this section
   * needs, from the same `players` list it already reads. Its length is
   * `playerCount - 1`; position `i` is opponent ordinal `i`
   * (`../../model/blocker-score.ts`'s `blockerScoreOpponentOrdinal`), since
   * filtering a seat-ordered list down to every seat but one, in place,
   * already produces the skip-self ordinal sequence that formula defines. */
  opponentNumbers: readonly number[];
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tCards } = useTranslation('handRanges');

  const settled = isBlockerScoreSettled(blockerScores);
  const playerCount = opponentNumbers.length + 1;
  const groups = useMemo(() => groupRankPairsByGridOrder(rankPairs), [rankPairs]);

  const { items, scale } = useMemo(
    () =>
      buildBlockerScoreItems({
        groups,
        settled,
        equities,
        blockerScores,
        playerCount,
        headings: {
          pocket: t('equityBreakdown.rankPairs.groupHeading.pocket'),
          suited: t('equityBreakdown.rankPairs.groupHeading.suited'),
          offsuit: t('equityBreakdown.rankPairs.groupHeading.offsuit'),
        },
      }),
    [groups, settled, equities, blockerScores, playerCount, t],
  );

  return (
    <View style={[styles.section, style]} testID={testID} {...props}>
      <Text
        style={styles.heading}
        accessibilityRole="header"
        testID={testID ? 'heading' : undefined}
      >
        {t('equityBreakdown.blockerScore.heading')}
      </Text>
      <Text style={styles.subcopy} testID={testID ? 'subcopy' : undefined}>
        {settled
          ? t('equityBreakdown.blockerScore.subcopy')
          : t('equityBreakdown.blockerScore.calculatingSubcopy')}
      </Text>
      <View style={styles.columnHeadRow} testID={testID ? 'column-heads' : undefined}>
        <View style={styles.labelColHead} />
        {opponentNumbers.map((number) => (
          <Text key={number} style={styles.valueColHead}>
            {t('playerRow.title', { number })}
          </Text>
        ))}
      </View>
      <FlatList<BlockerScoreListItem>
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <BlockerScoreListRow
            item={item}
            opponentNumbers={opponentNumbers}
            scale={scale}
            theme={theme}
            t={t}
            tCards={tCards}
            // this list's own rows carry no `testID` at all unless the
            // whole section was given one — the same "no testID in, no
            // testID out" rule `../equity-breakdown-rank-pairs/
            // equity-breakdown-rank-pairs.tsx`'s own `RankPairGroup`
            // already follows. `item.key` is already a fixed, unique,
            // self-describing id per row (`heading-pocket`,
            // `row-AKs-rankPair`, `row-AKs-1320`, …) built from real domain
            // data, not this component's own received `testID` with a
            // suffix concatenated on — exactly what docs/conventions/
            // component-contracts.md's "A Non-Root Child Gets Its Own
            // Local testID" asks for.
            testID={testID ? item.key : undefined}
          />
        )}
        style={styles.scroll}
        nestedScrollEnabled
        testID={testID ? 'list' : undefined}
      />
    </View>
  );
}

type BlockerScoreListItem =
  | { readonly kind: 'heading'; readonly key: string; readonly heading: string }
  | { readonly kind: 'skeleton'; readonly key: string; readonly rankPairKey: RankPairKey }
  | { readonly kind: 'row'; readonly key: string; readonly row: BlockerScoreRow };

/**
 * builds this section's own flattened, virtualization-ready row list plus
 * the one bar scale every row's own bar draws proportional to
 * (`../../model/blocker-score.ts`'s `blockerScoreScale`, computed across
 * every rank pair's own rows at once — the scale is section-wide, never
 * per rank pair). Private to this file; `EquityBreakdownBlockerScore`
 * above is its only caller, from inside a `useMemo` keyed on the settled
 * result's own buffers.
 */
function buildBlockerScoreItems({
  groups,
  settled,
  equities,
  blockerScores,
  playerCount,
  headings,
}: {
  groups: {
    readonly pocket: readonly RankPairKey[];
    readonly suited: readonly RankPairKey[];
    readonly offsuit: readonly RankPairKey[];
  };
  settled: boolean;
  equities: ArrayBuffer;
  blockerScores: ArrayBuffer;
  playerCount: number;
  headings: { readonly pocket: string; readonly suited: string; readonly offsuit: string };
}): { readonly items: readonly BlockerScoreListItem[]; readonly scale: number } {
  const sections: readonly [keyof typeof headings, readonly RankPairKey[]][] = [
    ['pocket', groups.pocket],
    ['suited', groups.suited],
    ['offsuit', groups.offsuit],
  ];

  const items: BlockerScoreListItem[] = [];
  const rows: BlockerScoreRow[] = [];

  for (const [groupName, keys] of sections) {
    if (keys.length === 0) {
      continue;
    }
    items.push({ kind: 'heading', key: `heading-${groupName}`, heading: headings[groupName] });
    for (const rankPairKeyValue of keys) {
      if (!settled) {
        items.push({
          kind: 'skeleton',
          key: `skeleton-${rankPairKeyValue}`,
          rankPairKey: rankPairKeyValue,
        });
        continue;
      }
      const rankPairRows = blockerScoreRowsForRankPair(
        rankPairKeyValue,
        equities,
        blockerScores,
        playerCount,
      );
      for (const row of rankPairRows) {
        rows.push(row);
        const rowKey =
          row.kind === 'rankPair'
            ? `row-${rankPairKeyValue}-rankPair`
            : `row-${rankPairKeyValue}-${cardPairNumber(row.cardPair)}`;
        items.push({ kind: 'row', key: rowKey, row });
      }
    }
  }

  return { items, scale: blockerScoreScale(rows) };
}

/**
 * one list row — a group heading, a pre-settlement skeleton, or a settled
 * `BlockerScoreRow` — rendered by `FlatList`'s own `renderItem` above.
 * Private to this file. Takes `theme`/`t`/`tCards` as plain arguments
 * rather than calling their own hooks itself: every row this list ever
 * renders shares the same theme and the same two translation namespaces
 * its caller already resolved once, so re-resolving them per row would
 * only repeat identical hook calls up to 1,326 times over.
 */
function BlockerScoreListRow({
  item,
  opponentNumbers,
  scale,
  theme,
  t,
  tCards,
  testID,
}: {
  item: BlockerScoreListItem;
  opponentNumbers: readonly number[];
  scale: number;
  theme: ReturnType<typeof useUnistyles>['theme'];
  t: ReturnType<typeof useTranslation<'analyze'>>['t'];
  tCards: ReturnType<typeof useTranslation<'handRanges'>>['t'];
  testID?: string;
}) {
  if (item.kind === 'heading') {
    return (
      <Text style={styles.groupHeading} accessibilityRole="header" testID={testID}>
        {item.heading}
      </Text>
    );
  }

  if (item.kind === 'skeleton') {
    const label = t('equityBreakdown.blockerScore.skeletonRowAccessibilityLabel', {
      hand: rankPairAccessibilityLabel(item.rankPairKey, t, tCards),
    });
    return (
      <View style={styles.row} accessible accessibilityLabel={label} testID={testID}>
        <View style={styles.labelCol}>
          <RankPairChip pairKey={item.rankPairKey} />
        </View>
        {opponentNumbers.map((number) => (
          <View key={number} style={styles.valueCol}>
            <View style={styles.numberSkeleton} />
            <View style={styles.track} />
          </View>
        ))}
      </View>
    );
  }

  const { row } = item;
  const hand =
    row.kind === 'rankPair'
      ? rankPairAccessibilityLabel(row.rankPairKey, t, tCards)
      : t('equityBreakdown.blockerScore.cardPairAccessibilityLabel', {
          first: cardSpokenName(row.cardPair.first, tCards),
          second: cardSpokenName(row.cardPair.second, tCards),
        });
  const valuePhrases = row.values.map((value, index) =>
    t('equityBreakdown.blockerScore.valuePhrase', {
      opponent: t('playerRow.title', { number: opponentNumbers[index] }),
      value: formatBlockerScore(value),
    }),
  );
  const values =
    valuePhrases.length === 2
      ? t('equityBreakdown.blockerScore.valuesLabel.two', {
          first: valuePhrases[0],
          second: valuePhrases[1],
        })
      : t('equityBreakdown.blockerScore.valuesLabel.one', { first: valuePhrases[0] });
  const label =
    row.kind === 'rankPair'
      ? t('equityBreakdown.blockerScore.rankPairRowAccessibilityLabel', {
          hand,
          count: row.combinationCount,
          values,
        })
      : t('equityBreakdown.blockerScore.cardPairRowAccessibilityLabel', { hand, values });

  return (
    <View style={styles.row} accessible accessibilityLabel={label} testID={testID}>
      <View style={styles.labelCol}>
        {row.kind === 'rankPair' ? (
          <>
            <RankPairChip pairKey={row.rankPairKey} />
            <Text style={styles.standingFor}>
              {t('equityBreakdown.blockerScore.standingFor', { count: row.combinationCount })}
            </Text>
          </>
        ) : (
          <CardPairToken cardPair={row.cardPair} theme={theme} />
        )}
      </View>
      {
        // `index` as the key — `row.values` is a fixed-length array, one
        // figure per opponent, that this row never reorders or splices, so
        // an index key is stable across every re-render this list ever
        // produces.
      }
      {row.values.map((value, index) => (
        <ValueCell
          key={index}
          value={value}
          scale={scale}
          theme={theme}
          testID={testID}
          opponentOrdinal={index}
        />
      ))}
    </View>
  );
}

/** one figure — its signed numeral and its diverging bar — private to this
 * file. `testID` is the enclosing row's own local id (`item.key` above),
 * a signal for whether testIDs are active at all, not itself the child's
 * own id — a row renders one of these per opponent (up to two, at this
 * project's own two-or-three-player scope), so `opponentOrdinal` (the same
 * skip-self index `../../model/blocker-score.ts`'s own
 * `blockerScoreOpponentOrdinal` names) keys each one's own local id
 * (`number-0`, `number-1`), per docs/conventions/component-contracts.md's
 * "A Non-Root Child Gets Its Own Local testID" — never the parent's
 * `testID` reused verbatim, which would collide across a three-seat
 * table's own two `ValueCell`s in the same row. */
function ValueCell({
  value,
  scale,
  theme,
  testID,
  opponentOrdinal,
}: {
  value: number;
  scale: number;
  theme: ReturnType<typeof useUnistyles>['theme'];
  testID?: string;
  opponentOrdinal: number;
}) {
  const role = value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
  const numberColor =
    role === 'positive'
      ? theme.colors.text.accent.brand
      : role === 'negative'
        ? theme.colors.text.destructive.high
        : theme.colors.text.neutral.high;
  const fraction = blockerScoreBarFraction(value, scale);

  return (
    <View style={styles.valueCol}>
      <Text
        style={[styles.number, { color: numberColor }]}
        testID={testID ? `number-${opponentOrdinal}` : undefined}
      >
        {formatBlockerScore(value)}
      </Text>
      <View style={styles.track}>
        <View style={styles.zeroLine} />
        {role === 'zero' ? null : (
          <View
            style={[
              styles.fill,
              role === 'positive' ? styles.fillPositive : styles.fillNegative,
              { width: `${fraction * 50}%` },
            ]}
          />
        )}
      </View>
    </View>
  );
}

/** one card-pair row's own label — two exact cards, rank icon plus that
 * card's own suit icon at zero gap, a small gap between the two cards —
 * the same icon-driven treatment `../rank-pair-chip/rank-pair-chip.tsx`
 * already applies to a rank pair's own two rank glyphs, extended here to
 * each card's own exact suit rather than `SuitednessIcon`'s abstract
 * suited/offsuit glyph, since a pulled-out row exists specifically to show
 * which suits it is. Private to this file — no design-file source draws
 * this exact row (docs/specs/equity-breakdown.md's own "no design frame"
 * statement), so its icon sizes are this implementer's own pick, not a
 * measurement — see this file's own doc comment for that disclosure. */
function CardPairToken({
  cardPair,
  theme,
}: {
  cardPair: CardPair;
  theme: ReturnType<typeof useUnistyles>['theme'];
}) {
  return (
    <View style={styles.cardPairToken}>
      <CardToken card={cardPair.first} theme={theme} />
      <CardToken card={cardPair.second} theme={theme} />
    </View>
  );
}

function CardToken({
  card,
  theme,
}: {
  card: Card;
  theme: ReturnType<typeof useUnistyles>['theme'];
}) {
  return (
    <View style={styles.cardToken}>
      <RankIcon rank={card.rank} color={theme.colors.text.neutral.high} size={14} />
      <SuitIcon suit={card.suit} color={theme.suits[card.suit]} size={10} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // no `marginTop` here — the clearance above this section is this
  // component's own caller's to give
  // (docs/conventions/component-styling.md's "Placement Is the Caller's"),
  // supplied through `style` at the call site
  // (`../equity-breakdown-sheet/equity-breakdown-sheet.tsx`'s own
  // `blockerScore` style), the same way that sheet already supplies
  // `EquityBreakdownChart`'s and `EquityBreakdownRankPairs`' own clearance
  // rather than either baking it into its own root.
  section: {
    paddingTop: theme.space.x16,
    borderTopWidth: theme.borderWidth.base,
    borderTopColor: theme.colors.border.neutral.subtle,
  },
  heading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.high,
    marginBottom: 2,
  },
  subcopy: {
    ...theme.typography.description,
    color: theme.colors.text.neutral.low,
    marginBottom: theme.space.x12,
  },
  columnHeadRow: {
    flexDirection: 'row',
    gap: theme.space.x8,
    paddingBottom: theme.space.x8 - theme.space.x4,
    borderBottomWidth: theme.borderWidth.base,
    borderBottomColor: theme.colors.border.neutral.subtle,
  },
  labelColHead: {
    width: 96,
    flexShrink: 0,
  },
  valueColHead: {
    ...theme.typography.chartLegendLabel,
    flex: 1,
    color: theme.colors.text.neutral.low,
    textAlign: 'center',
  },
  // this hi-fi mockup's own one concrete measurement — see this file's own
  // doc comment on `EquityBreakdownBlockerScore` for why this figure is
  // read from the approved design rather than picked here.
  scroll: {
    maxHeight: 258,
  },
  groupHeading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
    paddingTop: theme.space.x12 - theme.space.x4,
    paddingBottom: theme.space.x4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x8,
    paddingVertical: theme.space.x8 - theme.space.x4,
    borderBottomWidth: theme.borderWidth.base,
    borderBottomColor: theme.colors.border.neutral.subtle,
  },
  labelCol: {
    width: 96,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  standingFor: {
    fontSize: 10,
    lineHeight: 13,
    color: theme.colors.text.neutral.low,
    marginLeft: theme.space.x4,
  },
  cardPairToken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x4,
  },
  cardToken: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  valueCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x8,
  },
  number: {
    ...theme.typography.rowSubtitle,
    width: 40,
    flexShrink: 0,
    textAlign: 'right',
  },
  numberSkeleton: {
    width: 30,
    height: 10,
    borderRadius: theme.radius.xs,
    backgroundColor: theme.colors.border.neutral.subtle,
  },
  track: {
    flex: 1,
    height: 14,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.component.neutral.rest,
  },
  zeroLine: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: '50%',
    width: theme.borderWidth.base,
    backgroundColor: theme.colors.border.neutral.unselectedControl,
  },
  fill: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    borderRadius: theme.radius.full,
  },
  fillPositive: {
    left: '50%',
    backgroundColor: theme.colors.text.accent.brand,
  },
  fillNegative: {
    right: '50%',
    backgroundColor: theme.colors.solid.destructive.rest,
  },
}));
