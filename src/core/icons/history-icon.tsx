import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * The History tab's icon — a clock with a counter-clockwise arrow. Path data
 * transcribed verbatim from the design file's own history icon symbol
 * (`get_design_context` on the Analyze/Empty frame, `518:29363`).
 */
export function HistoryIcon({ color, size = 24, testID }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" testID={testID}>
      <Path
        d="M12 8V12L14 14"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.05 11C3.27409 8.80006 4.30026 6.75961 5.93273 5.26797C7.5652 3.77632 9.68969 2.93788 11.9009 2.91263C14.1121 2.88737 16.2552 3.67706 17.9213 5.13103C19.5874 6.585 20.6599 8.60148 20.9342 10.7957C21.2085 12.99 20.6653 15.2084 19.4084 17.0278C18.1514 18.8471 16.2686 20.14 14.1193 20.6599C11.9699 21.1797 9.70441 20.89 7.755 19.8461C5.80558 18.8022 4.30872 17.0771 3.55 15M3.05 20V15H8.05"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
