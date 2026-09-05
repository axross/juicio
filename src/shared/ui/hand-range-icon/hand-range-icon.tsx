import type { ComponentProps } from 'react';
import { Path, Rect, Svg } from 'react-native-svg';

import type { IconProps } from '@/core/icons/icon-props';

// lives under `src/shared/ui/hand-range-icon/`, not `src/core/icons/`: a
// hand range icon names a poker concept — a set of starting hands, the same
// thing docs/specs/hand-ranges.md's 13×13 grid represents — and
// `src/core/icons/` is deliberately feature-agnostic infrastructure with no
// domain meaning of its own (docs/conventions/directory-structure.md's "What
// core/ Is For"). It has no single owning component the way
// `src/shared/ui/playing-card/icons/`'s icons do, so it gets its own
// one-component directory instead of living inside another component's own
// `icons/` folder.

/**
 * a stroke redraw of the AquaIcons font's `grid` (U+E808) glyph
 * (https://github.com/axross/aqua/blob/master/assets/fonts/AquaIcons.ttf),
 * drawn in this project's own icon-set style — 24×24, 1.5px stroke, round
 * caps and joins (docs/conventions/design-system.md's Icon Set) — rather
 * than imported as the font's own filled path, per issue #257. A 2×2 grid
 * with the glyph's own off-centre dividers: a narrower first column and a
 * shorter first row.
 */
export function HandRangeIcon({
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
        x={3.5}
        y={3.5}
        width={17}
        height={17}
        rx={2.5}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        testID={testID ? `${testID}-frame` : undefined}
      />
      <Path
        d="M10 3.5v17M3.5 10.5h17"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        testID={testID ? `${testID}-dividers` : undefined}
      />
    </Svg>
  );
}
