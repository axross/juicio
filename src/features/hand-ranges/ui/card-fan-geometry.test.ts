import {
  cardHorizontalExtent,
  cardIndexAtX,
  computeFanLayout,
  nearestSelectableCardIndex,
  type FanLayout,
} from './card-fan-geometry';

const TEST_WIDTHS = [360, 390, 393, 412, 430];

describe('computeFanLayout()', () => {
  it('scales linearly against the 430pt reference container width', () => {
    for (const width of TEST_WIDTHS) {
      const layout = computeFanLayout(width);
      expect(layout.scale).toBeCloseTo(width / 430, 10);
    }
  });

  it("is exactly 1.0000 at the design's own 430pt reference", () => {
    expect(computeFanLayout(430).scale).toBe(1);
  });

  it('returns all thirteen cards at every tested width', () => {
    for (const width of TEST_WIDTHS) {
      expect(computeFanLayout(width).cards).toHaveLength(13);
    }
  });

  it('scales the frame and every card dimension by the same factor', () => {
    const reference = computeFanLayout(430);
    const half = computeFanLayout(215);
    expect(half.frameWidth).toBeCloseTo(reference.frameWidth / 2, 10);
    for (let index = 0; index < 13; index += 1) {
      expect(half.cards[index].centerX).toBeCloseTo(reference.cards[index].centerX / 2, 10);
      expect(half.cards[index].width).toBeCloseTo(reference.cards[index].width / 2, 10);
      // rotation is an angle, not a length — it does not scale.
      expect(half.cards[index].rotation).toBe(reference.cards[index].rotation);
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
  const layout = computeFanLayout(430);

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

    const interiorWidths: number[] = [];
    for (let index = 1; index <= 11; index += 1) {
      interiorWidths.push(boundaries[index] - boundaries[index - 1]);
    }

    for (const width of interiorWidths) {
      expect(width).toBeGreaterThanOrEqual(27.5);
      expect(width).toBeLessThanOrEqual(28.7);
    }
    // the "27.97 mean" this run's brief quotes is the *overall* step
    // across the whole arc — (last centre - first centre) / 12 — not the
    // average of the eleven interior band widths above (which is itself a
    // different, slightly higher number, ~28.09, since a band width
    // combines two unequal neighbouring gaps); the stated ~3.7% spread is
    // the interior bands' own range measured against that overall step.
    const overallStep = (layout.cards[12].centerX - layout.cards[0].centerX) / 12;
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
  const layout = computeFanLayout(430);

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
