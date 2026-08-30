import {
  cardHorizontalExtent,
  cardIndexAtX,
  computeFanLayout,
  nearestSelectableCardIndex,
  FAN_ARC,
  FAN_CARD,
  type FanLayout,
} from './card-fan-geometry';

// the sheet's content width at each device width: the screen minus the
// sheet's own 14.5 side padding, which is chrome and does not scale —
// duplicated from `../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
// `SIDE_PADDING` and from `card-fan-geometry.ts`'s own private
// `SHEET_SIDE_PADDING`, the same one-off-constant convention both already
// take (see that file's own comment on why it isn't imported instead).
const SHEET_SIDE_PADDING = 14.5;
const DEVICE_WIDTHS = [360, 390, 393, 412, 430];
const TEST_WIDTHS = DEVICE_WIDTHS.map((width) => width - SHEET_SIDE_PADDING * 2);

/** the ink span's own extent, in a given layout's rendered pixels — the
 * leftmost card's leftmost rotated corner to the rightmost card's
 * rightmost one, across all thirteen cards. */
function inkSpanOf(layout: FanLayout): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const card of layout.cards) {
    const extent = cardHorizontalExtent(card);
    min = Math.min(min, extent.min);
    max = Math.max(max, extent.max);
  }
  return { min, max };
}

describe('computeFanLayout()', () => {
  // item 3 (PR #70, real-device feedback): the leftmost card's own left
  // edge and the rightmost card's own right edge must each sit exactly
  // 16px from the *sheet's* outer edge — screen edge, at this sheet's
  // current full-screen width — not from the arc's own 399-wide frame,
  // which carries its own asymmetric clearance around the ink span (5.94
  // left, 3.59 right) that used to land on top of `SHEET_SIDE_PADDING`
  // rather than inside it.
  it('places the ink span exactly 16px from the sheet’s own outer edge on both sides, at every device width', () => {
    const OUTER_MARGIN = 16;
    for (let index = 0; index < DEVICE_WIDTHS.length; index += 1) {
      const deviceWidth = DEVICE_WIDTHS[index];
      const contentWidth = TEST_WIDTHS[index];
      const layout = computeFanLayout(contentWidth);
      const inkSpan = inkSpanOf(layout);

      const leftMargin = SHEET_SIDE_PADDING + layout.offsetX + inkSpan.min;
      const rightMargin = deviceWidth - (SHEET_SIDE_PADDING + layout.offsetX + inkSpan.max);

      expect(leftMargin).toBeCloseTo(OUTER_MARGIN, 9);
      expect(rightMargin).toBeCloseTo(OUTER_MARGIN, 9);
    }
  });

  // a weaker, general safety net alongside the exact-16px test above: the
  // fan used to scale against the screen width rather than the content
  // box at all, which let it grow wider than the tab row above it at every
  // width below the 430 reference — a bug an exact-margin test at the
  // reference width alone would not have caught either, so this still
  // checks every tested width, not just one.
  it('never lets the ink span extend outside the content box it was given', () => {
    for (const width of TEST_WIDTHS) {
      const layout = computeFanLayout(width);
      const inkSpan = inkSpanOf(layout);
      expect(layout.offsetX + inkSpan.min).toBeGreaterThanOrEqual(0);
      expect(layout.offsetX + inkSpan.max).toBeLessThanOrEqual(width);
    }
  });

  it('returns all thirteen cards at every tested width', () => {
    for (const width of TEST_WIDTHS) {
      expect(computeFanLayout(width).cards).toHaveLength(13);
    }
  });

  // the scale is affine in the content width, not linear in it, so there is
  // no one "reference" width whose own scale is exactly 1 to compare
  // against (unlike before item 3: scaling against the ink span rather than
  // the 399-wide frame means the design's own 430-wide reference no longer
  // lands on scale 1 — see `card-fan-geometry.ts`'s own doc comment). the
  // invariant that still holds, checked here without leaning on any
  // particular width's scale, is that every length within one layout is
  // that layout's own scale times a design value constant across every
  // layout — each side normalises by its own `layout.scale` instead.
  it("multiplies every length by its own layout's scale, and leaves rotation alone", () => {
    const layouts = TEST_WIDTHS.map((width) => computeFanLayout(width));

    for (const layout of layouts) {
      expect(layout.frameWidth).toBeCloseTo(FAN_ARC.frameWidth * layout.scale, 10);
      expect(layout.frameHeight).toBeCloseTo(FAN_ARC.frameHeight * layout.scale, 10);
      for (const card of layout.cards) {
        expect(card.width).toBeCloseTo(FAN_CARD.width * layout.scale, 10);
        expect(card.height).toBeCloseTo(FAN_CARD.height * layout.scale, 10);
      }
    }

    // every layout's own `centerX / scale` recovers the same design value,
    // for every one of the thirteen cards — checked pairwise against the
    // first layout rather than against a hardcoded design constant, since
    // `FAN_CARDS` itself isn't exported.
    const [first, ...rest] = layouts;
    for (const layout of rest) {
      for (let index = 0; index < 13; index += 1) {
        expect(layout.cards[index].centerX / layout.scale).toBeCloseTo(
          first.cards[index].centerX / first.scale,
          10,
        );
        // rotation is an angle, not a length — it does not scale.
        expect(layout.cards[index].rotation).toBe(first.cards[index].rotation);
      }
    }
  });

  it("keeps every card's rotated horizontal extent inside the arc frame, at every tested width", () => {
    for (const width of TEST_WIDTHS) {
      const layout = computeFanLayout(width);
      for (const card of layout.cards) {
        const extent = cardHorizontalExtent(card);
        expect(extent.min).toBeGreaterThanOrEqual(0);
        expect(extent.max).toBeLessThanOrEqual(layout.frameWidth);
      }
    }
  });
});

