import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * `@/shared/ui/submit-bar/submit-bar.tsx`'s own icon for a Save action
 * (issue #177's Preset editor) — no icon in `src/core/icons/` reads as
 * "save" or "check" before this change, and the Preset editor frame itself
 * draws no save action at all for this icon to be transcribed from (see
 * that plan's own UI design section), the same gap `submit-bar.tsx`'s own
 * `SpeechBubbleIcon` comment already names for "send". Transcribed instead
 * from Lucide's own published `check` path (`M20 6 9 17l-5-5`, confirmed
 * against `raw.githubusercontent.com/lucide-icons/lucide`'s `main` branch),
 * at this project's 1.5 stroke weight, mirroring `./x-icon.tsx`'s identical
 * precedent for drawing an icon this project needs but the design file does
 * not.
 */
export function CheckIcon({
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
        d="M20 6L9 17L4 12"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
