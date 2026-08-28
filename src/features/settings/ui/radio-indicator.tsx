import { Circle, Svg } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

const SIZE = 20;
/** matches the design's exported radio asset: a 9.25px-radius ring (1.5px
 * stroke) and, when selected, a 5px-radius filled dot, both centred in the
 * 20×20 box. */
const RING_RADIUS = 9.25;
const DOT_RADIUS = 5;
const CENTER = SIZE / 2;

type RadioIndicatorProps = {
  selected: boolean;
};

/**
 * the 20×20 radio visual `Language` and `Theme` rows share. selected uses
 * `text.accent.brand` (tokens.ts's theme-aware brand lime) for both the
 * ring and the dot, so it stays exactly `#BDEE63` in dark and switches to
 * the legible `#5C7C2F` in light rather than the raw `lime/9` fill
 * disappearing on a near-white row.
 *
 * unselected strokes `border.neutral.unselectedControl` (tokens.ts) — the
 * design's own literal `#687066` in dark, one Radix step further (light's
 * step 10) to clear the 3:1 floor in light. its fill,
 * `component.neutral.restAlpha`, is the token-based approximation of the
 * design's literal `#002000` at `0.0627` opacity: in the light theme
 * `restAlpha` (`oliveA/3`, `#00200010`) is that exact value, but in the dark
 * theme it resolves to `oliveDarkA/3` (`#f4f5f312`, a near-white fill at
 * ~4.7% opacity) — a materially different colour and opacity from the
 * design's literal fill, which the design file itself (dark-only, no light
 * frame exists) actually specifies. see tokens.ts for the alpha-ramp
 * rationale this approximation keeps.
 */
export function RadioIndicator({ selected }: RadioIndicatorProps) {
  const { theme } = useUnistyles();

  if (selected) {
    return (
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          stroke={theme.colors.text.accent.brand}
          strokeWidth={1.5}
          fill="none"
        />
        <Circle cx={CENTER} cy={CENTER} r={DOT_RADIUS} fill={theme.colors.text.accent.brand} />
      </Svg>
    );
  }

  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Circle
        cx={CENTER}
        cy={CENTER}
        r={RING_RADIUS}
        stroke={theme.colors.border.neutral.unselectedControl}
        strokeWidth={1.5}
        fill={theme.colors.component.neutral.restAlpha}
      />
    </Svg>
  );
}
