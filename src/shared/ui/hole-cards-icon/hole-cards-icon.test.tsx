import { render, screen } from '@testing-library/react-native';
import { Path, Rect } from 'react-native-svg';

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
  it('draws both cards as a 1.5px round stroke in the given colour, with no fill of their own', () => {
    render(<HoleCardsIcon color="#123456" testID="hole-cards" />);

    // the root's own `fill="none"` is a plain prop this component passes
    // literally, unlike a solid colour value.
    expect(screen.getByTestId('hole-cards').props.fill).toBe('none');

    // `UNSAFE_getAllByType` reads the props this project's own JSX passed
    // to each composite `Rect`/`Path` element directly, before
    // `react-native-svg`'s host-component prop extraction packs a solid
    // colour and the cap/join keywords into its own internal
    // representation (see docs/conventions/testing.md's "What a Unit Test
    // Asserts About a Third-Party Library") — so `stroke`, `strokeLinecap`,
    // and `strokeLinejoin` below are read back exactly as this component
    // wrote them, not as the library goes on to process them.
    for (const shape of [
      ...screen.UNSAFE_getAllByType(Rect),
      ...screen.UNSAFE_getAllByType(Path),
    ]) {
      expect(shape.props.stroke).toBe('#123456');
      expect(shape.props.strokeWidth).toBe(1.5);
      expect(shape.props.strokeLinecap).toBe('round');
      expect(shape.props.strokeLinejoin).toBe('round');
      expect(shape.props.fill).toBeUndefined();
    }
  });
});
