import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Line, Svg } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { motionColor } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import type { Card } from '@/shared/model/card';
import { FAN_CARD, HOLE_CARDS_PREVIEW_CARD, PREVIEW_SLOT } from '@/shared/ui/card-fan-geometry';
import { cardSpokenName, unavailableCardAccessibilityLabel } from '@/shared/ui/card-spoken-name';

import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';

export type PlayingCardSize = 'fan' | 'preview' | 'holeCardsPreview';

const SIZE_CONFIG = {
  fan: FAN_CARD,
  preview: PREVIEW_SLOT,
  holeCardsPreview: HOLE_CARDS_PREVIEW_CARD,
} as const;

/**
 * one playing card's face: presentational only, no gestures and no state
 * of its own — the card fan, the preview slots, and the players list
 * row's own hole-cards preview all render this, differing only in `size`,
 * `scale`, `selected`, `unavailable`, `animateEntrance`, and `rankTone`.
 */
export function PlayingCard({
  card,
  size,
  scale,
  selected = false,
  unavailable = false,
  animateEntrance = false,
  rankTone = 'low',
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  card: Card;
  /** the fan's 40×62 card, the preview slot's 48×75 filled card, or the
   * players list row's own 40×62 hole-cards preview card
   * (`../hole-cards-preview/hole-cards-preview.tsx`) — the three sizes
   * this project draws a card face at. */
  size: PlayingCardSize;
  /** every dimension below is multiplied by this — the caller's own
   * layout scale (`card-fan-geometry.ts`'s `computeFanLayout` for the
   * fan, `1` for a preview slot's own fixed size), so this component
   * never reads the window itself. */
  scale: number;
  /** true once this card's face should render in the grid's selected
   * language (lime fill, lime border, lime glyphs) rather than dimmed, per
   * the maintainer's "marked, not dimmed" call — a genuinely independent
   * two-state fact about this card, not one arm of `size`. named for what
   * this component does with it — renders in the selected treatment — not
   * for what any particular caller means by it: `../cards-pane/
   * cards-pane.tsx`'s fan reads this as "this card already sits in a
   * preview slot," but `PlayingCard` itself has no idea a slot exists; it
   * only renders whatever `selected` it's handed.
   * `../selection-grid/selection-grid.tsx`'s grid cell
   * carries the identical name for the identical reason. */
  selected?: boolean;
  /** true once this card is spoken for elsewhere — the board, or another
   * player's own exact holding (`@/features/evaluations/model/
   * unavailable-cards.ts`) — and therefore cannot be picked at all. this
   * project's own design exhibit's option A3: the whole card dims, and a
   * hairline diagonal rule draws corner to corner across its face (see
   * `styles.root`'s own `unavailable` variant and the `Svg`/`Line` below).
   * per docs/conventions/design-system.md's non-functional requirement,
   * neither carries the meaning alone — this component's own
   * `accessibilityLabel` names the card unavailable
   * (`unavailableCardAccessibilityLabel`) and `accessibilityState.disabled`
   * is set too, so the state survives without colour or the mark. never
   * both `true` alongside `selected` in practice — `../cards-pane/
   * cards-pane.tsx`'s own `FanArc` keeps the two mutually exclusive before
   * either reaches here — but this component does not itself assume that:
   * `selected`'s own colours still take precedence below on the rare
   * chance both arrive true. */
  unavailable?: boolean;
  /** true once this card's own *mount* should fade its fill and border in
   * from an empty slot's own look, rather than appearing already opaque —
   * "a card landing in a slot." defaults to `false`: the fan mounts all
   * thirteen cards per arc at once, and animating every one of those in
   * would read as a burst, not a landing — only `../cards-pane/cards-pane.tsx`'s
   * `PreviewSlot` passes `true`, where a mount genuinely means one card
   * just got picked. `styles.root`'s own `selected` variant still owns
   * every *other* fill/border change (an already-mounted card's `selected`
   * flipping) — this prop only ever touches the one transition at mount,
   * see the effect below. */
  animateEntrance?: boolean;
  /** the rank glyph's own unselected-state colour — `'low'`
   * (`text.neutral.low`, this component's long-standing default, what the
   * fan and the preview slot both draw) or `'high'` (`text.neutral.high`),
   * which only `../hole-cards-preview/hole-cards-preview.tsx`'s players
   * list row preview passes (docs/specs/equity-analysis.md's Player
   * Kinds — a measured departure from the other two sizes).
   * still never suit-dependent — see the `rankColor` comment below on why
   * the rank glyph doesn't vary by suit; this is a second, independent
   * axis a caller controls, not a change to that rule. ignored whenever
   * `selected` is `true`, same as every other unselected-state colour
   * this component computes. */
  rankTone?: 'low' | 'high';
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('handRanges');
  const reduceMotion = usePrefersReducedMotion();
  styles.useVariants({ selected, unavailable });

  const config = SIZE_CONFIG[size];

  const targetFill = selected
    ? theme.colors.component.accent.selected
    : theme.colors.component.neutral.rest;
  const targetBorderColor = selected
    ? theme.colors.text.accent.low
    : theme.colors.border.neutral.subtle;
  // seeded to the *empty slot's* own look — a transparent fill and its
  // dashed border's colour — so the very first frame already shows what
  // this card is fading in from, rather than a flash of `targetFill`
  // before the entrance effect below has run. unused whenever
  // `animateEntrance` is `false` — `styles.root`'s own `selected` variant
  // draws the card in that case, per this component's own doc comment.
  const entranceFill = useSharedValue(animateEntrance ? 'transparent' : targetFill);
  const entranceBorderColor = useSharedValue(
    animateEntrance ? theme.colors.border.neutral.unselectedControl : targetBorderColor,
  );
  const hasAnimatedEntrance = useRef(false);

  useEffect(() => {
    if (!animateEntrance) {
      return;
    }
    if (!hasAnimatedEntrance.current) {
      // this card's own first appearance — the one transition
      // `animateEntrance` exists for.
      hasAnimatedEntrance.current = true;
      entranceFill.value = motionColor(targetFill, reduceMotion);
      entranceBorderColor.value = motionColor(targetBorderColor, reduceMotion);
      return;
    }
    // a later `selected` change on an already-mounted, animated-entrance
    // card (none exists yet — `PreviewSlot` never passes `selected` —
    // but this keeps the fallback correct rather than silently frozen at
    // whatever `targetFill` this card mounted with).
    entranceFill.value = targetFill;
    entranceBorderColor.value = targetBorderColor;
    // `entranceFill`/`entranceBorderColor` are stable shared-value refs —
    // see `../bottom-sheet/bottom-sheet.tsx`'s own
    // reset effect for the same reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateEntrance, targetFill, targetBorderColor, reduceMotion]);

  const animatedEntranceStyle = useAnimatedStyle(() => ({
    backgroundColor: entranceFill.value,
    borderColor: entranceBorderColor.value,
  }));

  // the rank glyph is never `theme.suits.s`, even though that and
  // `text.neutral.low` happen to resolve to the same hex today (both
  // `olive dark/11` — see docs/conventions/design-system.md's Suit
  // Colours table): the rank glyph doesn't vary by suit, so it isn't a
  // suit colour, and stays that way even if a future design decouples the
  // two. it does vary by `rankTone` — `'low'`
  // (`text.neutral.low`, this component's original, and still every
  // caller's, default) or `'high'` (`text.neutral.high`, only the
  // hole-cards preview's own measured departure) — which is a second,
  // independent axis from suit, not a reopening of the "doesn't vary by
  // suit" rule above.
  const rankColor = selected
    ? theme.colors.text.accent.low
    : rankTone === 'high'
      ? theme.colors.text.neutral.high
      : theme.colors.text.neutral.low;
  const suitColor = selected ? theme.colors.text.accent.low : theme.suits[card.suit];

  // a border insets an absolutely-positioned child by its own width (in
  // React Native exactly as on the web), so the design's own offsets —
  // encoded above unchanged, in `card-fan-geometry.ts` — need the actual
  // rendered border width subtracted before they're usable. skipping that
  // puts every card's contents +1 design unit off in both axes, measured
  // against the design's export.
  //
  // `theme.borderWidth.base` is deliberately never multiplied by `scale`:
  // it's a hairline, and a hairline that scaled below 1px would render
  // inconsistently across densities (rounding to 0 on some, surviving on
  // others) rather than staying the crisp single-pixel line the design
  // intends at every size. that leaves it dimensionally unscaled while
  // every offset around it *is* scaled, so the two can't be combined
  // before scaling without mixing units — the border has to come off each
  // design-unit offset only after that offset is scaled, which is why
  // each line below reads `* scale` first and subtracts the raw border
  // second.
  //
  // unaffected by the selected variant's own border colour (`styles.root`'s
  // `variants.selected` below): every card already draws a
  // `theme.borderWidth.base`-wide border unconditionally, selected or
  // not — only the colour changes, never the width — so the icon offsets
  // below need no selected-specific case.
  const rankLeft = config.rankIcon.x * scale - theme.borderWidth.base;
  const rankTop = config.rankIcon.y * scale - theme.borderWidth.base;
  const suitLeft = config.suitIcon.x * scale - theme.borderWidth.base;
  const suitTop = config.suitIcon.y * scale - theme.borderWidth.base;
  const cardWidth = config.width * scale;
  const cardHeight = config.height * scale;

  return (
    // `style` merged last, after this component's computed size, so a
    // caller extending it doesn't wipe the scaled width/height/radius
    // above; every other rest prop spreads after `testID`, same ordering
    // `SegmentedTabs` uses.
    <Animated.View
      style={[
        styles.root,
        {
          width: cardWidth,
          height: cardHeight,
          borderRadius: config.radius * scale,
          borderWidth: theme.borderWidth.base,
        },
        // only merged when `animateEntrance` is set — see this
        // component's own doc comment on `animateEntrance` for why
        // `styles.root`'s `selected` variant must stay the one thing
        // driving fill/border otherwise: this shared value never updates
        // on its own for a card that never mounts with `animateEntrance`.
        animateEntrance ? animatedEntranceStyle : null,
        style,
      ]}
      accessible
      accessibilityLabel={
        unavailable ? unavailableCardAccessibilityLabel(card, t) : cardSpokenName(card, t)
      }
      // per docs/conventions/design-system.md's non-functional
      // requirement, `unavailable` must not be signalled by colour or the
      // slash below alone — this is the programmatic half, alongside the
      // label above; the whole-card dim is `styles.root`'s own
      // `unavailable` variant.
      accessibilityState={{ disabled: unavailable }}
      testID={testID}
      {...props}
    >
      <View style={{ position: 'absolute', left: rankLeft, top: rankTop }}>
        <RankIcon rank={card.rank} color={rankColor} size={config.rankIcon.size * scale} />
      </View>
      <View style={{ position: 'absolute', left: suitLeft, top: suitTop }}>
        <SuitIcon suit={card.suit} color={suitColor} size={config.suitIcon.size * scale} />
      </View>
      {
        // option A3's hairline slash — corner to corner, drawn last so it
        // sits over the rank/suit glyphs, matching the design exhibit's
        // own `.card.slashed::after` layering. dims together with the rest
        // of the card through `styles.root`'s own `unavailable` variant
        // opacity, since it's a plain descendant of that dimmed root
        // rather than a sibling with opacity of its own.
        unavailable ? (
          <Svg
            width={cardWidth}
            height={cardHeight}
            viewBox={`0 0 ${cardWidth} ${cardHeight}`}
            style={{ position: 'absolute', left: 0, top: 0 }}
            pointerEvents="none"
            // a non-root child's own local testID, per
            // docs/conventions/component-contracts.md — never built by
            // concatenating the received `testID`, and only set at all
            // once a caller opted into test hooks by supplying one, the
            // same conditional `CardsPane`'s own non-root children use.
            testID={testID ? 'unavailable-slash' : undefined}
          >
            <Line
              x1={0}
              y1={cardHeight}
              x2={cardWidth}
              y2={0}
              stroke={theme.colors.text.neutral.low}
              strokeWidth={theme.borderWidth.hairline}
              strokeLinecap="round"
            />
          </Svg>
        ) : null
      }
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    backgroundColor: theme.colors.component.neutral.rest,
    borderColor: theme.colors.border.neutral.subtle,
    variants: {
      // the fill and border colour both change for the selected variant —
      // `lime/11` (`theme.colors.text.accent.low`), the same lime the
      // rank/suit glyphs above draw and the grid's own selected-cell label
      // colour, so a selected card in the fan reads as marked even at
      // 40×62 in an overlapping arc, not only by its fill. the border's
      // width never changes (see this component's comment above on why
      // that leaves the icon-offset arithmetic untouched).
      selected: {
        true: {
          backgroundColor: theme.colors.component.accent.selected,
          borderColor: theme.colors.text.accent.low,
        },
        false: {},
        default: {},
      },
      // option A3 (this project's own design exhibit): the whole card
      // dims — 0.5, the exhibit's own `.card.slashed` opacity, reproduced
      // faithfully rather than picked — alongside the diagonal slash the
      // component's own render body draws as a child, which dims with it
      // rather than carrying an opacity of its own (see that comment).
      // never combined with `selected` in practice (`../cards-pane/
      // cards-pane.tsx`'s `FanArc` keeps the two mutually exclusive before
      // either reaches here), so this variant's own colours never have to
      // out-rank `selected`'s.
      unavailable: {
        true: {
          opacity: 0.5,
        },
        false: {},
        default: {},
      },
    },
  },
}));
