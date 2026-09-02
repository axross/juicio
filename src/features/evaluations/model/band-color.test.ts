import { bandColorAt, barColors, type BandAnchors } from './band-color';

// simple, distinguishable anchors rather than this project's real theme
// values — this module is pure and takes anchors as plain arguments (see
// its own doc comment), so a test has no reason to reach into
// `../../../core/theme/tokens.ts` at all.
const ANCHORS: BandAnchors = {
  trash: '#0000ff', // blue
  marginal: '#00ff00', // green
  value: '#ff8000', // orange
  nuts: '#ff0000', // red
};

describe('bandColorAt', () => {
  it('lands exactly on the trash anchor at position 0', () => {
    expect(bandColorAt(0, ANCHORS)).toBe('#0000ff');
  });

  it('lands exactly on the nuts anchor at position 1', () => {
    expect(bandColorAt(1, ANCHORS)).toBe('#ff0000');
  });

  it('lands exactly on the marginal anchor at position 1/3', () => {
    expect(bandColorAt(1 / 3, ANCHORS)).toBe('#00ff00');
  });

  it('lands exactly on the value anchor at position 2/3', () => {
    expect(bandColorAt(2 / 3, ANCHORS)).toBe('#ff8000');
  });

  it('interpolates between two anchors mid-segment, never snapping to either', () => {
    const midTrashToMarginal = bandColorAt(1 / 6, ANCHORS);

    expect(midTrashToMarginal).not.toBe(ANCHORS.trash);
    expect(midTrashToMarginal).not.toBe(ANCHORS.marginal);
    // halfway between #0000ff and #00ff00 is #008080.
    expect(midTrashToMarginal).toBe('#008080');
  });

  it('clamps a position outside [0, 1] to the nearer end anchor', () => {
    expect(bandColorAt(-0.5, ANCHORS)).toBe('#0000ff');
    expect(bandColorAt(1.5, ANCHORS)).toBe('#ff0000');
  });
});

describe('barColors', () => {
  it('returns one flat colour per bar, with the endpoints on the first and last anchors', () => {
    for (const count of [20, 16, 12, 8]) {
      const colors = barColors(count, ANCHORS);

      expect(colors).toHaveLength(count);
      expect(colors[0]).toBe(ANCHORS.trash);
      expect(colors[colors.length - 1]).toBe(ANCHORS.nuts);
    }
  });

  it('is monotonic along the axis: every colour differs from its neighbour', () => {
    const colors = barColors(20, ANCHORS);

    for (let i = 1; i < colors.length; i++) {
      expect(colors[i]).not.toBe(colors[i - 1]);
    }
  });

  it('is evenly spaced, agreeing with bandColorAt at the same fraction', () => {
    const colors = barColors(20, ANCHORS);

    for (let i = 0; i < colors.length; i++) {
      expect(colors[i]).toBe(bandColorAt(i / 19, ANCHORS));
    }
  });

  it('returns exactly one colour, at the ramp start, for a count of 1', () => {
    expect(barColors(1, ANCHORS)).toEqual(['#0000ff']);
  });
});
