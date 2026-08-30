import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the disclosure chevron on the Settings screen's `Language` and `Theme`
 * rows, and on `About`'s `Feedback` row (issue #76). `Chevron Right` is one
 * of the fourteen icons docs/conventions/design-system.md's Icon Set
 * catalogues, but no frame this phase reads draws it in use, so it is
 * transcribed the same way `./chevron-left-icon.tsx` was — from Lucide's
 * own published `chevron-right` path, at this project's 1.5 stroke weight,
 * mirroring `ChevronLeftIcon` exactly.
 */
export function ChevronRightIcon({
  color,
  size = 24,
  testID,
  ...props
}: ComponentProps<typeof Svg> & IconProps) {
  return (
    // rest props spread last (default ordering): a caller can override this
    // icon's own defaults (`width`/`height`, say) via a directly-passed
    // prop.
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={testID} {...props}>
      <Path
        d="M9 18L15 12L9 6"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
