import { render, screen } from '@testing-library/react-native';

import { SuitIcon } from './suit-icon';

// proves docs/conventions/component-styling.md's `Svg` row is real for
// `SuitIcon`'s own root `Svg`, not merely type-level: `style` is pulled
// out of the rest spread and applied explicitly (see `suit-icon.tsx`'s own
// comment on why), so a caller-supplied `style` reaches the root instead
// of being silently replaced.
describe('<SuitIcon /> style', () => {
  it('applies a caller-supplied style to its own root', () => {
    render(<SuitIcon suit="s" color="#000000" testID="suit" style={{ opacity: 0.5 }} />);

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('suit').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});
