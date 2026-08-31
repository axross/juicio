import { render, screen } from '@testing-library/react-native';

import { RankIcon } from './rank-icon';

// proves docs/conventions/component-styling.md's `Svg` row is real for
// `RankIcon`'s own root `Svg`, not merely type-level — `style` used to ride
// the rest spread undestructured (issue #94), which would have silently
// replaced this icon's own style the moment it gained one.
describe('<RankIcon /> style', () => {
  it('applies a caller-supplied style to its own root', () => {
    render(<RankIcon rank="A" color="#000000" testID="rank" style={{ opacity: 0.5 }} />);

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('rank').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});
