import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet as RNStyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Line, Svg } from 'react-native-svg';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { motionColor } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import type { Card } from '@/shared/model/card';
import { FAN_CARD, PREVIEW_SLOT } from '@/shared/ui/card-fan-geometry';
import { cardSpokenName, unavailableCardAccessibilityLabel } from '@/shared/ui/card-spoken-name';

import { RankIcon } from './icons/rank-icon';
import { SuitIcon } from './icons/suit-icon';

export type PlayingCardVariant = 'corner' | 'stacked';

/** one variant's own proportional geometry — every value a fraction of
 * this component's own rendered box, rather than a fixed pixel: `x` and
 * `size` are fractions of the rendered width, `y` is a fraction of the
 * rendered height, and `radius` is a fraction of the rendered width. This
 * is what lets the same geometry describe a card at any width/height a
 * caller's `style` gives it (`resolveBox` below), not only the one pixel
 * size the design measured it at. `aspectRatio` (width / height) is used
 * only to derive whichever one dimension a caller's `style` omits. */
type VariantGeometry = {
  readonly aspectRatio: number;
  readonly radius: number;
  readonly rankIcon: { readonly size: number; readonly x: number; readonly y: number };
  readonly suitIcon: { readonly size: number; readonly x: number; readonly y: number };
};

/** turns one of `card-fan-geometry.ts`'s own pixel-measured size configs
 * into the fraction-based `VariantGeometry` above, so this component's own
 * two variants stay derived from that module's single measured source
 * (`FAN_CARD`, `PREVIEW_SLOT`) rather than a second, hand-copied set of the
 * same pixel figures. */
function variantGeometryFrom(config: {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly rankIcon: { readonly size: number; readonly x: number; readonly y: number };
  readonly suitIcon: { readonly size: number; readonly x: number; readonly y: number };
}): VariantGeometry {
  return {
    aspectRatio: config.width / config.height,
    radius: config.radius / config.width,
    rankIcon: {
      size: config.rankIcon.size / config.width,
      x: config.rankIcon.x / config.width,
      y: config.rankIcon.y / config.height,
    },
    suitIcon: {
      size: config.suitIcon.size / config.width,
      x: config.suitIcon.x / config.width,
      y: config.suitIcon.y / config.height,
    },
  };
}

const GEOMETRY: Record<PlayingCardVariant, VariantGeometry> = {
  // rank/suit icons independently offset from the card's own top-left
  // corner — today's fan card (`card-fan-geometry.ts`'s `FAN_CARD`, this
  // variant's one call site, `../cards-pane/cards-pane.tsx`'s `FanCard`).
  corner: variantGeometryFrom(FAN_CARD),
  // rank above suit, centred as one column — today's preview slot
  // (`card-fan-geometry.ts`'s `PREVIEW_SLOT`), the proportions this
  // project standardized the merged `stacked` variant on once `preview`
  // and `holeCardsPreview` turned out not to share one formula (see
  // issue #299's own Background).
  stacked: variantGeometryFrom(PREVIEW_SLOT),
};

/** resolves this component's own concrete rendered width and height from
 * whatever its caller supplied through `style` — both dimensions, or just
 * one, with the variant's own `aspectRatio` filling in whichever is
 * missing. Reads `style` directly rather than measuring the rendered box
 * (`onLayout`): every call site gives at least one dimension as a plain
 * number, so this is available on the very first render, with no
 * measure-then-repaint flash — and `onLayout` never fires at all under
 * this project's own test renderer (docs/conventions/testing.md), which a
 * measurement-based approach would leave with no icons to assert against. */
function resolveBox(
  style: ComponentProps<typeof Animated.View>['style'],
  aspectRatio: number,
): { width: number; height: number } {
  const flat = RNStyleSheet.flatten(style) as { width?: unknown; height?: unknown } | undefined;
  const width = typeof flat?.width === 'number' ? flat.width : undefined;
  const height = typeof flat?.height === 'number' ? flat.height : undefined;
  if (width !== undefined && height !== undefined) {
    return { width, height };
  }
  if (width !== undefined) {
    return { width, height: width / aspectRatio };
  }
  if (height !== undefined) {
    return { width: height * aspectRatio, height };
  }
  // every known call site supplies at least one dimension; this is a
  // defensive fallback for a caller that supplies neither, not a shape any
  // of them takes today.
  return { width: 0, height: 0 };
}

