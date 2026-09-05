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
    // `style` is destructured out of the rest spread so a future base style
    // on this `Svg` can merge with it, rather than a caller's `style`
    // silently replacing it via the spread; other props, `testID` included,
    // spread last so a caller can override this icon's own `width`/`height`
    // defaults.
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
