/**
 * the fanned card picker's geometry: the design's own measured constants
 * (transcribed from the scratchpad's `fan-geometry.ts`, verified against
 * Figma file `vkZzv1l45PBcVi5Wp92Eqg`, node `98:7317`, and its 399×88 PNG
 * export), plus a pure layout function, a hit test, and a skip rule over
 * them. no React, no gestures — this module only computes numbers, so a
 * future gesture handler can call it without pulling in any rendering
 * concern.
 */
import { SIDE_PADDING } from '@/shared/ui/bottom-sheet/bottom-sheet';

/** the fan card — icon offsets are relative to the card's own top-left corner. */
export const FAN_CARD = {
  width: 40,
  height: 62,
  radius: 6,
  borderWidth: 1,
  rankIcon: { size: 16, x: 3, y: 5 },
  suitIcon: { size: 12, x: 5, y: 26 },
} as const;

/** the preview slot's filled card — icon offsets are relative to the card's own top-left corner. */
export const PREVIEW_SLOT = {
  width: 48,
  height: 75,
  radius: 8,
  borderWidth: 1,
  gap: 16,
  rankIcon: { size: 30, x: 9, y: 8 },
  suitIcon: { size: 24, x: 12, y: 43 },
} as const;

/**
 * the arc frame's design-export dimensions — 399×88, the coordinate system
 * `FAN_CARDS`' own centres and `computeFanLayout`'s per-card output are
 * expressed in. `frameWidth` is not what `computeFanLayout` scales against
 * (see that function's own doc comment for why); it instead serves as the
 * arc's own touch-gesture bounding box and vertical pitch reference — the
 * shape neither of those needs to change for docs/specs/hand-ranges.md's
 * own outer-margin rule to hold.
 */
export const FAN_ARC = {
  frameWidth: 399,
  frameHeight: 88.0,
  // four arcs, spades to clubs (`../model/card.ts`'s `SUITS` order),
  // stacked at this pitch inside a 325.205-tall frame — an 8-unit overlap,
  // not edge-to-edge (3 × 79.301 + 87.301 = 325.204).
  pitch: 79.301,
} as const;

/** one entry per card, in ascending rank order (`../model/card.ts`'s `RANKS`): 2 3 4 5 6 7 8 9 T J Q K A. */
const FAN_CARDS = [
  { centerX: 33.42, centerY: 52.16, rotation: -15.32 },
  { centerX: 59.07, centerY: 46.07, rotation: -12.51 },
  { centerX: 88.71, centerY: 40.01, rotation: -9.63 },
  { centerX: 116.31, centerY: 36.42, rotation: -6.93 },
  { centerX: 143.9, centerY: 33.82, rotation: -4.33 },
  { centerX: 171.96, centerY: 32.21, rotation: -1.83 },
  { centerX: 200.51, centerY: 32.59, rotation: 0.57 },
  { centerX: 229.04, centerY: 32.95, rotation: 2.87 },
  { centerX: 257.05, centerY: 35.3, rotation: 5.06 },
  { centerX: 285.05, centerY: 37.63, rotation: 7.17 },
  { centerX: 313.54, centerY: 41.95, rotation: 9.18 },
  { centerX: 341.52, centerY: 47.25, rotation: 11.1 },
  { centerX: 369.0, centerY: 52.53, rotation: 12.89 },
] as const;

export type FanCardLayout = {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
};

export type FanLayout = {
  readonly scale: number;
  /** the arc frame's own rendered width at this layout's scale — the
   * touch-gesture bounding box `./cards-pane/cards-pane.tsx`'s `FanArc`
   * draws its `Gesture.Pan()` against, not a measure of where the visible
   * cards themselves end (see `offsetX` below for that). */
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** where the frame's own local origin (design x = 0) lands, in pixels,
   * relative to the fan's own container — `./cards-pane/cards-pane.tsx`'s
   * `FanArc` positions each arc's `left` at this. usually negative: the
   * frame is wider than the ink span it wraps (`INK_SPAN` below), so
   * anchoring the ink span's own left edge at `FAN_INNER_MARGIN` pulls the
   * frame's own origin outside the container on that side. */
  readonly offsetX: number;
  /** one entry per card, index 0..12, ascending rank — the same order `../model/card.ts`'s `RANKS` uses. */
  readonly cards: readonly FanCardLayout[];
};