describe('cardIndexAtX()', () => {
  // `401` no longer lands on `scale === 1` since item 3 (see
  // `card-fan-geometry.ts`'s own doc comment on why) — the hit-band test
  // below normalises its own measurements back to design units via
  // `layout.scale` rather than assuming this width's scale is 1.
  const layout = computeFanLayout(401);

  it("resolves each card's own centre to its own index", () => {
    layout.cards.forEach((card, index) => {
      expect(cardIndexAtX(card.centerX, layout)).toBe(index);
    });
  });

  it('resolves far below the first card and far above the last to the two end indices', () => {
    expect(cardIndexAtX(-1000, layout)).toBe(0);
    expect(cardIndexAtX(1000, layout)).toBe(12);
  });

  it('gives every interior card a hit band between 27.6 and 28.6 design units wide, against a 27.97 mean', () => {
    // an interior card's band is bounded by the midpoints with its two
    // neighbours — found here by scanning, the same "nearest centre"
    // computation cardIndexAtX itself does, so this test does not
    // hand-encode a second copy of the boundary formula.
    const boundaries: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const left = layout.cards[index].centerX;
      const right = layout.cards[index + 1].centerX;
      // bisect for the x where cardIndexAtX flips from index to index+1.
      let low = left;
      let high = right;
      for (let step = 0; step < 60; step += 1) {
        const mid = (low + high) / 2;
        if (cardIndexAtX(mid, layout) <= index) {
          low = mid;
        } else {
          high = mid;
        }
      }
      boundaries.push(high);
    }

    // normalised back to design units via this layout's own scale — see
    // this describe block's own comment on why `401` no longer means
    // `scale === 1`; the "27.6 to 28.6" figures below describe the design
    // export itself, not any one layout's rendered pixels.
    const interiorWidths = [];
    for (let index = 1; index <= 11; index += 1) {
      interiorWidths.push((boundaries[index] - boundaries[index - 1]) / layout.scale);
    }

    for (const width of interiorWidths) {
      expect(width).toBeGreaterThanOrEqual(27.5);
      expect(width).toBeLessThanOrEqual(28.7);
    }
    // the "27.97 mean" quoted for this arc is the *overall* step
    // across the whole arc — (last centre - first centre) / 12 — not the
    // average of the eleven interior band widths above (which is itself a
    // different, slightly higher number, ~28.09, since a band width
    // combines two unequal neighbouring gaps); the stated ~3.7% spread is
    // the interior bands' own range measured against that overall step.
    const overallStep = (layout.cards[12].centerX - layout.cards[0].centerX) / 12 / layout.scale;
    expect(overallStep).toBeCloseTo(27.965, 2);
    const spread = (Math.max(...interiorWidths) - Math.min(...interiorWidths)) / overallStep;
    expect(spread).toBeGreaterThan(0.03);
    expect(spread).toBeLessThan(0.04);
  });

  it('every x across the frame maps to exactly one card, in non-decreasing index order', () => {
    let previousIndex = cardIndexAtX(0, layout);
    expect(previousIndex).toBeGreaterThanOrEqual(0);
    for (let x = 0; x <= layout.frameWidth; x += 0.5) {
      const index = cardIndexAtX(x, layout);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(12);
      expect(index).toBeGreaterThanOrEqual(previousIndex);
      expect(index - previousIndex).toBeLessThanOrEqual(1);
      previousIndex = index;
    }
    expect(previousIndex).toBe(12);
  });
});

