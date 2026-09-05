import { render, screen } from '@testing-library/react-native';

import { HoleCardsIcon } from './hole-cards-icon';

// proves docs/conventions/component-styling.md's `Svg` row is real for
// `HoleCardsIcon`'s own root `Svg`, not merely type-level — mirrors
// `src/core/icons/trash-icon.test.tsx`'s own style-merge test. Passing
// `testID` here also proves it reaches the root, since `getByTestId` only
// finds it once it does.
describe('<HoleCardsIcon /> style', () => {
  it('accepts a caller-supplied style and applies it to its own root', () => {
    render(<HoleCardsIcon color="#000000" testID="hole-cards" style={{ opacity: 0.5 }} />);

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('hole-cards').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});

describe('<HoleCardsIcon /> size', () => {
  it('renders at 24×24 when size is omitted', () => {
    render(<HoleCardsIcon color="#000000" testID="hole-cards" />);

    expect(screen.getByTestId('hole-cards').props.width).toBe(24);
    expect(screen.getByTestId('hole-cards').props.height).toBe(24);
  });

  it('renders at the given size when one is passed', () => {
    render(<HoleCardsIcon color="#000000" size={32} testID="hole-cards" />);

    expect(screen.getByTestId('hole-cards').props.width).toBe(32);
    expect(screen.getByTestId('hole-cards').props.height).toBe(32);
  });
});

describe('<HoleCardsIcon /> stroke', () => {
  it('draws both cards as a 1.5px round stroke, with no fill of their own', () => {
    render(<HoleCardsIcon color="#000000" testID="hole-cards" />);

    // the root's own `fill="none"` is a plain prop this component passes
    // literally, unlike a solid colour value — `react-native-svg` only
    // packs an actual colour into a processed integer, so this string
    // round-trips exactly as written.
    expect(screen.getByTestId('hole-cards').props.fill).toBe('none');

    for (const testID of ['hole-cards-back-card', 'hole-cards-front-card']) {
      const shape = screen.getByTestId(testID);

      expect(shape.props.strokeWidth).toBe(1.5);
      // `react-native-svg` 15.15.4's own `caps`/`joins` maps
      // (`node_modules/react-native-svg/src/lib/extract/extractStroke.ts`)
      // encode `round` as `1` for both `strokeLinecap` and
      // `strokeLinejoin` — verified against that file directly, since
      // there is no exported constant to import instead.
      expect(shape.props.strokeLinecap).toBe(1);
      expect(shape.props.strokeLinejoin).toBe(1);
      // a solid `stroke` colour is packed into a processed integer this
      // project's own precedent (`src/shared/ui/rank-pair-grid/
      // rank-pair-grid.test.tsx`'s and `src/shared/ui/playing-card/
      // playing-card.test.tsx`'s own comments) already treats as not
      // reliably readable back, so this only checks that a `stroke` was
      // actually passed, not which colour it resolved to.
      expect(shape.props.propList).toContain('stroke');
      // neither shape sets its own `fill` — the `propList` only carries
      // the props this component actually passed, so its absence here
      // means the shape inherits the root's own `fill="none"`.
      expect(shape.props.propList).not.toContain('fill');
    }
  });
});
