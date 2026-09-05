import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the disclosure affordance on each of the Preset list screen's four filter
 * chips (issue #176), open or closed. `Chevron Down` is one of the fourteen
 * icons docs/conventions/design-system.md's Icon Set catalogues, but no
 * frame this phase reads draws it, so it cannot be exported. transcribed
 * instead from Lucide's own published `chevron-down` path (`m6 9 6 6 6-6`,
 * confirmed against `raw.githubusercontent.com/lucide-icons/lucide`'s `main`
 * branch), at this project's 1.5 stroke weight, mirroring `ChevronRightIcon`
 * and `ChevronLeftIcon` exactly.
 */
export function ChevronDownIcon({
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
        d="M6 9L12 15L18 9"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
