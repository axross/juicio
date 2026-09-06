import { createHash } from 'node:crypto';

import { render, screen } from '@testing-library/react-native';

import { HOURGLASS_ILLUSTRATION_XML, HourglassIllustration } from './hourglass-illustration';

// mirrors `@/features/presets/ui/preset-list-screen/aa-corner-illustration.test.tsx`'s
// identical shape for this project's other authored-in-code `SvgXml`
// illustration — proves `HourglassIllustration`'s own root accepts and
// applies a caller-supplied `testID` and `style`, per
// docs/conventions/component-styling.md's `Svg` row.
describe('<HourglassIllustration /> testID and style', () => {
  it('renders its root at the given testID and merges a caller-supplied style', () => {
    render(<HourglassIllustration testID="illustration" style={{ opacity: 0.5 }} />);

    const style = screen.getByTestId('illustration').props.style;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.flat(Infinity).filter(Boolean))
      : style;

    expect(flattenedStyle).toMatchObject({ opacity: 0.5 });
  });

  it('forwards a rest prop this project names nothing for, straight through to its own root', () => {
    render(<HourglassIllustration testID="illustration" accessibilityLabel="hourglass" />);

    expect(screen.getByTestId('illustration').props.accessibilityLabel).toBe('hourglass');
  });
});

// this illustration's markup in code must stay byte-identical to the SVG
// recorded here as its own source of truth — a drift a type check or a
// markup-content assertion could not catch, since either would still pass
// against a bit-for-bit-altered string.
const HOURGLASS_SVG_SHA256 = 'a221a93cadc368ca0e34a8375b0ea39ca4714b5bf356929a3858a8b9e412a62c';

describe('<HourglassIllustration /> markup', () => {
  it('keeps its exported markup byte-identical to the SVG this digest was recorded against', () => {
    expect(createHash('sha256').update(HOURGLASS_ILLUSTRATION_XML).digest('hex')).toBe(
      HOURGLASS_SVG_SHA256,
    );
  });
});
