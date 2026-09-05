import type { ComponentProps } from 'react';
import { Path, Rect, Svg } from 'react-native-svg';

import type { IconProps } from '@/core/icons/icon-props';

/** the hand-range icon: a 2×2 grid with off-centre dividers, drawn as a 24×24 stroke icon in the icon set's own style (docs/conventions/design-system.md's Icon Set). */
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
      />
      <Path
        d="M10 3.5v17M3.5 10.5h17"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
