import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';

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
 * "Input by Prop, Output by Callback" rule** (issue #162's own plan). the
 * evaluation's own progress store updates roughly ten times a second while
 * calculating; before this change, `../analyze-screen/analyze-screen.tsx`
 * read it at the top of the whole screen and handed it down as this
 * component's own `progress` prop, which meant every one of those ticks
 * re-rendered the *entire* screen — recreating `PlayerList`'s own JSX and
 * cascading into every player row's own, considerably more expensive render
 * body (gesture handlers, animated styles, accessibility labels) — purely
 * to update this one thin bar. This component now subscribes to the store
 * directly instead (`useEquityEvaluationStore.subscribe` below, cleaned up
 * on unmount), writing straight into a Reanimated shared value, so a
 * progress tick reaches this component's own fill with no React re-render
 * anywhere — not of `AnalyzeScreen`, not of this component itself. the
 * trade this makes explicit: this component's contract is no longer fully
 * legible from its own props type alone (its props type carries no
 * `progress`), the exact cost docs/conventions/component-contracts.md's own
 * rule exists to avoid — accepted here, narrowly, because the rule's normal
 * mechanism (a prop) is what caused the re-render cascade this change
 * exists to fix in the first place; a component whose entire purpose is
 * reacting to a fast-changing external value on the UI thread, without
 * paying a React render for each change, cannot receive that value through
 * a prop and still avoid one.
 *
 * **the fill's own value is written directly, not eased.** unlike this
 * project's other Reanimated surfaces (`../player-row/player-row.tsx`,
 * `../../../../shared/ui/hand-range-pane/hand-range-pane.tsx`), this
 * component calls no `withTiming`/`withSpring` — `@/core/motion/tokens.ts`'s
 * own tokens are deliberately not reached for here. this bar's own visual
 * cadence — one width update per progress tick, unsmoothed — is exactly
 * what it already was before this change (a plain re-rendered `%` width);
 * issue #162's own plan is explicit that only *how* this component
 * re-renders changes, never *what it visually communicates*, so introducing
 * a new eased tween between ticks here would be an unasked-for visual
 * change, not a re-render fix.
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
