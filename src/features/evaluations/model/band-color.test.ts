import { bandColor, type BandAnchors } from './band-color';

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

describe('bandColor', () => {
  it('resolves each band to its own anchor colour, exactly, never an interpolation', () => {
    expect(bandColor('trash', ANCHORS)).toBe('#0000ff');
    expect(bandColor('marginal', ANCHORS)).toBe('#00ff00');
    expect(bandColor('value', ANCHORS)).toBe('#ff8000');
    expect(bandColor('nuts', ANCHORS)).toBe('#ff0000');
  });
});
