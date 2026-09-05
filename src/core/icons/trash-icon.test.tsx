import { render, screen } from '@testing-library/react-native';

import { TrashIcon } from './trash-icon';

// proves `TrashIcon`'s own root `Svg` accepts and applies a caller-supplied
// `style`, per docs/conventions/component-styling.md's `Svg` row.
describe('<TrashIcon /> style', () => {
  it('accepts a caller-supplied style and applies it to its own root', () => {
    render(<TrashIcon color="#000000" testID="trash" style={{ opacity: 0.5 }} />);

    // `react-native-svg`'s own `Svg` host component always renders `style`
    // as an array carrying its own base styles alongside whatever reaches
    // it — this flattens that array the same way every other component
    // test here reads a merged style back.
    const style = screen.getByTestId('trash').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });
});