describe('nearestSelectableCardIndex()', () => {
  const layout = computeFanLayout(401);

  it('returns the plain hit-test index when that card is not taken', () => {
    const targetX = layout.cards[6].centerX;
    expect(nearestSelectableCardIndex(targetX, layout, new Set())).toBe(6);
  });

  it('skips to the nearer untaken neighbour when the hit-test card is taken', () => {
    const targetX = layout.cards[6].centerX;
    // card 7's own centre (229.04) is 28.53 design units from card 6's
    // centre; card 5's (171.96) is 28.55 away — marginally further, since
    // this arc's interior gaps are uneven (see the hit-band test above).
    // taking only card 6 should therefore skip forward to 7, the real
    // nearer neighbour, not to whichever index is numerically adjacent.
    expect(nearestSelectableCardIndex(targetX, layout, new Set([6]))).toBe(7);
  });

  it('skips past several taken neighbours to the next untaken one', () => {
    const targetX = layout.cards[6].centerX;
    expect(nearestSelectableCardIndex(targetX, layout, new Set([6, 7, 8]))).toBe(5);
  });

  it('breaks an exact distance tie toward the lower index', () => {
    // a synthetic, perfectly evenly-spaced layout, since the real arc's
    // uneven gaps never produce an exact tie: five cards 10 design units
    // apart. requesting the centre card (index 2, taken) with both its
    // neighbours free and exactly 10 away on either side is a genuine tie.
    const evenLayout: FanLayout = {
      scale: 1,
      offsetX: 0,
      frameWidth: 40,
      frameHeight: 40,
      cards: [0, 10, 20, 30, 40].map((centerX) => ({
        centerX,
        centerY: 0,
        width: 8,
        height: 8,
        rotation: 0,
      })),
    };
    expect(nearestSelectableCardIndex(20, evenLayout, new Set([2]))).toBe(1);
  });

  it('returns null when every card in the arc is already taken', () => {
    const everyIndex = new Set(Array.from({ length: 13 }, (_, index) => index));
    expect(nearestSelectableCardIndex(layout.cards[0].centerX, layout, everyIndex)).toBeNull();
  });

  it('returns null even when the requested position is nowhere near any card', () => {
    const everyIndex = new Set(Array.from({ length: 13 }, (_, index) => index));
    expect(nearestSelectableCardIndex(-500, layout, everyIndex)).toBeNull();
  });
});
