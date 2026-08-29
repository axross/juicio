import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { cardLabel, type Card } from '../model/card';
import { FAN_CARD, PREVIEW_SLOT } from './card-fan-geometry';
import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';

export type PlayingCardSize = 'fan' | 'preview';

export type PlayingCardProps = {
  card: Card;
  /** the fan's 40×62 card, or the preview slot's 48×75 filled card — the two sizes docs/specs/hand-ranges.md's card picker draws. */
  size: PlayingCardSize;
  /** every dimension below is multiplied by this — the caller's own
   * layout scale (`card-fan-geometry.ts`'s `computeFanLayout` for the
   * fan, `1` for a preview slot's own fixed size), so this component
   * never reads the window itself. */
  scale: number;
  /** true once this card sits in a preview slot: drawn in the grid's own
   * selected language (lime fill, lime glyphs) rather than dimmed, per
   * the maintainer's "marked, not dimmed" call — a genuinely independent
   * two-state fact about this card, not one arm of `size`. */
  taken?: boolean;
  testID?: string;
};

const SIZE_CONFIG = {
  fan: FAN_CARD,
  preview: PREVIEW_SLOT,
} as const;

/**
 * one playing card's face: presentational only, no gestures and no state
 * of its own — the card fan and the preview slots (run 4) both render
 * this, differing only in `size`, `scale`, and `taken`.
 */
export function PlayingCard({ card, size, scale, taken = false, testID }: PlayingCardProps) {
  const { theme } = useUnistyles();
  styles.useVariants({ taken });

  const config = SIZE_CONFIG[size];

  // the rank glyph is always this project's low-contrast neutral text
  // colour, whatever the suit — never `theme.suits.spades`, even though
  // the two happen to resolve to the same hex today (both are `olive
  // dark/11` — see docs/conventions/design-system.md's Suit Colours
  // table). the rank glyph does not vary by suit, so it is not a suit
  // colour; `text.neutral.low` is the role that is actually right, and
  // stays right even if a future design decouples the two.
  const rankColor = taken ? theme.colors.text.accent.low : theme.colors.text.neutral.low;
  const suitColor = taken ? theme.colors.text.accent.low : theme.suits[card.suit];

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
  const rankLeft = config.rankIcon.x * scale - theme.borderWidth.base;
  const rankTop = config.rankIcon.y * scale - theme.borderWidth.base;
  const suitLeft = config.suitIcon.x * scale - theme.borderWidth.base;
  const suitTop = config.suitIcon.y * scale - theme.borderWidth.base;

  return (
    <View
      style={[
        styles.root,
        {
          width: config.width * scale,
          height: config.height * scale,
          borderRadius: config.radius * scale,
          borderWidth: theme.borderWidth.base,
        },
      ]}
      accessible
      accessibilityLabel={cardLabel(card)}
      testID={testID}
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
      // only the fill changes for the taken variant — the border keeps
      // its usual neutral colour, since the design's own "marked, not
      // dimmed" language names just the fill and the label as lime.
      taken: {
        true: { backgroundColor: theme.colors.component.accent.selected },
        false: {},
        default: {},
      },
    },
  },
}));
