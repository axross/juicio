import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import type { Card } from '../../model/card';
import { FAN_CARD, PREVIEW_SLOT } from '../card-fan-geometry';
import { cardSpokenName } from '../card-spoken-name';
import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';

export type PlayingCardSize = 'fan' | 'preview';

const SIZE_CONFIG = {
  fan: FAN_CARD,
  preview: PREVIEW_SLOT,
} as const;

/**
 * one playing card's face: presentational only, no gestures and no state
 * of its own — the card fan and the preview slots (run 4) both render
 * this, differing only in `size`, `scale`, and `selected`.
 */
export function PlayingCard({
  card,
  size,
  scale,
  selected = false,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  card: Card;
  /** the fan's 40×62 card, or the preview slot's 48×75 filled card — the two sizes docs/specs/hand-ranges.md's card picker draws. */
  size: PlayingCardSize;
  /** every dimension below is multiplied by this — the caller's own
   * layout scale (`card-fan-geometry.ts`'s `computeFanLayout` for the
   * fan, `1` for a preview slot's own fixed size), so this component
   * never reads the window itself. */
  scale: number;
  /** true once this card's own face should render in the grid's own
   * selected language (lime fill, lime border, lime glyphs) rather than
   * dimmed, per the maintainer's "marked, not dimmed" call — a genuinely
   * independent two-state fact about this card, not one arm of `size`.
   * named for what this component itself does with it — renders in the
   * selected treatment — not for what any particular caller means by it:
   * `../cards-pane/cards-pane.tsx`'s own fan reads this as "this card
   * already sits in a preview slot," but `PlayingCard` itself has no idea
   * a slot exists; it only ever renders whatever `selected` it is handed.
   * `../../../../shared/ui/selection-grid/selection-grid.tsx`'s own grid
   * cell carries the identical name for the identical reason. */
  selected?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('handRanges');
  styles.useVariants({ selected });

  const config = SIZE_CONFIG[size];

  // the rank glyph is always this project's low-contrast neutral text
  // colour, whatever the suit — never `theme.suits.s`, even though
  // the two happen to resolve to the same hex today (both are `olive
  // dark/11` — see docs/conventions/design-system.md's Suit Colours
  // table). the rank glyph does not vary by suit, so it is not a suit
  // colour; `text.neutral.low` is the role that is actually right, and
  // stays right even if a future design decouples the two.
  const rankColor = selected ? theme.colors.text.accent.low : theme.colors.text.neutral.low;
  const suitColor = selected ? theme.colors.text.accent.low : theme.suits[card.suit];

  // a border insets an absolutely-positioned child by its own width (in
  // React Native exactly as on the web), so the design's own offsets —
  // encoded above unchanged, in `card-fan-geometry.ts` — need the actual
  // rendered border width subtracted before they are usable. skipping
  // that puts every card's contents +1 design unit off in both axes,
  // measured against the design's own export.
  //
  // `theme.borderWidth.base` itself is deliberately never multiplied by
  // `scale`: it is a hairline, and a hairline that scaled below 1px would
  // render inconsistently across densities (rounding to 0 on some,
  // surviving on others) rather than staying the crisp single-pixel line
  // the design intends at every size. that leaves it dimensionally
  // unscaled while every offset around it *is* scaled, so the two cannot
  // be combined before scaling without mixing units — the border has to
  // come off each design-unit offset only after that offset is scaled,
  // not before, which is why each line below reads `* scale` first and
  // subtracts the raw border second.
  //
  // this arithmetic is unaffected by the selected variant's own border
  // colour (`styles.root`'s own `variants.selected` below): every card
  // already draws a `theme.borderWidth.base`-wide border unconditionally,
  // selected or not — only which colour that border draws changes, never
  // its width — so the icon offsets below need no selected-specific case.
  const rankLeft = config.rankIcon.x * scale - theme.borderWidth.base;
  const rankTop = config.rankIcon.y * scale - theme.borderWidth.base;
  const suitLeft = config.suitIcon.x * scale - theme.borderWidth.base;
  const suitTop = config.suitIcon.y * scale - theme.borderWidth.base;

  return (
    // `style` merged last, after this component's own computed size, so a
    // caller extending it does not wipe out the scaled width/height/radius
    // above; every other rest prop spread after `testID`, the same
    // ordering `SegmentedTabs` uses.
    <View
      style={[
        styles.root,
        {
          width: config.width * scale,
          height: config.height * scale,
          borderRadius: config.radius * scale,
          borderWidth: theme.borderWidth.base,
        },
        style,
      ]}
      accessible
      accessibilityLabel={cardSpokenName(card, t)}
      testID={testID}
      {...props}
    >
      <View style={{ position: 'absolute', left: rankLeft, top: rankTop }}>
        <RankIcon rank={card.rank} color={rankColor} size={config.rankIcon.size * scale} />
      </View>
      <View style={{ position: 'absolute', left: suitLeft, top: suitTop }}>
        <SuitIcon suit={card.suit} color={suitColor} size={config.suitIcon.size * scale} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    backgroundColor: theme.colors.component.neutral.rest,
    borderColor: theme.colors.border.neutral.subtle,
    variants: {
      // the fill and the border colour both change for the selected
      // variant — `lime/11` (`theme.colors.text.accent.low`), the same
      // lime the rank/suit glyphs above already draw and the grid's own
      // selected-cell label colour, so a selected card in the fan reads
      // as marked even at 40×62 in an overlapping arc, not only by its
      // fill. the border's own width never changes (see this component's
      // own comment above on why that leaves the icon-offset arithmetic
      // untouched).
      selected: {
        true: {
          backgroundColor: theme.colors.component.accent.selected,
          borderColor: theme.colors.text.accent.low,
        },
        false: {},
        default: {},
      },
    },
  },
}));
