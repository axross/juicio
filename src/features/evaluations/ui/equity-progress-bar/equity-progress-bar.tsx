import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

// "thin" is the only constraint `docs/specs/equity-analysis.md`'s Screen
// States section states for this bar ("a thin lime progress bar sits
// directly beneath the board") — no pixel height is drawn in the design
// file for it. this project's original 4px height was a first-cut,
// unmeasured implementer's choice; issue #142 replaced it with this 2px
// value, chosen at plan approval as the thinnest of three rendered options
// that still reads clearly as a hairline indicator against the board.
const BAR_HEIGHT = 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * the Analyze screen's "Calculating" progress bar (issue #103,
 * docs/specs/equity-analysis.md's Screen States section): a thin track
 * directly beneath the board, filled left-to-right by `progress`. Rendered
 * only while `../../adapter/use-equity-evaluation.ts`'s own status reads
 * `'calculating'` — this component itself holds no visibility logic of its
 * own, the same "the caller decides whether to render me" shape every
 * conditionally-rendered sibling in this feature already follows (`
 * ../analyze-screen/analyze-screen.tsx` is this component's only caller).
 *
 * the fill's own colour is `theme.colors.solid.accent.rest` — this
 * project's brand-exact lime fill, the same token path the Analyze empty
 * state's own `+ New Player` pill button already reaches for
 * (`src/shared/ui/button/button.tsx`) — reused rather than a new token,
 * since both are the same "lime, filled" affordance the design's own
 * accent role already names.
 */
export function EquityProgressBar({
  progress,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  /** the in-flight evaluation job's own completion fraction — `../../
   * adapter/use-equity-evaluation.ts`'s own `useEquityEvaluationProgress()`,
   * read by this component's caller. clamped to `[0, 1]` here rather than
   * trusted, since nothing upstream of this component enforces the range
   * itself. */
  progress: number;
}) {
  return (
    <View style={[styles.track, style]} testID={testID} {...props}>
      <View
        style={[styles.fill, { width: `${clamp01(progress) * 100}%` }]}
        testID={testID ? 'fill' : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    width: '100%',
    height: BAR_HEIGHT,
    backgroundColor: theme.colors.component.neutral.rest,
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.solid.accent.rest,
  },
}));
