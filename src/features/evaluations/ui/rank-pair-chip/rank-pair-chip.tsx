import type { TFunction } from 'i18next';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { parseRankPairKey, type RankPairKey } from '@/shared/model/rank-pair';
import { RankIcon } from '@/shared/ui/playing-card/icons/rank-icon';
import { SuitednessIcon } from '@/shared/ui/playing-card/icons/suitedness-icon';

/**
 * one Rank Pair's own spoken name — "ace ace pocket pair", "ace king
 * suited" — the same composed phrase `RankPairChip` below sets as its own
 * `accessibilityLabel`. Exported (issue #293) so `../equity-breakdown-
 * blocker-score/equity-breakdown-blocker-score.tsx` can name a rank-pair-
 * labelled row's own hand in its own composed row label without either
 * duplicating these three `t()` calls or reading `RankPairChip`'s internal
 * accessibility label back out of its rendered tree. `t`/`tCards` are the
 * caller's own `useTranslation('analyze')`/`useTranslation('handRanges')`
 * results — a plain function, not a hook, the same shape
 * `@/shared/ui/card-spoken-name.ts`'s `cardSpokenName` already takes.
 */
export function rankPairAccessibilityLabel(
  pairKey: RankPairKey,
  t: TFunction<'analyze'>,
  tCards: TFunction<'handRanges'>,
): string {
  const pair = parseRankPairKey(pairKey);
  return pair.isPocket
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
 *
 * moved here from `../equity-breakdown-rank-pairs/
 * equity-breakdown-rank-pairs.tsx` (issue #293), its own sole caller until
 * `../equity-breakdown-blocker-score/equity-breakdown-blocker-score.tsx`
 * needed the identical chip for a Rank-Pair-labelled row — per
 * docs/conventions/directory-structure.md, a module with two consumers in
 * different directories stays flat at `ui/`'s own top level rather than
 * living inside either one's own directory.
 *
 * That second caller is also what ends this component's own file-private
 * exemption from docs/conventions/component-styling.md's "The Caller's
 * Style Lands on the JSX Root" rule (that rule's own table names exactly
 * this: a file-private subcomponent takes `style` only when its one caller
 * passes one) — `style` inherits from `View`'s own props per
 * docs/conventions/component-contracts.md and merges last,
 * `style={[styles.chip, style]}`, same as every other plain-`View`-root
 * component in this codebase.
 *
 * **every other rest prop spreads onto the root *before* `accessible`/
 * `accessibilityLabel`, not after** — the reverse of this project's own
 * default ordering (docs/conventions/component-contracts.md's "Propagate
 * Rest Props to the Root Child Element"). `accessible`/`accessibilityLabel`
 * are not a mere default here the way, say, `accessibilityRole` would be:
 * they are this component's entire reason for existing — the composed
 * spoken name built from `pairKey` above — the same "load-bearing wiring"
 * exception that document's own `SelectionGrid`/`onLayout` example states.
 * Spreading rest props first is what keeps a caller from silently
 * overriding that computed name with an unrelated `accessibilityLabel` it
 * happened to pass through; every rest prop that isn't one of those two
 * still reaches the root exactly as the default ordering would deliver it.
 *
 * **`accessibleAsGroup` (default `true`) is the one deliberate, named
 * escape hatch from that protection** — added for `../equity-breakdown-
 * blocker-score/equity-breakdown-blocker-score.tsx`'s own `BlockerScoreListRow`
 * (issue #293 fix round 4), which composes this chip inside a row that is
 * already its own accessible group carrying a fuller composed label (the
 * hand plus its own count and figures) — this chip's own bare rank-pair
 * name left active there would be a second, narrower announcement inside
 * that row with nothing tying the two together, the same problem
 * `../player-row-content/player-row-content.tsx`'s own doc comment states
 * for `HoleCardsPreview`/`RankPairGrid` and solves the same way: the
 * composing parent, not this chip's own generic rest-props channel,
 * decides. Explicitly consulted below rather than folded into the rest-props
 * spread above — the ordering that protects `accessible`/`accessibilityLabel`
 * from an unrelated rest prop stays exactly as it was; this is a second,
 * named parameter this component itself reads, not a reopening of that
 * channel. `false` renders no `accessible`/`accessibilityLabel` of this
 * chip's own at all, leaving the composing parent's own group as the only
 * one a screen reader reaches for this chip's whole subtree.
 *
 * **whether that actually changes anything on a real device is not
 * confirmed from source.** React Native's own documented behaviour
 * collapses every descendant of an `accessible={true}` ancestor into that
 * ancestor's single announced node regardless of what a descendant's own
 * `accessible`/`accessibilityLabel` say — which would make this chip's own
 * accessibility already inert inside such a row even with
 * `accessibleAsGroup` left at its own default `true`, not a second,
 * competing announcement. Neither this fix nor the review that asked for
 * it read the native accessibility tree to settle which of the two is
 * true. This is exactly the same category of disclosed-not-confirmed risk
 * this file's own sibling component
 * (`../equity-breakdown-blocker-score/equity-breakdown-blocker-score.tsx`'s
 * own doc comment on `nestedScrollEnabled`) already carries for gesture
 * arbitration — the plan's own manual screen-reader verification step
 * MUST specifically check this row's own announcement (one composed
 * phrase, not a bare rank-pair name spoken a second time) before this is
 * treated as settled.
 */
export function RankPairChip({
  pairKey,
  style,
  testID,
  accessibleAsGroup = true,
  ...props
}: ComponentProps<typeof View> & {
  pairKey: RankPairKey;
  /** `false` renders this chip's own root with no `accessible`/
   * `accessibilityLabel` of its own — see this component's own doc comment
   * above for who this is for and why. Defaults to `true`, this
   * component's own original, unchanged behaviour for every other caller. */
  accessibleAsGroup?: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const { t: tCards } = useTranslation('handRanges');

  const pair = parseRankPairKey(pairKey);
  const iconColor = theme.colors.text.neutral.high;
  const accessibilityLabel = rankPairAccessibilityLabel(pairKey, t, tCards);

  return (
    <View
      style={[styles.chip, style]}
      testID={testID}
      {...props}
      accessible={accessibleAsGroup}
      accessibilityLabel={accessibleAsGroup ? accessibilityLabel : undefined}
    >
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
