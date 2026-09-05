import { render, screen } from '@testing-library/react-native';

import { SuitednessIcon } from './suitedness-icon';

// proves docs/conventions/component-styling.md's `Svg` row is real for
// `SuitednessIcon`'s own root `Svg`, not merely type-level — mirrors
// `rank-icon.test.tsx`'s and `suit-icon.test.tsx`'s own style-merge test.
// this project's own reanimated-free `react-native-svg` render exposes no
// query for the underlying `<Path>`'s own `d` attribute under this RNTL
// version (`../playing-card.test.tsx`'s own comment on why that seam is
// mocked rather than queried there), so this file — like its two
// siblings — pins only the one thing that is observable: the caller-supplied
// `style` reaching this icon's own root.
describe('<SuitednessIcon /> style', () => {
  it('applies a caller-supplied style to its own root', () => {
    render(
      <SuitednessIcon
        suitedness="suited"
        color="#000000"
        testID="suitedness"
        style={{ opacity: 0.5 }}
      />,
    );

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('suitedness').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});
