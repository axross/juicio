import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the `+ New Player` button's icon — a filled plus, not a stroke icon like
 * every other icon in this directory. path data transcribed verbatim from
 * the design file's own `Icon/Plus` symbol (`get_design_context` on the
 * Analyze/Empty frame, `518:29363`).
 */
export function PlusIcon({
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
        d="M12.75 5C12.75 4.58579 12.4142 4.25 12 4.25C11.5858 4.25 11.25 4.58579 11.25 5V11.25H5C4.58579 11.25 4.25 11.5858 4.25 12C4.25 12.4142 4.58579 12.75 5 12.75H11.25V19C11.25 19.4142 11.5858 19.75 12 19.75C12.4142 19.75 12.75 19.4142 12.75 19V12.75H19C19.4142 12.75 19.75 12.4142 19.75 12C19.75 11.5858 19.4142 11.25 19 11.25H12.75V5Z"
        fill={color}
      />
    </Svg>
  );
}
