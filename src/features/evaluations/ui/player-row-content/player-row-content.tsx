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
// the chevron's own 24×24 icon canvas — reserved as a column on every row
// in the *list*, shown or not, so a hole-cards row's result figure lands on
// the exact same vertical line as a hand-range row's (issue #102's own
// settled decision). The Equity Breakdown sheet's own header is the one
// caller that reserves nothing (`chevron="omitted"`): it renders one player
// and never a second row to align with, so a reserved column there buys no
// alignment and reads as a gap between the result figure and the row's own
// trailing padding.
const CHEVRON_COLUMN_WIDTH = 24;

/**
 * the visual body one players-list row shares with the Equity Breakdown
 * sheet's own header (issue #102, option B — the design of record): a
 * holding's own preview, its label and subtitle, a result figure, and —
 * for a caller that asks for one — a chevron column.
 * `../player-row/player-row.tsx` wraps this in its own
 * swipe gesture and accessible group; `../equity-breakdown-sheet/
 * equity-breakdown-sheet.tsx` wraps it in a plain, non-interactive
 * accessible `View` instead — this component itself owns no gesture and no
 * accessibility grouping of its own, only the shared layout. `label` and
 * `subtitle` arrive already resolved by the caller — this component reads
 * no i18n namespace of its own, the same "the caller resolves the string,
 * the component only lays it out" split `resultLabel` already follows.
 *
 * **`chevron` is three-state, not a boolean.** Whether the icon shows and
 * whether its column is reserved at all are two separate questions, and a
 * boolean can only answer one of them — so `'shown'`, `'reserved'` and
 * `'omitted'` are one prop with no invalid combination to represent. The
 * list needs `'reserved'` (a hole-cards row keeps the column empty so its
 * result figure stays on one vertical line with a hand-range row's), and
 * the sheet's header needs `'omitted'` (nothing to align with there — see
 * `CHEVRON_COLUMN_WIDTH` above).
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
  chevron,
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
  /** the row's own result figure, already formatted (`../../adapter/
   * use-equity-evaluation.ts`'s own per-player selector, resolved by the
   * caller) — `null` when no result is currently available for this player
   * (fewer than 2 players, more than 3, an evaluation in flight, or none
   * yet attempted): renders no `<Text>` element at all for the result,
   * mirroring exactly how `chevron === 'omitted'` already renders no
   * column at all below — same pattern, same rationale: a caller that has
   * nothing to show draws nothing, rather than an empty string a screen
   * reader would announce as silence with no explanation. rendered as
   * plain, non-interactive text otherwise (issue #103 — this row's own
   * figure was a fixed `0%` for every player until this change). */
  resultLabel: string | null;
  /** what this row does with its trailing chevron column. `'shown'` draws
   * the column with the chevron in it — a hand-range row in the list.
   * `'reserved'` draws the column empty, keeping a hole-cards row's result
   * figure on the same vertical line as a hand-range row's. `'omitted'`
   * renders no column at all, so the result figure sits against the row's
   * own trailing padding — the Equity Breakdown sheet's own header, which
   * has no second row to align with. */
  chevron: 'shown' | 'reserved' | 'omitted';
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
        {resultLabel === null ? null : (
          <Text style={styles.result} numberOfLines={1} testID={testID ? 'result' : undefined}>
            {resultLabel}
          </Text>
        )}
        {chevron === 'omitted' ? null : (
          <View style={styles.chevronColumn} testID={testID ? 'chevron-column' : undefined}>
            {chevron === 'shown' ? (
              <ChevronRightIcon color={theme.colors.text.neutral.low} size={CHEVRON_COLUMN_WIDTH} />
            ) : null}
          </View>
        )}
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
