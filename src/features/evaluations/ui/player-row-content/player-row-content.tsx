import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ChevronRightIcon } from '@/core/icons/chevron-right-icon';
import { HoleCardsPreview } from '@/shared/ui/hole-cards-preview/hole-cards-preview';
import { RankPairGrid } from '@/shared/ui/rank-pair-grid/rank-pair-grid';

import type { Player } from '../../model/player';

/** this row family's own design-fixed height (node `423:23692`,
 * docs/conventions/design-system.md's "list rows at 96 and 72") — stays
 * with this component per docs/conventions/component-styling.md's
 * "A Design-Fixed Intrinsic Dimension Stays With the Component" rule.
 * exported: `../player-row/player-row.tsx` reads it for its own swipe
 * geometry, rather than keeping a second copy of the same measured
 * value. */
export const ROW_HEIGHT = 96;
const PREVIEW_SIZE = 64;
// the chevron's own 24×24 icon canvas — reserved as a column on every row,
// shown or not, so a hole-cards row's result figure lands on the exact
// same vertical line as a hand-range row's (issue #102's own settled
// decision).
const CHEVRON_COLUMN_WIDTH = 24;

/**
 * the visual body one players-list row shares with the Equity Breakdown
 * sheet's own header (issue #102, option B — the design of record): a
 * holding's own preview, its label and subtitle, a result figure, and a
 * chevron column. `../player-row/player-row.tsx` wraps this in its own
 * swipe gesture and accessible group; `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` wraps it in a plain, non-interactive
 * accessible `View` instead — this component itself owns no gesture and no
 * accessibility grouping of its own, only the shared layout. `label` and
 * `subtitle` arrive already resolved by the caller — this component reads
 * no i18n namespace of its own, the same "the caller resolves the string,
 * the component only lays it out" split `resultLabel` already follows.
 *
 * **`onPreviewPress`/`onDetailPress` decide interactivity, not a variant
 * prop.** `undefined` renders that region as a plain `View`: the sheet's
 * header passes neither, since option B's header opens nothing and cannot
 * be pressed; `../player-row/player-row.tsx` passes `onPreviewPress`
 * always (every row's preview still edits, unchanged) and `onDetailPress`
 * only for a hand-range player (only that kind opens a breakdown). Each
 * inner region is `accessible={false}` regardless — the row's own outer
 * accessible group, or the sheet header's, is what a screen reader
 * actually reaches; this component never speaks for itself.
 */
export function PlayerRowContent({
  player,
  label,
  subtitle,
  resultLabel,
  showChevron,
  onPreviewPress,
  onDetailPress,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  player: Player;
  /** the row's own title — `../player-row/player-row.tsx`'s
   * `analyze.playerRow.title`, resolved by that caller. */
  label: string;
  /** the row's own subtitle — `Hole cards`, or the range's own card-pair
   * count, resolved by the caller the same way. */
  subtitle: string;
  /** the row's own result figure — always `0%` until the equity engine
   * lands ([#103](https://github.com/axross/juicio/issues/103)); rendered
   * as plain, non-interactive text. */
  resultLabel: string;
  /** whether the trailing chevron renders in this row's own reserved
   * chevron column. `true` only for a hand-range row in the list; always
   * `false` in the sheet's own header (option B leaves that column
   * empty), even though the header only ever renders for a hand-range
   * player. */
  showChevron: boolean;
  /** fires when the preview is pressed. `undefined` renders the preview
   * as a plain, non-interactive `View`. */
  onPreviewPress?: () => void;
  /** fires when anywhere but the preview is pressed. `undefined` renders
   * that region as a plain, non-interactive `View` too. */
  onDetailPress?: () => void;
  /** gates every child's own local testID below — `undefined` renders
   * none of them. Never applied to this component's own root; see the
   * root's own comment for why. */
  testID?: string;
}) {
  const { theme } = useUnistyles();

  const isHoleCards = player.holding.kind === 'holeCards';
  const preview = isHoleCards ? (
    <HoleCardsPreview holeCards={player.holding.holeCards} size={PREVIEW_SIZE} />
  ) : (
    <RankPairGrid rankPairs={player.holding.rankPairs} size={PREVIEW_SIZE} />
  );

  // a plain `View` when the caller passes no press handler — never a
  // `Pressable` with `disabled` set, which would still intercept a touch
  // and still carry a pressed-state affordance for a region a caller (the
  // sheet header) means to be genuinely inert, not merely temporarily
  // disabled.
  const PreviewWrapper = onPreviewPress ? Pressable : View;
  const DetailWrapper = onDetailPress ? Pressable : View;

  return (
    // no `testID` on this root: both real callers already wrap this
    // component in their own testID'd accessible group
    // (`../player-row/player-row.tsx`'s `content`, `../equity-breakdown-
    // sheet/equity-breakdown-sheet.tsx`'s `header`) — giving this root the
    // identical `testID` its caller passed through would collide with
    // that ancestor's own id rather than naming a reachable child of it,
    // the exact case docs/conventions/component-contracts.md's "A
    // Non-Root Child Gets Its Own Local testID" rule exists to prevent.
    // `testID` still gates every child below, unchanged.
    <View style={[styles.root, style]} {...props}>
      <PreviewWrapper
        style={styles.preview}
        onPress={onPreviewPress}
        accessible={false}
        testID={testID ? 'preview' : undefined}
      >
        {preview}
      </PreviewWrapper>
      <DetailWrapper
        style={styles.detail}
        onPress={onDetailPress}
        accessible={false}
        testID={testID ? 'detail' : undefined}
      >
        <View style={styles.meta}>
          <Text style={styles.label} numberOfLines={1} testID={testID ? 'label' : undefined}>
            {label}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1} testID={testID ? 'subtitle' : undefined}>
            {subtitle}
          </Text>
        </View>
        <Text style={styles.result} numberOfLines={1} testID={testID ? 'result' : undefined}>
          {resultLabel}
        </Text>
        <View style={styles.chevronColumn} testID={testID ? 'chevron-column' : undefined}>
          {showChevron ? (
            <ChevronRightIcon color={theme.colors.text.neutral.low} size={CHEVRON_COLUMN_WIDTH} />
          ) : null}
        </View>
      </DetailWrapper>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    padding: theme.space.x16,
    backgroundColor: theme.colors.background.neutral.app,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: theme.space.x8,
  },
  label: {
    ...theme.typography.rowLabel,
    color: theme.colors.text.neutral.high,
  },
  subtitle: {
    ...theme.typography.rowSubtitle,
    color: theme.colors.text.neutral.low,
  },
  result: {
    ...theme.typography.rowLabel,
    color: theme.colors.text.neutral.high,
  },
  chevronColumn: {
    width: CHEVRON_COLUMN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
