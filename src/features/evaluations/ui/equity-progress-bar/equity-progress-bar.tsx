import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';

// "thin" is the only constraint `docs/specs/equity-analysis.md`'s Screen
// States section states for this bar's own visual weight — that section
// also records this value's own history. `../analyze-screen/
// analyze-screen.tsx` reserves a slot of exactly this height beneath the
// board at all times, so this constant is the single source of truth both
// computations share, and neither can silently drift from this bar's own
// actual height.
export const BAR_HEIGHT = 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * the Analyze screen's "Calculating" progress bar
 * (docs/specs/equity-analysis.md's Screen States section): a thin track
 * directly beneath the board, filled left-to-right by the in-flight
 * evaluation's own completion fraction. Rendered only while `../../adapter/
 * use-equity-evaluation.ts`'s own status reads `'calculating'` — this
 * component itself holds no visibility logic of its own, the same "the
 * caller decides whether to render me" shape every conditionally-rendered
 * sibling in this feature already follows (`../analyze-screen/
 * analyze-screen.tsx` is this component's only caller).
 *
 * the fill's own colour is `theme.colors.solid.accent.rest` — this
 * project's brand-exact lime fill, the same token path the Analyze players
 * section's own add-player FAB already reaches for
 * (`../new-player-fab/new-player-fab.tsx`) — reused rather than a new
 * token, since both are the same "lime, filled" affordance the design's
 * own accent role already names.
 *
 * **this component reads its own progress directly off `../../adapter/
 * use-equity-evaluation.ts`'s own store, rather than taking it as a prop —
 * a deliberate, narrow exception to docs/conventions/component-contracts.md's
 * "Input by Prop, Output by Callback" rule.** See
 * docs/decisions/2026-09-05-subscribe-equityprogressbar-directly-to-the-equity-store.md
 * for why. It subscribes to the store directly
 * (`useEquityEvaluationStore.subscribe` below, cleaned up
 * on unmount), writing straight into a Reanimated shared value, so a
 * progress tick reaches this component's own fill with no React re-render
 * anywhere — not of `AnalyzeScreen`, not of this component itself.
 *
 * **the fill's own value is written directly, not eased.** unlike this
 * project's other Reanimated surfaces (`../player-row/player-row.tsx`,
 * `../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`), this
 * component calls no `withTiming`/`withSpring` — `@/core/motion/tokens.ts`'s
 * own tokens are deliberately not reached for here. this bar's own visual
 * cadence is one width update per progress tick, unsmoothed: introducing an
 * eased tween between ticks would be a visual change, not a re-render fix,
 * to a bar whose visual communication this component's own re-render
 * mechanism is not meant to alter.
 */
export function EquityProgressBar({ testID, style, ...props }: ComponentProps<typeof View>) {
  // this component's own copy of the store's progress, `[0, 1]` — seeded
  // from whatever `../../adapter/use-equity-evaluation.ts`'s own store
  // already holds at the moment this component first renders, not `0`:
  // `../analyze-screen/analyze-screen.tsx` only mounts this component once
  // `useEquityEvaluationStatus()` already reads `'calculating'`, which can
  // already be some way through a run by the time this component's own
  // first render happens, so starting at a hardcoded `0` would flash an
  // empty bar for one frame before the subscription below ever fires.
  const fillFraction = useSharedValue(clamp01(useEquityEvaluationStore.getState().progress));

  useEffect(() => {
    // a subscription scoped to this component's own lifetime, unsubscribed
    // on unmount below — unlike `use-equity-evaluation.ts`'s own
    // module-scope `.subscribe()` calls (registered once, for the whole
    // app's lifetime, and never unsubscribed, since that store itself is
    // permanent), this component is mounted and unmounted by its caller as
    // `useEquityEvaluationStatus()` itself changes, and a listener left
    // registered past an unmount would keep writing into a shared value
    // nothing reads any more.
    const unsubscribe = useEquityEvaluationStore.subscribe((state, previousState) => {
      if (state.progress === previousState.progress) {
        // a tick that changed `results`, `status`, or `impossibleSignal`
        // but not `progress` itself — nothing this component reads
        // changed, so skip writing (and, were this eased, restarting) an
        // animation toward the same target it is already at.
        return;
      }
      fillFraction.value = clamp01(state.progress);
    });

    return unsubscribe;
    // `fillFraction` is a stable shared-value ref — see
    // `../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`'s own
    // `GridCellComponent` for the same suppression on the same kind of ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedFillStyle = useAnimatedStyle(() => ({ width: `${fillFraction.value * 100}%` }));

  return (
    <View style={[styles.track, style]} testID={testID} {...props}>
      <Animated.View
        style={[styles.fill, animatedFillStyle]}
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
