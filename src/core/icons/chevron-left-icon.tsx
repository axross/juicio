import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * every back affordance `NavBar` draws (Feedback, Language, and Theme).
 * `Chevron Left` is one of the fourteen icons
 * docs/conventions/design-system.md's Icon Set catalogues,
 * but no frame this phase reads (`600:31803`, `518:29363`, `600:29952`)
 * draws it, so it cannot be exported. transcribed instead from Lucide's own
 * published `chevron-left` path — design-system.md records the icon set as
 * (unconfirmed but strongly) Lucide — at this project's 1.5 stroke weight,
 * matching every sibling icon in this directory that *was* exported rather
 * than Lucide's own default 2.
 */
export function ChevronLeftIcon({
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
        d="M15 18L9 12L15 6"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