/**
 * the horizontal span a card's rotated rectangle actually occupies —
 * rotating a rectangle about its own centre can push a corner further out
 * than its unrotated edge. exported for `computeFanLayout` below (which
 * calls it, at design scale, to build `INK_SPAN`) and for this module's own
 * test's "stays inside the frame" assertion.
 */
export function cardHorizontalExtent(card: FanCardLayout): { min: number; max: number } {
  const halfWidth = card.width / 2;
  const halfHeight = card.height / 2;
  const radians = (card.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // the four corners' x-offsets from the card's own centre, rotated.
  const cornerXOffsets = [
    -halfWidth * cos - -halfHeight * sin,
    halfWidth * cos - -halfHeight * sin,
    halfWidth * cos - halfHeight * sin,
    -halfWidth * cos - halfHeight * sin,
  ];
  return {
    min: card.centerX + Math.min(...cornerXOffsets),
    max: card.centerX + Math.max(...cornerXOffsets),
  };
}

/**
 * the fan's outermost cards must sit exactly this far from the *sheet's
 * own outer edge* at every width — screen edge, since the sheet renders at
 * the full screen width today.
 */
const OUTER_MARGIN = 16;

/**
 * what's left of `OUTER_MARGIN` once the sheet's own left/right chrome
 * padding (`./bottom-sheet/bottom-sheet.tsx`'s `SIDE_PADDING`, imported
 * rather than duplicated a fourth time — see `computeFanLayout`'s own doc
 * comment on why) already accounts for part of it — the actual clearance
 * `computeFanLayout` below leaves between the content box's own edge and
 * the ink span, on each side.
 */
const FAN_INNER_MARGIN = OUTER_MARGIN - SIDE_PADDING;

/**
 * the ink span — the leftmost card's leftmost rotated corner to the
 * rightmost card's rightmost one, in the arc's 399-wide design coordinate
 * system — computed once from `FAN_CARDS`/`FAN_CARD` via
 * `cardHorizontalExtent` above, rather than quoted by hand: this is a
 * value the design export describes but does not itself compute, and
 * `computeFanLayout` below scales against this instead of the 399-wide
 * frame directly (see that function's own doc comment for why).
 */
const INK_SPAN = FAN_CARDS.reduce(
  (span, card) => {
    const extent = cardHorizontalExtent({
      centerX: card.centerX,
      centerY: card.centerY,
      width: FAN_CARD.width,
      height: FAN_CARD.height,
      rotation: card.rotation,
    });
    return { min: Math.min(span.min, extent.min), max: Math.max(span.max, extent.max) };
  },
  { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
);

/**
 * given the width available to the fan (the sheet's content width, after
 * its own `SIDE_PADDING` is already stripped), returns the fan's
 * scale, its horizontal placement, and per card, its centre and rotation.
 *
 * **scales against the ink span (`INK_SPAN`), not the 399-wide frame.**
 * the frame carries the design's own asymmetric clearance around that span
 * (5.94 left, 3.59 right) — clearance meant to sit *inside* the sheet's own
 * side padding, not stack on top of it. scaling against the ink span and
 * placing it with `FAN_INNER_MARGIN` on each side fixes the total
 * clearance at exactly `OUTER_MARGIN` (16) from the sheet's own outer
 * edge, at every width — see this module's own test for the arithmetic.
 *
 * **does not change the arc's shape.** every card keeps its own design
 * rotation and its centre relative to every other card's — this only picks
 * an overall `scale` and a horizontal `offsetX` to place the whole arc at,
 * both applied uniformly.
 *
 * takes the sheet's **content** width — after the sheet's own
 * `SIDE_PADDING` — not the whole screen width, since that padding is
 * chrome and stays fixed at every device width.
 *
 * **imports `SIDE_PADDING` from `./bottom-sheet/bottom-sheet.tsx` rather
 * than duplicating it.** this project's usual rule for a fixed one-off
 * pixel value is to duplicate it (`hand-range-pane.tsx`'s
 * `CHIP_ROW_TO_GRID_GAP` is one example) — but `./cards-pane/cards-pane.tsx`
 * depends on this value computing *identically* to `bottom-sheet.tsx`'s
 * own panel padding, every render, with no `onLayout` guaranteed to catch
 * a drift between them (see that component's own doc comment). duplicating
 * a whole formula's input, where a future retune of one copy silently
 * breaks that guarantee, is the case DRY exists for — unlike a plain
 * numeral repeated because two unrelated surfaces happen to measure the
 * same, importing this one is worth the cross-module coupling.
 */
export function computeFanLayout(contentWidth: number): FanLayout {
  const inkSpanWidth = INK_SPAN.max - INK_SPAN.min;
  const scale = (contentWidth - FAN_INNER_MARGIN * 2) / inkSpanWidth;
  const offsetX = FAN_INNER_MARGIN - INK_SPAN.min * scale;
  return {
    scale,
    offsetX,
    frameWidth: FAN_ARC.frameWidth * scale,
    frameHeight: FAN_ARC.frameHeight * scale,
    cards: FAN_CARDS.map((card) => ({
      centerX: card.centerX * scale,
      centerY: card.centerY * scale,
      width: FAN_CARD.width * scale,
      height: FAN_CARD.height * scale,
      rotation: card.rotation,
    })),
  };
}

/**
 * the index of the card whose centre is nearest `x` — an O(13) scan against
 * each of the thirteen known centres, cheap enough for every touch or drag
 * frame.
 *
 * deliberately not `round((x - cx1) / step)` against one global mean step:
 * the centres are not perfectly evenly spaced, so a true nearest-centre
 * scan gives each interior card a hit band equal to its own two
 * neighbouring gaps' average — 27.6 to 28.6 design units against a 27.97
 * mean, a 3.7% spread — rather than a uniform band a fixed-step formula
 * would force regardless of where the centres actually sit. the two end
 * cards' bands are naturally unbounded on their outer side — an `x` beyond
 * every centre already resolves to index 0 or 12, so "clamped to 0…12"
 * needs no separate clamp step; against this arc, those bands run to the
 * frame's edges at 40.3 and 40.1 design units.
 *
 * also not a rotated-outline hit test: each card is partly covered by its
 * neighbour, so an outline test would give the topmost card (the ace) a
 * whole card's hit area and the covered ones a sliver.
 */
export function cardIndexAtX(x: number, layout: FanLayout): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.cards.length; index += 1) {
    const distance = Math.abs(x - layout.cards[index].centerX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

/**
 * resolves a touch or drag position to the nearest untaken card in this arc
 * (`takenIndices` excluded), for the card/range input sheet's touch-and-pan
 * picker. reapplies `cardIndexAtX`'s own "nearest centre by real distance"
 * rule over the untaken cards, rather than hopping outward by index from
 * the plain hit-test result: an index hop of 1 isn't "the next-nearest
 * card" once a taken card sits between two untaken ones with uneven gaps
 * (see `cardIndexAtX`'s doc comment on why gaps vary).
 *
 * an exact distance tie resolves to the lower index — a fixed,
 * deterministic choice, since nothing here carries the drag's direction to
 * break the tie with instead.
 *
 * returns `null` when every card is already taken: the caller has nothing
 * to move a drag's ghost card to, and an arbitrary "closest taken" index
 * would let a drag land on a card the sheet doesn't actually let it
 * select.
 */
export function nearestSelectableCardIndex(
  x: number,
  layout: FanLayout,
  takenIndices: ReadonlySet<number>,
): number | null {
  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.cards.length; index += 1) {
    if (takenIndices.has(index)) {
      continue;
    }
    const distance = Math.abs(x - layout.cards[index].centerX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return nearestIndex;
}
