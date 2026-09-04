import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the removal affordance on each applied-filter pill the Preset list screen
 * shows (issue #176). `X` is not one of the fourteen icons
 * docs/conventions/design-system.md's Icon Set catalogues, so it is
 * transcribed the same way `./chevron-left-icon.tsx` was — from Lucide's own
 * published `x` path (`M18 6 6 18` / `m6 6 12 12`, confirmed against
 * `raw.githubusercontent.com/lucide-icons/lucide`'s `main` branch), at this
 * project's 1.5 stroke weight, mirroring every other icon in this directory.
 */
export function XIcon({
  color,
  size = 24,
  style,
  ...props
}: ComponentProps<typeof Svg> & IconProps) {
  return (
    // `style` is pulled out of the rest spread rather than left to ride in
    // it: this icon sets no style of its own to array-merge with today, but
    // a spread `style` would replace one the moment it gained one. every
    // other rest prop, `testID` included, spreads last (default ordering),
    // so a caller can override this icon's own defaults (`width`/`height`,
    // say).
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} {...props}>
      <Path
        d="M18 6L6 18"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 6L18 18"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
