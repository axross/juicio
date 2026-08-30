import { PixelRatio } from 'react-native';

import { darkTheme } from '@/core/theme/tokens';

import { ROW_HEIGHT } from './settings-row';

/**
 * every device density issue #76's background section names — the whole
 * numbers the symptom never shows at (1, 2, 3, 4) alongside the
 * non-integral ones it does (1.5, 2.625, 2.75, 3.5). Yoga rounds an edge
 * relative to the layout root rather than to its own card, so which of the
 * non-integral densities actually go uneven depends on where the card
 * itself sits on screen — the exact figures issue #76's own simulation
 * reports assume the design file's absolute layout, which this test does
 * not reproduce. What it asserts instead — see the tests below — is the
 * fix's own arithmetic property, checked at every density in this list:
 * once both the row height and the card gap are snapped, no starting
 * offset can reintroduce unevenness, because every value feeding the
 * cumulative sum is already a whole number of physical pixels.
 */
const DEVICE_DENSITIES = [1, 1.5, 2, 2.625, 2.75, 3, 3.5, 4];

const CARD_GAP = darkTheme.borderWidth.base;

/**
 * reproduces, in pure arithmetic, exactly what Yoga does to a column of
 * `rowCount` rows of `rowHeightDp` separated by `gapDp`: each row's top and
 * bottom edge is computed in dp from the top of the column, then each edge
 * is rounded onto the device's own physical pixel grid *independently* —
 * `Math.round(edgeDp * ratio)` — the same rounding rule
 * `PixelRatio.roundToNearestPixel` itself applies to a single value. The
 * physical-pixel gap between two consecutive rows is the distance between
 * the rounded edges bounding it, which is what a device actually renders.
 */
function roundedRowEdgesInPhysicalPixels(
  rowHeightDp: number,
  gapDp: number,
  rowCount: number,
  ratio: number,
): number[] {
  const edgesDp: number[] = [0];

  for (let row = 0; row < rowCount; row++) {
    edgesDp.push(edgesDp[edgesDp.length - 1] + rowHeightDp);

    if (row < rowCount - 1) {
      edgesDp.push(edgesDp[edgesDp.length - 1] + gapDp);
    }
  }

  return edgesDp.map((edgeDp) => Math.round(edgeDp * ratio));
}

/** every physical-pixel gap between one card's consecutive rows, read off
 * `roundedRowEdgesInPhysicalPixels`'s own edge sequence — `[top1, bottom1,
 * top2, bottom2, top3, bottom3]` for three rows, so the two inter-row gaps
 * sit at indices `(2,1)` and `(4,3)`. */
function consecutiveGapsInPhysicalPixels(edges: number[]): number[] {
  const gaps: number[] = [];

  for (let i = 1; i < edges.length - 1; i += 2) {
    gaps.push(edges[i + 1] - edges[i]);
  }

  return gaps;
}

describe('the Settings card row-height/gap pixel-grid snapping fix', () => {
  it.each(DEVICE_DENSITIES)(
    'snaps the row height and the card gap onto a whole number of physical pixels at density %s',
    (density) => {
      const getSpy = jest.spyOn(PixelRatio, 'get').mockReturnValue(density);

      try {
        const snappedHeight = PixelRatio.roundToNearestPixel(ROW_HEIGHT);
        const snappedGap = PixelRatio.roundToNearestPixel(CARD_GAP);

        // "a whole number of physical pixels" is the arithmetic claim
        // itself: `PixelRatio.roundToNearestPixel` picks the dp value
        // whose product with the device's own ratio is (as near as
        // floating-point allows) an integer.
        expect(snappedHeight * density).toBeCloseTo(Math.round(snappedHeight * density));
        expect(snappedGap * density).toBeCloseTo(Math.round(snappedGap * density));
      } finally {
        getSpy.mockRestore();
      }
    },
  );

  it.each(DEVICE_DENSITIES)(
    'renders an identical gap between every consecutive row pair at density %s, once snapped',
    (density) => {
      const getSpy = jest.spyOn(PixelRatio, 'get').mockReturnValue(density);

      try {
        const snappedHeight = PixelRatio.roundToNearestPixel(ROW_HEIGHT);
        const snappedGap = PixelRatio.roundToNearestPixel(CARD_GAP);

        const edges = roundedRowEdgesInPhysicalPixels(snappedHeight, snappedGap, 3, density);
        const [gap1, gap2] = consecutiveGapsInPhysicalPixels(edges);

        expect(gap1).toBe(gap2);
      } finally {
        getSpy.mockRestore();
      }
    },
  );

  it('reproduces the reported symptom without the fix, at densities where a card starting flush with the root shows it', () => {
    // proves the "identical gap once snapped" test above is not vacuously
    // true: run the exact same arithmetic against the *unsnapped* height
    // and gap (a card starting at dp 0, the simplification this file's own
    // simulation makes — see `DEVICE_DENSITIES`'s comment on why the real,
    // non-zero starting offset shifts which densities go uneven), and two
    // of the eight densities come back uneven.
    const UNEVEN_DENSITIES = [1.5, 3.5];

    for (const density of UNEVEN_DENSITIES) {
      const edges = roundedRowEdgesInPhysicalPixels(ROW_HEIGHT, CARD_GAP, 3, density);
      const [gap1, gap2] = consecutiveGapsInPhysicalPixels(edges);

      expect(gap1).not.toBe(gap2);
    }
  });
});
