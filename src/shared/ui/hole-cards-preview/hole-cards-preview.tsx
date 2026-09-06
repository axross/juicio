import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { CardPair } from '../../model/card-pair';
import { PREVIEW_SLOT } from '../card-fan-geometry';
import { PlayingCard } from '../playing-card/playing-card';

// the preview's own native (unscaled) layout — Figma node `128:18457`,
// 80 wide × 64.639 tall. `CARD_BOUNDING_BOX_WIDTH` is each card's own
// *post-rotation* bounding box width, not `CARD_NATIVE_WIDTH` below (40):
// Figma's auto layout sizes a rotated child by its rotated bounding box,
// not its unrotated one, which is why the left card's own
// `margin-right: -8.455` produces an exact 80-wide assembly
// (`44.227 - 8.455 + 44.227 = 80`) rather than the smaller sum the
// unrotated 40-wide boxes would give. this module reproduces that
// measured 44.227 directly — the same "faithful reproduction is the
// default" rule every other measured value in this feature follows —
// rather than re-deriving it from `CARD_NATIVE_WIDTH`'s own
// rotated-rectangle trigonometry at render time; a rotated 40×62
// rectangle at ±4° does independently work out to a 44.227×64.639
// bounding box (`width·cos θ + height·sin θ`, `width·sin θ + height·cos
// θ`), which is offered here only as a check on the measured figure, not
// as this module's own source of it.
const NATIVE_WIDTH = 80;
const NATIVE_HEIGHT = 64.639;
const CARD_ROTATION_DEG = 4;
const CARD_BOUNDING_BOX_WIDTH = 44.227;
// each (unrotated) card's own native width, at this preview's own 80-wide
// assembly scale — independent of `'stacked'`'s own aspect ratio
// (`../playing-card/playing-card.tsx`, derived from `PREVIEW_SLOT` below),
// which this component's own `cardHeight` derives from instead, so a
// caller's rendered card width stays exactly this figure regardless of
// what that ratio is.
const CARD_NATIVE_WIDTH = 40;

/**
 * an exact holding's own two-card preview (docs/specs/equity-analysis.md's
 * Player Kinds) — two `PlayingCard`s at the `'stacked'` variant, rotated
 * ∓4° about their own centres, positioned so the pair spans exactly this
 * component's own rendered width.
 *
 * **absolutely positioned from each card's own centre, not a flex row with
 * a negative margin.** a flex row's negative margin shifts a *sibling's*
 * layout position by the margin's own value against the row's normal,
 * unrotated flow — it does not reproduce Figma's own auto-layout
 * semantics, which size a rotated child by its rotated bounding box
 * (`CARD_BOUNDING_BOX_WIDTH` above). computing each card's centre
 * directly from that measured bounding box, the way this component does,
 * is what actually reproduces the design's own 80-wide (64 at this row's
 * own scale) assembly — a flex-row-plus-margin version would visually
 * undershoot it by roughly each card's own rotation-induced growth.
 *
 * **scaled by `size`, not a fixed 0.8.** `size` is the caller's own
 * rendered width — this project's one caller today
 * (`../../../features/evaluations/ui/player-row/player-row.tsx`) passes
 * `64`, the row's own 64-wide
 * preview column — and every dimension below derives its scale as
 * `size / NATIVE_WIDTH` (64 / 80 = 0.8, the design's own derived figure —
 * see docs/specs/equity-analysis.md's own note on why 0.8 is inferred,
 * not measured directly), rather than hardcoding that one caller's own
 * value.
 *
 * each `PlayingCard` renders `accessible={false}`: this component's own
 * caller already carries one accessibility label describing the whole
 * holding (`player-row.tsx`), so a screen reader has no use for two
 * further, separately-announced card stops beneath it — the same
 * decorative-composite reasoning `../rank-pair-grid/rank-pair-grid.tsx`'s
 * own doc comment gives for hiding *its* 169 cells.
 */
export function HoleCardsPreview({
  holeCards,
  size,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  holeCards: CardPair;
  /** the rendered width; height follows from the design's own aspect
   * ratio (`NATIVE_HEIGHT / NATIVE_WIDTH`). */
  size: number;
  testID?: string;
}) {
  const scale = size / NATIVE_WIDTH;
  const cardWidth = CARD_NATIVE_WIDTH * scale;
  // derived from `PREVIEW_SLOT`'s own aspect ratio, not a locally-held
  // ratio of this component's own — `'stacked'` (`../playing-card/
  // playing-card.tsx`) derives its own rendered height from `cardWidth`
  // the identical way, so the two agree without either importing the
  // other's geometry.
  const cardHeight = cardWidth / (PREVIEW_SLOT.width / PREVIEW_SLOT.height);
  const leftCenterX = (CARD_BOUNDING_BOX_WIDTH / 2) * scale;
  const rightCenterX = (NATIVE_WIDTH - CARD_BOUNDING_BOX_WIDTH / 2) * scale;
  const centerY = (NATIVE_HEIGHT / 2) * scale;

  return (
    // `size` (the caller's own rendered width) and `NATIVE_HEIGHT * scale`
    // (its derived height) are this component's own design-fixed intrinsic
    // dimensions, per docs/conventions/component-styling.md's "A
    // Design-Fixed Intrinsic Dimension Stays With the Component" rule —
    // `NATIVE_HEIGHT` and `NATIVE_WIDTH` above are the sourced constants
    // this scales from; see their own comment for where 80×64.639 comes
    // from (Figma node `128:18457`).
    <View
      style={[styles.root, { width: size, height: NATIVE_HEIGHT * scale }, style]}
      testID={testID}
      {...props}
    >
      <PlayingCard
        card={holeCards.first}
        variant="stacked"
        rankTone="high"
        accessible={false}
        style={{
          position: 'absolute',
          width: cardWidth,
          left: leftCenterX - cardWidth / 2,
          top: centerY - cardHeight / 2,
          transform: [{ rotate: `-${CARD_ROTATION_DEG}deg` }],
        }}
        testID={testID ? 'first-card' : undefined}
      />
      <PlayingCard
        card={holeCards.second}
        variant="stacked"
        rankTone="high"
        accessible={false}
        style={{
          position: 'absolute',
          width: cardWidth,
          left: rightCenterX - cardWidth / 2,
          top: centerY - cardHeight / 2,
          transform: [{ rotate: `${CARD_ROTATION_DEG}deg` }],
        }}
        testID={testID ? 'second-card' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  root: {
    // anchors this component's own two absolutely-positioned `PlayingCard`s
    // below, each positioned from its own centre — not a placement choice
    // about where this component itself sits among its siblings, per
    // docs/conventions/component-styling.md's "A Positioning Context for a
    // Component's Own Children Is Not Placement" rule.
    position: 'relative',
  },
}));
