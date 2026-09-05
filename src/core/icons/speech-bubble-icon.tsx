import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the `About` section's `Feedback` row icon — a speech bubble, catalogued as
 * `Baloon` (the design file's own misspelling) in
 * docs/conventions/design-system.md's Icon Set. path data transcribed
 * verbatim from the design file's own icon symbol (`get_design_context` on
 * the Settings frame, `600:31803`).
 *
 * not one of the six icons phase 2's brief enumerates for this directory —
 * the About section it belongs to is enumerated separately in the same
 * brief and needs this icon to render, so it is built alongside the six; see
 * the phase-2 receipt for that reconciliation.
 */
export function SpeechBubbleIcon({
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
        d="M3 20L4.3 16.1C1.976 12.663 2.874 8.228 6.4 5.726C9.926 3.225 14.99 3.43 18.245 6.206C21.5 8.983 21.94 13.472 19.274 16.707C16.608 19.942 11.659 20.922 7.7 19L3 20Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
