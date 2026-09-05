import { render, screen } from '@testing-library/react-native';

import { AaCornerIllustration } from './aa-corner-illustration';

// mirrors `../../../../core/icons/trash-icon.test.tsx`'s identical shape for
// `Svg`'s sibling root, `SvgXml` — proves `AaCornerIllustration`'s own root
// accepts and applies a caller-supplied `testID` and `style`, per
// docs/conventions/component-styling.md's `Svg` row.
describe('<AaCornerIllustration /> testID and style', () => {
  it('renders its root at the given testID and merges a caller-supplied style', () => {
    render(<AaCornerIllustration testID="illustration" style={{ opacity: 0.5 }} />);

    const style = screen.getByTestId('illustration').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });

  it('forwards a rest prop this project names nothing for, straight through to its own root', () => {
    render(<AaCornerIllustration testID="illustration" accessibilityLabel="chip" />);

    expect(screen.getByTestId('illustration').props.accessibilityLabel).toBe('chip');
  });
});
