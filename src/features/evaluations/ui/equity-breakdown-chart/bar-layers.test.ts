import type { PointsArray } from 'victory-native';

import { barLayers } from './bar-layers';

// plain point literals, not a real Victory Native scale's output — this
// module reads no field but `x`/`y`/`xValue`/`yValue`, and its own contract
// (see its doc comment) does not depend on what a real scale would compute
// for them.
function point(x: number, y: number): PointsArray[number] {
  return { x, xValue: x, y, yValue: y };
}

const POINTS: PointsArray = [point(0, 10), point(1, 40), point(2, 25), point(3, 5)];
const COLORS = ['#111111', '#222222', '#333333', '#444444'];

describe('barLayers', () => {
  it('returns exactly one layer per point', () => {
    expect(barLayers(POINTS, COLORS)).toHaveLength(POINTS.length);
  });

  it("gives each layer only its own bar's point, never the full array", () => {
    const layers = barLayers(POINTS, COLORS);

    for (let i = 0; i < POINTS.length; i++) {
      expect(layers[i].points).toHaveLength(1);
      expect(layers[i].points).toEqual([POINTS[i]]);
    }
  });

  it('never rewrites a point to hide it — the y value that survives is the real one', () => {
    const layers = barLayers(POINTS, COLORS);

    // this is exactly what a `{ ...entry, y: 0 }` hiding trick would have
    // broken: every layer's own point keeps the pixel y its bar was
    // actually scaled to, not a baseline-flattening 0.
    for (let i = 0; i < POINTS.length; i++) {
      expect(layers[i].points[0].y).toBe(POINTS[i].y);
    }
  });

  it('pairs each layer with its own colour, in the same order the colours were given', () => {
    const layers = barLayers(POINTS, COLORS);

    expect(layers.map((layer) => layer.color)).toEqual(COLORS);
  });

  it('carries exactly one colour per layer, never more than one', () => {
    const layers = barLayers(POINTS, COLORS);

    for (const layer of layers) {
      expect(typeof layer.color).toBe('string');
    }
  });
});
