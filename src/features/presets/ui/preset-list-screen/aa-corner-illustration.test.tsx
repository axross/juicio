import { createHash } from 'node:crypto';

import { render, screen } from '@testing-library/react-native';
import { SvgXml } from 'react-native-svg';

import { SharkIllustration } from '@/shared/ui/empty-state/shark-illustration';

import { AA_CORNER_ILLUSTRATION_XML, AaCornerIllustration } from './aa-corner-illustration';

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

// this illustration's markup in code must stay byte-identical to the SVG
// recorded here as its own source of truth — a drift a type check or a
// markup-content assertion could not catch, since either would still pass
// against a bit-for-bit-altered string.
const AA_CORNER_SVG_SHA256 = '4e680856983cc8ffa15c988bb762bbb952c48ae08049062ff33376221f27d007';

describe('<AaCornerIllustration /> markup', () => {
  it('keeps its exported markup byte-identical to the SVG this digest was recorded against', () => {
    expect(createHash('sha256').update(AA_CORNER_ILLUSTRATION_XML).digest('hex')).toBe(
      AA_CORNER_SVG_SHA256,
    );
  });

  // the design doc comment above `AaCornerIllustration` records that this
  // canvas matches `SharkIllustration`'s own exactly (no design-file node
  // fixes this component's own size) — this proves the two `SvgXml`
  // instances actually agree, on both the props this project passes and the
  // `viewBox` each one's own markup opens with, rather than trusting the
  // comment alone.
  it('renders on the same canvas as the shark illustration', () => {
    const aaCorner = render(<AaCornerIllustration />);
    const aaCornerSvgXml = aaCorner.UNSAFE_getByType(SvgXml);

    const shark = render(<SharkIllustration />);
    const sharkSvgXml = shark.UNSAFE_getByType(SvgXml);

    expect(aaCornerSvgXml.props.width).toBe(sharkSvgXml.props.width);
    expect(aaCornerSvgXml.props.height).toBe(sharkSvgXml.props.height);

    const viewBoxOf = (xml: string) => xml.match(/viewBox="([^"]+)"/)?.[1];

    expect(viewBoxOf(AA_CORNER_ILLUSTRATION_XML)).toBe('0 0 174 148.311');
    expect(viewBoxOf(AA_CORNER_ILLUSTRATION_XML)).toBe(viewBoxOf(sharkSvgXml.props.xml));
  });

  // the shark's own doc comment fixes every colour in both themes, since a
  // decorative illustration drawn only in olive-scale greys has no
  // theme-dependent legibility problem — this asserts the AA-corner artwork
  // was drawn under that same constraint: a fixed three-value palette, none
  // of it a theme-reactive primitive.
  it('uses only the fixed three-colour palette, with none of the theme-reactive primitives the shark also avoids', () => {
    const fills = [...AA_CORNER_ILLUSTRATION_XML.matchAll(/fill="([^"]*)"/g)].map(
      (match) => match[1],
    );

    expect(new Set(fills)).toEqual(new Set(['none', '#212220', '#687066']));
    expect(AA_CORNER_ILLUSTRATION_XML).not.toContain('currentColor');
    expect(AA_CORNER_ILLUSTRATION_XML).not.toContain('url(');
    expect(AA_CORNER_ILLUSTRATION_XML).not.toContain('stroke=');
    expect(AA_CORNER_ILLUSTRATION_XML).not.toContain('<linearGradient');
    expect(AA_CORNER_ILLUSTRATION_XML).not.toContain('<radialGradient');
  });
});

// a fourth test asserting identical output across the light and dark theme
// was scoped for this file, mirroring `theme-screen.test.tsx`'s own
// `UnistylesRuntime`-driven theme switch. That precedent doesn't reach this
// component: `AaCornerIllustration` calls no `useUnistyles()`/`useStyles()`
// hook and reads no theme value at all, so there is no theme-dependent
// code path for a runtime switch to exercise, and the mocked runtime's own
// `setTheme` (`react-native-unistyles/mocks`) is a no-op that never
// notifies a listening component regardless (`../../../settings/ui/
// theme-screen.test.tsx`'s own comment on the same mock). The markup test
// above already proves the fixed-palette property that would make such a
// render comparison meaningful, so this test is not added.
