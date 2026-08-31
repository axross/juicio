// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `playing-card.test.tsx`'s own matching
// comment for why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';

import { render, screen } from '@testing-library/react-native';

import { RANK_PAIR_GRID_PITCH, RANK_PAIR_GRID_RADIUS, RankPairGrid } from './rank-pair-grid';

describe('RankPairGrid geometry constants', () => {
  it('measures the design-file radius and pitch exactly, as numbers', () => {
    expect(RANK_PAIR_GRID_RADIUS).toBe(2.23077);
    expect(RANK_PAIR_GRID_PITCH).toBe(4.96154);
  });

  it('sums to exactly 64 across 13 diameters and 12 gaps', () => {
    const diameter = RANK_PAIR_GRID_RADIUS * 2;
    const gap = RANK_PAIR_GRID_PITCH - diameter;
    // the design's own figures are rounded to 5 decimal places, so their
    // sum lands a few hundred-thousandths off exactly 64 — `toBeCloseTo`'s
    // precision 3 (within 0.0005) absorbs that rounding without loosening
    // this far enough to miss a real drift in either constant.
    expect(13 * diameter + 12 * gap).toBeCloseTo(64, 3);
  });
});

describe('<RankPairGrid />', () => {
  it('renders every one of the 169 cells', async () => {
    await render(<RankPairGrid rankPairs={new Set()} size={64} testID="grid" />);

    // AA at (0, 0) and 22 at (12, 12) are the grid's own corners
    // (`../grid-coordinates.ts`'s own round-trip test already pins this
    // mapping; this only checks that both corners actually rendered).
    expect(screen.getByTestId('cell-AA')).toBeTruthy();
    expect(screen.getByTestId('cell-22')).toBeTruthy();
  });

  // `fill` is deliberately not asserted here — `../playing-card/
  // playing-card.test.tsx`'s own comment on why a colour prop isn't
  // reliably readable back off a rendered `react-native-svg` host element
  // (it packs a hex string into a processed integer) applies to `<Circle
  // fill={...}>` exactly the same way it does to that component's icons;
  // `opacity`, a plain number, is what actually distinguishes a selected
  // cell from an unselected one here, and is what this test asserts.
  it('draws a selected cell at full opacity and an unselected one at zero', async () => {
    await render(<RankPairGrid rankPairs={new Set(['AA'])} size={64} testID="grid" />);

    expect(screen.getByTestId('cell-AA').props.opacity).toBe(1);
    expect(screen.getByTestId('cell-22').props.opacity).toBe(0);
  });

  it('marks exactly the given range selected, for a known suited-ace selection', async () => {
    await render(<RankPairGrid rankPairs={new Set(['AKs', 'AQs'])} size={64} testID="grid" />);

    expect(screen.getByTestId('cell-AKs').props.opacity).toBe(1);
    expect(screen.getByTestId('cell-AQs').props.opacity).toBe(1);
    expect(screen.getByTestId('cell-AJs').props.opacity).toBe(0);
    expect(screen.getByTestId('cell-AKo').props.opacity).toBe(0);
  });

  it('places each circle at its measured radius, and at the row/column-derived centre', async () => {
    await render(<RankPairGrid rankPairs={new Set()} size={64} testID="grid" />);

    const topLeft = screen.getByTestId('cell-AA'); // row 0, col 0
    expect(topLeft.props.r).toBe(RANK_PAIR_GRID_RADIUS);
    expect(topLeft.props.cx).toBe(RANK_PAIR_GRID_RADIUS);
    expect(topLeft.props.cy).toBe(RANK_PAIR_GRID_RADIUS);

    const bottomRight = screen.getByTestId('cell-22'); // row 12, col 12
    expect(bottomRight.props.cx).toBeCloseTo(RANK_PAIR_GRID_RADIUS + 12 * RANK_PAIR_GRID_PITCH, 5);
    expect(bottomRight.props.cy).toBeCloseTo(RANK_PAIR_GRID_RADIUS + 12 * RANK_PAIR_GRID_PITCH, 5);
  });

  it('renders no testID on any cell when the caller passes none, keeping the grid opaque to that query', async () => {
    await render(<RankPairGrid rankPairs={new Set()} size={64} />);

    expect(screen.queryByTestId('cell-AA')).toBeNull();
  });
});

// proves docs/conventions/component-styling.md's `Svg` row is real for
// `RankPairGrid`'s own root `Svg`, not merely type-level — `style` used to
// ride the rest spread undestructured (issue #94), which would have
// silently replaced this grid's own style the moment it gained one.
describe('<RankPairGrid /> style', () => {
  it('applies a caller-supplied style to its own root', async () => {
    await render(
      <RankPairGrid rankPairs={new Set()} size={64} testID="grid" style={{ opacity: 0.5 }} />,
    );

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('grid').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});
