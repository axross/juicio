import type { ComponentProps } from 'react';
import { Path, Rect, Svg } from 'react-native-svg';

import type { IconProps } from '@/core/icons/icon-props';

// lives under `src/shared/ui/hole-cards-icon/`, not `src/core/icons/`: a
// hole-cards icon names a poker concept, and `src/core/icons/` is
// deliberately feature-agnostic infrastructure with no domain meaning of
// its own (docs/conventions/directory-structure.md's "What core/ Is For").

/**
 * a stroke redraw of the AquaIcons font's `card-pair` (U+E801) glyph
 * (https://github.com/axross/aqua/blob/master/assets/fonts/AquaIcons.ttf),
 * drawn in this project's own icon-set style — 24×24, 1.5px stroke, round
 * caps and joins (docs/conventions/design-system.md's Icon Set) — rather
 * than imported as the font's own filled path. Two tilted cards, fanned
 * symmetrically.
 */
export function HoleCardsIcon({
  color,
  size = 24,
  testID,
  style,
  ...props
}: ComponentProps<typeof Svg> & IconProps) {
  return (
    // `style` is destructured out of the rest spread so a future base style
    // on this `Svg` can merge with it, rather than a caller's `style`
    // silently replacing it via the spread; other props, `testID` included,
    // spread last so a caller can override this icon's own `width`/`height`
    // defaults.
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      testID={testID}
      style={style}
      {...props}
    >
      <Rect
        x={11}
        y={4.5}
        width={9}
        height={14}
        rx={2.2}
        transform="rotate(15 15.5 11.5)"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.2 4.9 6 6a2.2 2.2 0 0 0-1.5 2.7l2.5 9.3a2.2 2.2 0 0 0 2.7 1.5l1.7-.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