/**
 * one playing card's face: presentational only, no gestures and no state
 * of its own — the card fan, the preview slots, and the players list
 * row's own hole-cards preview all render this, differing only in
 * `variant`, `selected`, `unavailable`, `animateEntrance`, and `rankTone`,
 * and in the width/height each caller's own `style` gives it.
 */
export function PlayingCard({
  card,
  variant,
  selected = false,
  unavailable = false,
  animateEntrance = false,
  rankTone = 'low',
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  card: Card;
  /** which rank/suit layout this card renders — `'corner'` (the fan's own
   * top-left-aligned rank and suit, `card-fan-geometry.ts`'s `FAN_CARD`
   * proportions) or `'stacked'` (rank centred above suit in one column,
   * `PREVIEW_SLOT`'s proportions) — never which pixel size or which
   * caller uses it; that comes from `style.width`/`style.height` below. */
  variant: PlayingCardVariant;
  /** true once this card's face should render in the grid's selected
   * language (lime fill, lime border, lime glyphs) rather than dimmed, per
   * the maintainer's "marked, not dimmed" call — a genuinely independent
   * two-state fact about this card, not one arm of `variant`. named for what
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
   * (`text.neutral.low`, this component's long-standing default, what
   * every `'stacked'`-variant call site but one, and every `'corner'`
   * one, draws) or `'high'` (`text.neutral.high`), which only
   * `../hole-cards-preview/hole-cards-preview.tsx`'s players list row
   * preview passes (docs/specs/equity-analysis.md's Player Kinds — a
   * measured departure from every other call site).
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

  const geometry = GEOMETRY[variant];
  const { width: cardWidth, height: cardHeight } = resolveBox(style, geometry.aspectRatio);

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
    // see `../bottom-sheet/bottom-sheet.tsx`'s own reset effect for the same
    // reasoning.
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
  // encoded above as fractions of this card's own rendered box — need the
  // actual rendered border width subtracted before they're usable.
  // skipping that puts every card's contents +1 design unit off in both
  // axes, measured against the design's export.
  //
  // `theme.borderWidth.base` is deliberately never scaled with the rest of
  // this card's geometry: it's a hairline, and a hairline that scaled
  // below 1px would render inconsistently across densities (rounding to 0
  // on some, surviving on others) rather than staying the crisp
  // single-pixel line the design intends at every size. that leaves it
  // dimensionally fixed while every offset around it *is* scaled with the
  // card's own rendered box, so the two can't be combined before scaling
  // without mixing units — the border has to come off each offset only
  // after it's derived from `cardWidth`/`cardHeight`, which is why each
  // line below reads `geometry.* * card*` first and subtracts the raw
  // border second.
  //
  // unaffected by the selected variant's own border colour (`styles.root`'s
  // `variants.selected` below): every card already draws a
  // `theme.borderWidth.base`-wide border unconditionally, selected or
  // not — only the colour changes, never the width — so the icon offsets
  // below need no selected-specific case.
  const rankLeft = geometry.rankIcon.x * cardWidth - theme.borderWidth.base;
  const rankTop = geometry.rankIcon.y * cardHeight - theme.borderWidth.base;
  const suitLeft = geometry.suitIcon.x * cardWidth - theme.borderWidth.base;
  const suitTop = geometry.suitIcon.y * cardHeight - theme.borderWidth.base;
  const rankIconSize = geometry.rankIcon.size * cardWidth;
  const suitIconSize = geometry.suitIcon.size * cardWidth;
  const borderRadius = geometry.radius * cardWidth;

  return (
    // `style` merged last, after this component's computed size, so a
    // caller extending it doesn't wipe the width/height/radius above —
    // even though those are themselves resolved from this same `style`
    // prop (`resolveBox`), re-merging the caller's own object last still
    // matters: it is what lets a caller's other style entries (`position`,
    // `transform`, and the rest) reach this root at all; every other rest
    // prop spreads after `testID`, same ordering `SegmentedTabs` uses.
    <Animated.View
      style={[
        styles.root,
        {
          width: cardWidth,
          height: cardHeight,
          borderRadius,
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
        <RankIcon rank={card.rank} color={rankColor} size={rankIconSize} />
      </View>
      <View style={{ position: 'absolute', left: suitLeft, top: suitTop }}>
        <SuitIcon suit={card.suit} color={suitColor} size={suitIconSize} />
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
