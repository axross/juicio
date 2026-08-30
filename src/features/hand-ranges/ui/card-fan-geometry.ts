/**
 * the fanned card picker's geometry: the design's own measured constants
 * (transcribed from the scratchpad's `fan-geometry.ts`, verified against
 * Figma file `vkZzv1l45PBcVi5Wp92Eqg`, node `98:7317`, and its 399×88 PNG
 * export), plus a pure layout function, a hit test, and a skip rule over
 * them. no React, no gestures — this module only computes numbers, so a
 * future gesture handler can call it without pulling in any rendering
 * concern.
 */

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
 * the arc frame's dimensions. `frameWidth` (399) is the ink span of its
 * thirteen cards (389.47) plus 5.94 clearance on the left and 3.59 on the
 * right; the frame sits 1 inside the sheet's content box on each side —
 * see `FRAME_INSET` below.
 */
export const FAN_ARC = {
  frameWidth: 399,
  frameHeight: 88.0,
  // four arcs, spades to clubs (`../model/card.ts`'s `SUITS` order),
  // stacked at this pitch inside a 325.205-tall frame — an 8-unit overlap,
  // not edge-to-edge (3 × 79.301 + 87.301 = 325.204).
  pitch: 79.301,
} as const;

/**
 * the clearance the arc frame leaves inside the sheet's content box, on
 * each side. the design nests the frame at x=1 within a content box that
 * starts 14.5 in from the sheet's edge, so the frame's outer edge sits 15.5
 * from the screen edge at every width — the same place the tab row and the
 * chips start, since the sheet's padding is chrome and doesn't scale.
 */
const FRAME_INSET = 1;

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
  /** the arc frame's own rendered width at this layout's scale. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** one entry per card, index 0..12, ascending rank — the same order `../model/card.ts`'s `RANKS` uses. */
  readonly cards: readonly FanCardLayout[];
};

/**
 * given the width available to the fan, returns its scale and, per card,
 * its centre and rotation. scales by the arc's 399-wide frame, never by
 * the 389.47 ink span of its thirteen cards — the frame already includes
 * the clearance on either side of that span, and scaling to the span
 * instead would make everything 2.45% too large (399 / 389.47).
 *
 * takes the sheet's **content** width — after the sheet's own 14.5 side
 * padding — not the whole screen width, since that padding is chrome and
 * stays fixed at every device width. scaling against the screen would let
 * the fan grow past the tab row above it: at 360 the content box is 331
 * while `399 * 360 / 430` is 334, a 1.5-unit overflow a test at the 430
 * reference alone would never catch.
 *
 * at the design's own reference the content box is `430 - 29 = 401`, the
 * frame takes 399, and `scale` is exactly `1.0000`.
 */
export function computeFanLayout(contentWidth: number): FanLayout {
  const scale = (contentWidth - FRAME_INSET * 2) / FAN_ARC.frameWidth;
  return {
    scale,
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
 * the horizontal span a card's rotated rectangle actually occupies —
 * rotating a rectangle about its own centre can push a corner further out
 * than its unrotated edge, which is what this module's own test's "stays
 * inside the frame" assertion checks against.
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
